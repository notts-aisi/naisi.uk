/**
 * THE KAIROS REPORT (src/lib/surveys/kairosReport.ts): the questionnaire's
 * fourteen metrics for one programme, each figure with its n and the
 * response rate beside it, counterfactual figures labelled self-reported,
 * completions as the programme's lead decided who finished, and a metric the
 * site holds no data for saying what it needs.
 *
 * Two layers: the counting, run on a small made-up programme where every
 * number can be checked by hand; and the page, rendered over AGI Strategy
 * once its run is over (`tests/lib/ratingsWorld.mjs`) with a before survey,
 * one at the end and one six months on, as an admin and as nobody else.
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AFTER, AGI, B, ROUND, RUN, makeRatingsWorld, ratingsSeed } from "./lib/ratingsWorld.mjs";

const w = await makeRatingsWorld("__kairosReport");
const { buildKairosReport, nWords } = await w.loadTs(join("lib", "surveys", "kairosReport.ts"));
const { templateItems } = w.lib.templates;
const page = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "kairos", "[roundId]", "[programmeId]", "page.tsx"))).default;

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const choice = (optionId) => ({ type: "choice", optionId });
const choices = (...optionIds) => ({ type: "choices", optionIds });
const percent = (value) => ({ type: "percent", value });
const scale = (value) => ({ type: "scale", value });
const number = (value) => ({ type: "number", value });
const text = (value) => ({ type: "text", text: value });

/** Before: Amara at stage 1, 20%; Bea at stage 0, 10%; Dev at stage 2. */
const BEFORE = [
  { uid: "amara", answers: { q_c1: choice("o_stage1"), q_c2: percent(20), q_c4: scale(3), q_c5: scale(2), q_c6: number(1) } },
  { uid: "bea", answers: { q_c1: choice("o_stage0"), q_c2: percent(10) } },
  { uid: "dev", answers: { q_c1: choice("o_stage2") } },
];
/** At the end: Amara moved up to stage 3 and took a step; Bea stayed and took none. */
const END = [
  {
    uid: "amara",
    answers: {
      q_c1: choice("o_stage3"),
      q_c2: percent(50),
      q_c4: scale(5),
      q_c5: scale(4),
      q_c6: number(4),
      q_t1: choice("o_stage1"),
      q_t2: scale(2),
      q_t3: scale(2),
      q_c9: choices("o_event"),
      q_n1: choices("o_spar"),
      q_n2: choice("o_yes"),
      q_q1: scale(9),
    },
  },
  { uid: "bea", answers: { q_c1: choice("o_stage0"), q_c2: percent(10), q_c9: choices("o_none"), q_n1: choices("o_nothing"), q_n2: choice("o_maybe"), q_q1: scale(6) } },
];
/** Six months on: Amara at 50 to 90% of working time (0.7 FTE), 40% likely without it, applied to two and accepted by one. */
const SIX = [
  { uid: "amara", answers: { q_f2: choice("o_50to90"), q_a2: percent(40), q_f4_applied: text("SPAR\nMATS"), q_f4_accepted: text("SPAR"), q_c1: choice("o_stage4") } },
];

function input(over = {}) {
  return {
    programmeName: "AGI Strategy",
    kind: "fellowship",
    applications: 7,
    started: 6,
    atEnd: 6,
    finished: 4,
    finishRule: 4,
    lastDay: "Wed 9 Dec",
    surveys: [
      { stage: "before", name: "AGI Strategy: before", items: templateItems("before", "fellowship", null), answers: BEFORE, sent: 6 },
      { stage: "after", name: "AGI Strategy: after", items: templateItems("after", "fellowship", null), answers: END, sent: 6 },
      { stage: "followUp6", name: "AGI Strategy: six months on", items: templateItems("followUp6", "fellowship", null), answers: SIX, sent: 1 },
    ],
    rated: [{ uid: "amara", ratings: [{ f5: "strongYes" }, { f2: 3 }] }],
    sharing: new Set(["amara", "bea", "dev", "rahul", "sofia", "tariq"]),
    ...over,
  };
}

const metric = (report, id) => report.metrics.find((each) => each.id === id);
const figureOf = (report, id, label) => metric(report, id).figures.find((each) => each.label === label);

describe("the report counts", () => {
  test("the fourteen metrics, in the questionnaire's order", () => {
    const report = buildKairosReport(input());
    assert.deepEqual(
      report.metrics.map((each) => each.name),
      [
        "Funnel",
        "Response rate",
        "Career-stage shift",
        "Intention shift",
        "Concrete actions",
        "Onward steps",
        "AI safety FTE",
        "Counterfactual FTE",
        "Knowledge and network",
        "Top participants",
        "Organiser pipeline",
        "Research outputs",
        "Satisfaction",
        "Cost per outcome",
      ],
    );
  });

  test("every number carries its n beside it, and every survey figure its share of the people who started", () => {
    const report = buildKairosReport(input());
    for (const each of report.metrics) {
      for (const figure of each.figures) {
        assert.match(figure.n, /n = \d+|of the \d+ who (?:applied|started)/, `${each.name}: "${figure.label}" has no n`);
      }
    }
    assert.equal(nWords(3, 6), "n = 3 · 50% of the 6 who started");
    const surveyFigures = report.metrics.filter((each) => !["funnel", "top"].includes(each.id)).flatMap((each) => each.figures);
    assert.ok(surveyFigures.length > 10);
    assert.ok(surveyFigures.every((figure) => / of the 6 who started/.test(figure.n)), "a survey figure without its response rate");
  });

  test("the funnel, with completions as the programme's lead decided who finished", () => {
    const report = buildKairosReport(input());
    assert.equal(figureOf(report, "funnel", "Applied").value, "7");
    assert.equal(figureOf(report, "funnel", "Started").n, "86% of the 7 who applied");
    assert.equal(figureOf(report, "funnel", "Finished").value, "4");
    assert.equal(figureOf(report, "funnel", "Finished").n, "67% of the 6 who started");
    assert.match(metric(report, "funnel").note, /Who finished is the programme’s finished record: what its lead decided on the Overview, starting from at least 4 sessions\./);
    const early = buildKairosReport(input({ finished: null }));
    assert.equal(figureOf(early, "funnel", "Finished").value, "Not yet: the last session is on Wed 9 Dec");
  });

  test("the response rate is each survey's answers of the people who started", () => {
    const report = buildKairosReport(input());
    assert.deepEqual(
      metric(report, "responses").figures.map((each) => [each.label, each.value, each.n]),
      [
        ["Before the programme", "3 answers", "n = 3 · 50% of the 6 who started · sent to 6"],
        ["At the end", "2 answers", "n = 2 · 33% of the 6 who started · sent to 6"],
        ["Six months on", "1 answer", "n = 1 · 17% of the 6 who started · sent to 1"],
      ],
    );
  });

  test("the career stage and the intention pair by person, start to end, start to a follow-up, and against looking back", () => {
    const report = buildKairosReport(input());
    assert.deepEqual(
      metric(report, "stage").figures.map((each) => [each.label, each.value, each.n]),
      [
        ["Moved up at least one stage, start to end", "1 of 2 (50%)", "n = 2 · 33% of the 6 who started"],
        ["Moved up at least one stage, start to six months on", "1 of 1 (100%)", "n = 1 · 17% of the 6 who started"],
        ["Moved up at least one stage from where they look back on, at the end", "1 of 1 (100%)", "n = 1 · 17% of the 6 who started"],
      ],
    );
    assert.equal(figureOf(report, "intention", "Mean change in how likely they think it is, start to at the end").value, "+15 percentage points");
    // A name taken off pairs with nothing.
    const off = buildKairosReport(input({ surveys: input().surveys.map((survey) => ({ ...survey, answers: survey.answers.map((answer) => ({ ...answer, uid: null })) })) }));
    assert.equal(figureOf(off, "stage", "Moved up at least one stage, start to end").n, "n = 0 · 0% of the 6 who started");
  });

  test("actions, onward steps, FTE, the counterfactual labelled self-reported, knowledge and satisfaction", () => {
    const report = buildKairosReport(input());
    assert.equal(figureOf(report, "actions", "Took at least one new step since the programme started").value, "1 of 2 (50%)");
    assert.equal(figureOf(report, "onward", "Planning a named next step, at the end").value, "1 of 2 (50%)");
    assert.equal(figureOf(report, "onward", "Applied to a named programme or job, six months on").value, "1 of 1 (100%)");
    assert.equal(figureOf(report, "onward", "Accepted by one, six months on").value, "1 of 1 (100%)");
    assert.equal(figureOf(report, "fte", "AI safety FTE in all, six months on").value, "0.70 FTE");
    assert.equal(figureOf(report, "fte", "At 0.7 FTE or more, six months on").value, "1 person");
    const counterfactual = figureOf(report, "counterfactual", "Counterfactual FTE, six months on");
    assert.deepEqual([counterfactual.value, counterfactual.selfReported], ["0.42 FTE", true], "0.7 FTE times 60%, self-reported");
    assert.equal(figureOf(report, "counterfactual", "The same people unadjusted, six months on").value, "0.70 FTE");
    assert.match(metric(report, "counterfactual").note, /^Self-reported/);
    assert.ok(metric(report, "fte").figures.every((each) => !each.selfReported), "only the counterfactual is self-reported");
    assert.equal(figureOf(report, "knowledge", "Median change in explaining the risk (1 to 7), start to end").value, "+2");
    assert.equal(figureOf(report, "knowledge", "Median change in people they could ask for advice, start to end").value, "+3");
    assert.equal(figureOf(report, "knowledge", "Median change in explaining the risk, against looking back, at the end").value, "+3");
    assert.equal(figureOf(report, "satisfaction", "Net promoter score").value, "0", "a 9 and a 6: one promoter, one detractor");
  });

  test("top participants count each person once, and how many of them share with Kairos", () => {
    const report = buildKairosReport(input({ sharing: new Set() }));
    assert.equal(figureOf(report, "top", "Rated strong yes for a more demanding next step").value, "1 of 1 (100%)");
    assert.equal(figureOf(report, "top", "Rated strong yes for a more demanding next step").n, "n = 1 rated of the 6 on it at the end");
    assert.equal(figureOf(report, "top", "Of those, sharing their details with Kairos").value, "0 of 1 (0%)");
    const incubator = buildKairosReport(input({ kind: "incubator", rated: [{ uid: "amara", ratings: [{ m1: 8 }] }, { uid: "bea", ratings: [{ m1: 7 }] }] }));
    assert.equal(
      figureOf(incubator, "top", "Rated strong yes for a more demanding next step, or 8 or more for their research continuing").value,
      "1 of 2 (50%)",
    );
  });

  test("a metric the site holds no data for says what it needs instead of a number", () => {
    const report = buildKairosReport(input());
    assert.deepEqual(metric(report, "cost").figures, []);
    assert.match(metric(report, "cost").needs, /^Needs the programme’s spend in US dollars, which the site doesn’t hold\./);
    assert.match(metric(report, "organisers").needs, /needs next term’s groups and committee/);
    assert.equal(figureOf(report, "organisers", "Would like to facilitate or help organise next term: yes").value, "1 of 2 (50%)");
    assert.match(metric(report, "outputs").note, /a fellowship’s does not/);
    const none = buildKairosReport(input({ surveys: [] }));
    for (const id of ["stage", "intention", "actions", "fte", "counterfactual"]) {
      assert.deepEqual(metric(none, id).figures, [], id);
      assert.match(metric(none, id).note ?? "", /Needs/, `${id} says nothing about what it needs`);
    }
  });

  test("an incubator's research outputs, each counted, with the links its people gave", () => {
    const items = templateItems("after", "incubator", "alignment");
    const report = buildKairosReport(
      input({
        kind: "incubator",
        surveys: [
          {
            stage: "after",
            name: "Research Incubator: after",
            items,
            answers: [{ uid: "amara", answers: { q_i4: choices("o_replication", "o_post"), q_i4_links: text("https://example.com/post") } }],
            sent: 6,
          },
        ],
      }),
    );
    const outputs = metric(report, "outputs");
    assert.ok(outputs.figures.length >= 7);
    assert.deepEqual(outputs.links, ["https://example.com/post"]);
    assert.ok(outputs.figures.some((each) => each.value === "1 of 1 (100%)"));
  });
});

describe("the report's page", () => {
  /** AGI Strategy's three surveys, sent and answered, stored as the routes leave them. */
  function seed() {
    const base = ratingsSeed({ [`courseFinishing/${RUN.agi}`]: { kind: "rule", runId: RUN.agi, atLeast: 4, setAt: new Date("2026-11-30T09:00:00Z") } });
    const made = (id, stage, answers, sent) => {
      base[`surveys/${id}`] = {
        kind: stage,
        privacy: "confidential",
        name: `AGI Strategy: ${stage}`,
        title: stage,
        intro: "",
        items: templateItems(stage, "fellowship", null),
        minutes: 5,
        audience: stage.startsWith("followUp") ? { kind: "followUps", roundId: ROUND, programmeId: AGI, consentFrom: "s-before" } : { kind: "programme", roundId: ROUND, programmeId: AGI },
        programmeName: "AGI Strategy",
        programmeKind: "fellowship",
        runId: RUN.agi,
        pairOf: null,
        strand: null,
        closesAt: new Date("2026-12-20T23:59:00Z"),
        closedAt: null,
        namesOffOn: "2028-12-09",
        namesOffAt: null,
        firstSentAt: new Date("2026-10-29T09:00:00Z"),
        presses: [{ id: "p1", kind: "first", at: new Date("2026-10-29T09:00:00Z"), count: sent }],
        tests: {},
        testToken: null,
        createdByUid: "zach",
        createdAt: new Date("2026-10-28T09:00:00Z"),
        updatedAt: new Date("2026-10-28T09:00:00Z"),
      };
      answers.forEach((answer, index) => {
        base[`surveyAnswers/${id}-${index}`] = {
          surveyId: id,
          roundId: ROUND,
          respondent: { kind: "account", uid: answer.uid },
          answers: answer.answers,
          sentAt: new Date("2026-10-29T19:00:00Z"),
          via: "link",
          afterFirstSession: false,
        };
      });
    };
    made("s-before", "before", BEFORE, 6);
    made("s-after", "after", END, 6);
    made("s-six", "followUp6", SIX, 1);
    return base;
  }

  test("the fourteen metrics, read from the records, for an admin", async (t) => {
    clock(t);
    w.reset(seed());
    await w.rate("rahul", B, "amara", { f5: "strongYes" });
    const report = await w.page(page, { params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) }, "zach");
    assert.ok(report.text.includes("AGI Strategy: the Kairos report"));
    for (const name of ["Funnel", "Response rate", "Career-stage shift", "Cost per outcome"]) assert.ok(report.text.includes(name), name);
    assert.ok(report.text.includes("Applied 6 n = 6 applications that ranked it, none withdrawn or given back"), "Nina gave the place back, so Nina's application is not counted");
    assert.ok(report.text.includes("Started 6"), "the people who started, from the register");
    assert.ok(report.text.includes("Finished 4 67% of the 6 who started"), "who finished, from the finished record");
    assert.ok(report.text.includes("Moved up at least one stage, start to end 1 of 2 (50%) n = 2 · 33% of the 6 who started"));
    assert.ok(report.text.includes("Counterfactual FTE, six months on 0.42 FTE Self-reported"));
    assert.ok(report.text.includes("Rated strong yes for a more demanding next step 1 of 1 (100%)"));
    assert.ok(report.text.includes("Download the Kairos file"));
    for (const name of ["Amara", "Okafor", "Bea", "Rahul"]) assert.ok(!report.text.includes(name), `the report names ${name}`);
  });

  test("an address that names no programme is answered in a sentence", async (t) => {
    clock(t);
    w.reset(seed());
    const missing = await w.page(page, { params: Promise.resolve({ roundId: ROUND, programmeId: "no-such-programme" }) }, "zach");
    assert.ok(missing.text.includes("There is no programme here"));
  });
});
