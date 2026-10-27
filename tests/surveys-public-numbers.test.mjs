/**
 * PUBLIC NUMBERS (sv-public; docs/surveys.md, "Public numbers"): what an
 * admin is offered for a programme's public page, what Publish keeps, and
 * Take it down.
 *
 * Three layers:
 *
 *  1. THE COUNTING, on a small made-up programme where every number can be
 *     checked by hand: each measure, its base, pairs by person, the closing
 *     line, and only ticked comments among the quotes. No threshold: one
 *     answer is offered, with its base. Beliefs about AI are never a measure.
 *  2. WHAT IS READ: AGI Strategy's own surveys, and nothing else of the term:
 *     never its survey about leaving, a survey after an event, the anonymous
 *     form, the ratings or the Kairos choices, even when they hold words
 *     ticked or answers to the same questions.
 *  3. THE ROUTES, as every kind of caller: Publish keeps exactly what was
 *     offered, with no respondent, answer or survey anywhere in the record;
 *     a later answer never moves a published number; Take it down deletes
 *     it. Everybody but an admin, and an admin viewing the site as somebody,
 *     is refused before anything is read or written.
 *
 * The world is `tests/lib/ratingsWorld.mjs`: AGI Strategy once its run is
 * over (its last session Wed 9 Dec 2026), tied to its course. Run with
 * `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AFTER, AGI, ROUND, RUN, makeRatingsWorld, ratingsSeed } from "./lib/ratingsWorld.mjs";
import { COURSE } from "./lib/handoverWorld.mjs";

const w = await makeRatingsWorld("__publicNumbers");
const { call } = w;
const { templateItems } = w.lib.templates;
const offerLib = await w.loadTs(join("lib", "surveys", "publicNumbers.ts"));
const model = await w.loadTs(join("lib", "publicNumbers", "model.ts"));
const load = await w.loadTs(join("lib", "surveys", "publicNumbersLoad.ts"));
const routes = {
  publish: await w.loadTs(join("app", "api", "surveys", "public-numbers", "route.ts")),
  takeDown: await w.loadTs(join("app", "api", "surveys", "public-numbers", "take-down", "route.ts")),
};
const { PUBLIC_NUMBERS_REFUSAL: REFUSE } = offerLib;

function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const short = (response) => [response.status, response.body?.error ?? null];

const choice = (optionId) => ({ type: "choice", optionId });
const choices = (...optionIds) => ({ type: "choices", optionIds });
const scale = (value) => ({ type: "scale", value });
const lines = (values) => ({ type: "lines", values });
const words = (text, quote = false) => (quote ? { type: "text", text, quote: true } : { type: "text", text });

/**
 * Before: Amara at stage 1, Bea at stage 2, Dev at stage 0 (Dev never answers
 * at the end), and an answer whose name has come off, which pairs with
 * nothing, not even the answer at the end whose name has come off too.
 */
const BEFORE = [
  { id: "b1", uid: "amara", answers: { q_c1: choice("o_stage1"), q_c4: scale(3), q_c5: scale(2), q_c7: lines({ l_next: 2, l_contribute: 3 }) } },
  { id: "b2", uid: "bea", answers: { q_c1: choice("o_stage2"), q_c4: scale(2), q_c5: scale(3), q_c7: lines({ l_next: 4 }) } },
  { id: "b3", uid: "dev", answers: { q_c1: choice("o_stage0"), q_c4: scale(1) } },
  { id: "b4", uid: null, answers: { q_c1: choice("o_stage0"), q_c4: scale(7), q_c5: scale(7), q_c7: lines({ l_next: 1 }) } },
];
/**
 * At the end: Amara and Bea, who answered at the start too; one answer whose
 * name has come off; Tariq, who missed the start. Amara and the answer with
 * no name ticked their comment; Bea did not.
 */
const END = [
  {
    id: "e1",
    uid: "amara",
    answers: {
      q_c1: choice("o_stage3"),
      q_c4: scale(6),
      q_c5: scale(4),
      q_c7: lines({ l_next: 5 }),
      q_q1: scale(10),
      q_q3: scale(5),
      q_a1: choice("o_towards"),
      q_c9: choices("o_event"),
      q_a5: words("Writing the threat model.", true),
    },
  },
  {
    id: "e2",
    uid: "bea",
    answers: {
      q_c1: choice("o_stage2"),
      q_c4: scale(4),
      q_c5: scale(5),
      q_c7: lines({ l_next: 3 }),
      q_q1: scale(8),
      q_q3: scale(4),
      q_a1: choice("o_clarified"),
      q_c9: choices("o_none"),
      q_a5: words("None at all."),
    },
  },
  { id: "e3", uid: null, answers: { q_c1: choice("o_stage5"), q_q1: scale(9), q_q3: scale(3), q_a5: words("  Crunch Time.\nI argued   so hard. ", true) } },
  { id: "e4", uid: "tariq", answers: { q_c1: choice("o_stage4"), q_q1: scale(6) } },
];

function input(over = {}) {
  return {
    kind: "fellowship",
    term: "Autumn 2026",
    surveys: [
      { stage: "before", items: templateItems("before", "fellowship", null), answers: BEFORE, sent: 6 },
      { stage: "after", items: templateItems("after", "fellowship", null), answers: END, sent: 6 },
    ],
    ...over,
  };
}

const numberOf = (offer, id) => offer.numbers.find((number) => number.id === id);

// ---------------------------------------------------------------------------
// 1. The counting
// ---------------------------------------------------------------------------

describe("the numbers offered, each with its base", () => {
  const offer = offerLib.buildOffer(input());

  test("every measure, in the page's order, from the programme's own two surveys", () => {
    assert.deepEqual(
      offer.numbers.map((number) => number.id),
      ["recommend", "wanted", "stage", "explain", "field", "nextStep", "towards", "steps"],
    );
    assert.deepEqual(offerLib.MEASURE_IDS, offer.numbers.map((number) => number.id));
  });

  test("would recommend it: 9 or 10 out of 10, of everybody who answered, a name or not", () => {
    assert.deepEqual(numberOf(offer, "recommend"), {
      id: "recommend",
      figure: { kind: "one", value: "2 of 4" },
      words: "fellows would recommend it",
      n: 4,
      base: "From 4 answers, counting 9 or 10 out of 10",
      label: "2 of 4 fellows would recommend it",
    });
  });

  test("getting what they wanted from it: the average, to one decimal, out of the question's own top", () => {
    const number = numberOf(offer, "wanted");
    assert.deepEqual(number.figure, { kind: "one", value: "4.0 out of 5" });
    assert.equal(number.words, "for getting what they wanted from it");
    assert.equal(number.base, "From 3 answers");
    assert.equal(number.label, "4.0 out of 5 for getting what they wanted from it");
  });

  test("before and after, by person: only Amara and Bea answered both, never Dev, Tariq or an answer with no name", () => {
    const stage = numberOf(offer, "stage");
    assert.deepEqual(stage.figure, { kind: "pair", start: "1 of 2", end: "2 of 2" });
    assert.equal(stage.words, "Considering, planning or already doing work on AI safety");
    assert.equal(stage.base, "From the 2 who answered both");
    assert.equal(stage.label, "Considering, planning or already doing work on AI safety: 1 of 2 at the start, 2 of 2 at the end");
    assert.deepEqual(numberOf(offer, "explain").figure, { kind: "pair", start: "2.5 out of 7", end: "5.0" });
    assert.equal(numberOf(offer, "explain").words, "Explaining the case that advanced AI could be catastrophic, and the main objections");
    assert.deepEqual(numberOf(offer, "field").figure, { kind: "pair", start: "2.5 out of 7", end: "4.5" });
    const next = numberOf(offer, "nextStep");
    assert.deepEqual(next.figure, { kind: "pair", start: "1 of 2", end: "1 of 2" });
    assert.equal(next.base, "From the 2 who answered both, counting agree and strongly agree");
  });

  test("said it moved them towards AI safety, and took a concrete step, of the people who answered each", () => {
    assert.deepEqual(numberOf(offer, "towards").figure, { kind: "one", value: "1 of 2" });
    assert.equal(numberOf(offer, "towards").words, "fellows said it moved them towards AI safety");
    assert.deepEqual(numberOf(offer, "steps").figure, { kind: "one", value: "1 of 2" });
    assert.equal(numberOf(offer, "steps").words, "fellows took a concrete step towards AI safety work while it ran");
  });

  test("the block's words: the heading, the line under a quote, and the closing line's counts", () => {
    assert.equal(offer.heading, "How autumn 2026 went.");
    assert.equal(offer.attribution, "Autumn 2026 fellow");
    // 4 answered at the end of the 6 it went to; Amara and Bea answered at the start too.
    assert.equal(offer.footer, "From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end, 2 of them at the start too.");
    const noBefore = offerLib.buildOffer(input({ surveys: [input().surveys[1]] }));
    assert.equal(noBefore.footer, "From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end.");
    assert.ok(noBefore.numbers.every((number) => number.figure.kind === "one"), "a before and after number without a before survey");
    const incubator = offerLib.buildOffer(input({ kind: "incubator", term: "Spring 2027" }));
    assert.equal(incubator.attribution, "Spring 2027, research incubator");
    assert.equal(incubator.footer, "From the incubator’s own surveys, spring 2027: 4 of 6 people answered at the end, 2 of them at the start too.");
    assert.equal(numberOf(incubator, "recommend").words, "people would recommend it");
  });

  test("no threshold: one answer is offered, and says so", () => {
    const one = offerLib.buildOffer(
      input({ surveys: [{ stage: "after", items: templateItems("after", "fellowship", null), answers: [END[0]], sent: 1 }] }),
    );
    assert.equal(numberOf(one, "recommend").base, "From 1 answer, counting 9 or 10 out of 10");
    assert.equal(numberOf(one, "recommend").label, "1 of 1 fellow would recommend it");
    assert.equal(one.footer, "From the fellowship’s own surveys, autumn 2026: 1 of 1 fellow answered at the end.");
  });

  test("nothing is offered until the survey at the end has answers, and a measure nobody answered is left out", () => {
    const none = offerLib.buildOffer(input({ surveys: [input().surveys[0]] }));
    assert.deepEqual(none.numbers, []);
    assert.equal(none.footer, "");
    const few = offerLib.buildOffer(input({ surveys: [input().surveys[0], { ...input().surveys[1], answers: [END[3]] }] }));
    // Tariq alone answered at the end: 0 of 1 would recommend it, and nobody answered both.
    assert.deepEqual(few.numbers.map((number) => number.id), ["recommend"]);
    assert.equal(numberOf(few, "recommend").figure.value, "0 of 1");
  });
});

describe("a number counts only what its question could be answered with", () => {
  test("with \"Moved me towards AI safety\" taken off the question before it was sent, nobody could say it, so it is not offered", () => {
    const items = templateItems("after", "fellowship", null).map((item) =>
      item.id === "q_a1" ? { ...item, options: item.options.filter((option) => option.id !== "o_towards") } : item,
    );
    const offer = offerLib.buildOffer(input({ surveys: [input().surveys[0], { ...input().surveys[1], items }] }));
    assert.equal(numberOf(offer, "towards"), undefined);
    assert.ok(numberOf(offer, "recommend"), "the rest are still offered");
  });
});

describe("beliefs about AI are never offered: they're reported, never targets", () => {
  test("every measure reads only its own questions, and none reads a belief", () => {
    const read = Object.values(offerLib.MEASURE_QUESTIONS).flat();
    assert.deepEqual([...read].sort(), ["q_a1", "q_c1", "q_c4", "q_c5", "q_c7", "q_c9", "q_q1", "q_q3"]);
    // C8 holds "Not sure the risk is real"; C2 is how likely somebody thinks they are to work on it.
    for (const never of ["q_c2", "q_c8"]) assert.ok(!read.includes(never), never);
  });

  test("answers to every other question of both surveys make no number", () => {
    const other = (survey) =>
      survey.answers.map((answer) => ({
        ...answer,
        answers: Object.fromEntries(Object.entries(answer.answers).filter(([id]) => !Object.values(offerLib.MEASURE_QUESTIONS).flat().includes(id))),
      }));
    const base = input();
    const offer = offerLib.buildOffer({
      ...base,
      surveys: base.surveys.map((survey) => ({
        ...survey,
        answers: other(survey).map((answer) => ({ ...answer, answers: { ...answer.answers, q_c2: { type: "percent", value: 90 }, q_c8: choices("o_risk") } })),
      })),
    });
    assert.deepEqual(offer.numbers, []);
  });
});

describe("the quotes offered: only comments their writers ticked", () => {
  test("ticked long answers alone, in their words folded to one paragraph, ordered by their words", () => {
    const offer = offerLib.buildOffer(input());
    assert.deepEqual(offer.quotes, [
      { id: "e3.q_a5", text: "Crunch Time. I argued so hard." },
      { id: "e1.q_a5", text: "Writing the threat model." },
    ]);
  });

  test("a tick under a short answer, an empty one, or anything but true is no quote", () => {
    const odd = [
      { id: "x1", uid: "amara", answers: { q_a5: { type: "text", text: "Ticked as a word.", quote: "yes" } } },
      { id: "x2", uid: "bea", answers: { q_a5: { type: "text", text: "   ", quote: true } } },
    ];
    const offer = offerLib.buildOffer(input({ surveys: [{ stage: "after", items: templateItems("after", "fellowship", null), answers: odd, sent: 2 }] }));
    assert.deepEqual(offer.quotes, []);
    const before = offerLib.buildOffer(
      input({ surveys: [{ stage: "before", items: templateItems("before", "fellowship", null), answers: [{ id: "x3", uid: "amara", answers: { q_p6: { type: "text", text: "To explain it.", quote: true } } }], sent: 1 }] }),
    );
    assert.deepEqual(before.quotes, [], "a short answer's words were offered");
  });
});

describe("what Publish keeps, from the offer and the picks", () => {
  test("the offer's own figures, words and bases, in its order, and each quote's words alone", () => {
    const offer = offerLib.buildOffer(input());
    const made = offerLib.publishedFrom(offer, { numbers: ["stage", "recommend"], quotes: ["e1.q_a5"] });
    assert.equal(made.ok, true);
    assert.deepEqual(made.block, {
      heading: "How autumn 2026 went.",
      numbers: [
        { id: "recommend", figure: { kind: "one", value: "2 of 4" }, words: "fellows would recommend it", n: 4, base: "From 4 answers, counting 9 or 10 out of 10" },
        { id: "stage", figure: { kind: "pair", start: "1 of 2", end: "2 of 2" }, words: "Considering, planning or already doing work on AI safety", n: 2, base: "From the 2 who answered both" },
      ],
      quotes: [{ text: "Writing the threat model." }],
      attribution: "Autumn 2026 fellow",
      footer: "From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end, 2 of them at the start too.",
    });
    assert.ok(!JSON.stringify(made.block).includes("e1"), "a quote keeps the answer it came from");
  });

  test("refused: nothing picked, a pick the offer no longer holds, or nothing to publish yet", () => {
    const offer = offerLib.buildOffer(input());
    assert.deepEqual(offerLib.publishedFrom(offer, { numbers: [], quotes: [] }), { ok: false, why: "nothing" });
    assert.deepEqual(offerLib.publishedFrom(offer, { numbers: ["overall"], quotes: [] }), { ok: false, why: "changed" });
    assert.deepEqual(offerLib.publishedFrom(offer, { numbers: [], quotes: ["e2.q_a5"] }), { ok: false, why: "changed" }, "an unticked comment was published");
    const empty = offerLib.buildOffer(input({ surveys: [input().surveys[0]] }));
    assert.deepEqual(offerLib.publishedFrom(empty, { numbers: ["stage"], quotes: [] }), { ok: false, why: "notReady" });
  });

  test("the record reads back field by field, and the block is drawn from it alone", () => {
    const stored = model.normalizePublicNumbers(`${ROUND}__${AGI}`, {
      roundId: ROUND,
      programmeId: AGI,
      courseId: COURSE.agi,
      term: "Autumn 2026",
      lastSessionOn: "2026-12-09",
      heading: "How autumn 2026 went.",
      numbers: [{ id: "recommend", figure: { kind: "one", value: "2 of 4" }, words: "fellows would recommend it", n: 4, base: "From 4 answers" }, { id: "bad", figure: { kind: "pie" }, words: "x" }],
      quotes: [{ text: "Writing the threat model." }, { text: "  " }, "not a quote"],
      attribution: "Autumn 2026 fellow",
      footer: "From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end.",
      publishedAt: new Date("2026-12-11T10:00:00Z"),
      publishedByUid: "zach",
      respondent: { kind: "account", uid: "amara" },
    });
    assert.equal(stored.numbers.length, 1, "a number of no known shape was read");
    assert.deepEqual(stored.quotes, [{ text: "Writing the threat model." }]);
    assert.ok(!("respondent" in stored), "the reader carried a field the record does not have");
    assert.deepEqual(model.blockOf(stored), {
      heading: "How autumn 2026 went.",
      numbers: [{ figure: { kind: "one", value: "2 of 4" }, words: "fellows would recommend it" }],
      quotes: ["Writing the threat model."],
      attribution: "Autumn 2026 fellow",
      footer: "From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end.",
    });
    assert.equal(model.blockOf({ ...stored, numbers: [], quotes: [] }), null, "an empty block is drawn");
  });

  test("a course's page shows its latest term", () => {
    const at = (id, lastSessionOn, publishedAt) => model.normalizePublicNumbers(id, { lastSessionOn, publishedAt: new Date(publishedAt), heading: id, numbers: [] });
    const autumn = at("autumn", "2026-12-09", "2026-12-11T10:00:00Z");
    const spring = at("spring", "2027-03-17", "2027-03-20T10:00:00Z");
    const again = at("autumn-again", "2026-12-09", "2027-04-01T10:00:00Z");
    assert.equal(model.latestOf([autumn, spring, again]).id, "spring", "a term published later is shown over the latest term");
    assert.equal(model.latestOf([autumn, again]).id, "autumn-again");
    assert.equal(model.latestOf([]), null);
  });

  test("a term's name in a sentence: a season is not capitalised, any other name is left alone", () => {
    assert.equal(model.headingWords("Autumn 2026"), "How autumn 2026 went.");
    assert.equal(model.headingWords("Spring 2027"), "How spring 2027 went.");
    assert.equal(model.headingWords("Michaelmas 2026"), "How Michaelmas 2026 went.");
  });
});

// ---------------------------------------------------------------------------
// 2. What is read: the programme's own surveys, nothing else
// ---------------------------------------------------------------------------

/** A stored survey of AGI Strategy's (or an event's), sent, as the routes leave one. */
function surveyDoc(kind, audience, sent, items = templateItems(kind === "event" ? "after" : kind, "fellowship", null)) {
  return {
    kind,
    privacy: "confidential",
    name: `AGI Strategy: ${kind}`,
    title: kind,
    intro: "",
    items,
    minutes: 5,
    audience,
    programmeName: kind === "event" ? "" : "AGI Strategy",
    programmeKind: "fellowship",
    runId: kind === "event" ? "" : RUN.agi,
    pairOf: null,
    strand: null,
    event: kind === "event" ? { title: "VR games night", startAt: new Date("2026-11-01T14:00:00Z"), endAt: null } : null,
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
}

/** AGI Strategy's own two surveys, answered; and beside them everything public numbers must never read. */
function seed(over = {}) {
  const base = ratingsSeed();
  const programme = { kind: "programme", roundId: ROUND, programmeId: AGI };
  const add = (id, doc, answers) => {
    base[`surveys/${id}`] = doc;
    answers.forEach((answer, index) => {
      base[`surveyAnswers/${id}-${index}`] = {
        surveyId: id,
        roundId: ROUND,
        respondent: answer.uid ? { kind: "account", uid: answer.uid } : null,
        answers: answer.answers,
        sentAt: new Date("2026-12-09T20:00:00Z"),
        via: "link",
        afterFirstSession: true,
      };
    });
  };
  add("s-before", surveyDoc("before", programme, 6), BEFORE);
  add("s-after", surveyDoc("after", programme, 6), END);
  // The survey about leaving: the same programme, and words that look ticked.
  add("s-leaving", { ...surveyDoc("leaving", { kind: "leaving", roundId: ROUND, programmeId: AGI }, 0, templateItems("leaving", "fellowship", null)), firstSentAt: new Date("2026-10-29T09:00:00Z"), reached: 2 }, [
    { uid: "dev", answers: { q_leave_stay: words("LEAVING WORDS TICKED", true) } },
  ]);
  // A survey after an event, with the end's own questions answered, and ticked.
  add("s-event", { ...surveyDoc("event", { kind: "event-came", eventId: "vr-night" }, 3), eventId: "vr-night" }, [
    { uid: "amara", answers: { q_q1: scale(0), q_a5: words("EVENT WORDS TICKED", true) } },
  ]);
  // The anonymous form, a rating and a Kairos choice.
  base["anonymousFeedback/a1"] = { roundId: ROUND, programmeId: AGI, runId: RUN.agi, keep: "ANONYMOUS KEEP", change: "ANONYMOUS CHANGE", drop: "", day: "2026-12-09" };
  base[`programmeRatings/${RUN.agi}__rahul__amara`] = { kind: "rating", runId: RUN.agi, raterUid: "rahul", ratedUid: "amara", answers: { f5: "strongYes" } };
  base["kairosChoices/bea"] = { uid: "bea", shared: false, via: "survey" };
  return { ...base, ...over };
}

const programmeNow = () => load.loadNumbersProgramme(w.world.db, ROUND, AGI);

describe("what public numbers are made from: the programme's own surveys alone", () => {
  test("the offer read from the records is the one counted by hand above, and nothing of anything else", async (t) => {
    clock(t);
    w.reset(seed());
    const programme = await programmeNow();
    assert.deepEqual(programme, {
      roundId: ROUND,
      programmeId: AGI,
      name: "AGI Strategy Fellowship",
      term: "Autumn 2026",
      kind: "fellowship",
      courseId: COURSE.agi,
      runId: RUN.agi,
    });
    const offer = await load.loadOffer(w.world.db, programme);
    const byHand = offerLib.buildOffer(input());
    assert.deepEqual(offer.numbers, byHand.numbers, "the leaving survey or the event's answers moved a number");
    assert.equal(offer.footer, byHand.footer);
    assert.deepEqual(offer.quotes.map((quote) => quote.text), ["Crunch Time. I argued so hard.", "Writing the threat model."]);
    const all = JSON.stringify(offer);
    for (const never of ["LEAVING", "EVENT", "ANONYMOUS", "strongYes"]) assert.ok(!all.includes(never), `the offer read ${never}`);
  });

  test("a programme no course is tied to has no public page, so it is no programme here", async (t) => {
    clock(t);
    w.reset(seed());
    assert.equal(await load.loadNumbersProgramme(w.world.db, ROUND, "research-incubator"), null);
    assert.equal(await load.loadNumbersProgramme(w.world.db, ROUND, "no-such-programme"), null);
    assert.equal(await load.loadNumbersProgramme(w.world.db, "a/b", AGI), null);
    const listed = await load.listNumbersProgrammes(w.world.db);
    assert.deepEqual(listed.map((each) => each.programmeId).sort(), [AGI, "technical-ai-safety"].sort());
  });
});

// ---------------------------------------------------------------------------
// 3. The routes
// ---------------------------------------------------------------------------

const RECORD = `publicNumbers/${ROUND}__${AGI}`;
const PICKS = { roundId: ROUND, programmeId: AGI, numbers: ["recommend", "stage"], quotes: ["s-after-0.q_a5"] };

const NOT_ADMINS = [
  ["claudia", "the programme's lead"],
  ["tess", "another programme's lead"],
  ["yusuf", "the run's track lead, SU-recognised committee"],
  ["lloyd", "a reviewer"],
  ["rahul", "a facilitator"],
  ["amara", "a member who answered"],
  ["nobody", "a member on no programme"],
];

describe("Publish: an admin's alone, keeping exactly what was offered and nothing of anybody", () => {
  test("everybody but an admin is refused before anything is read or written, a view-as session included", async (t) => {
    clock(t);
    w.reset(seed());
    const before = w.everything();
    for (const [who, why] of NOT_ADMINS) {
      assert.equal((await call(who, routes.publish.POST, {}, { body: PICKS })).status, 403, why);
      assert.equal((await call(who, routes.takeDown.POST, {}, { body: PICKS })).status, 403, why);
    }
    assert.equal((await call(null, routes.publish.POST, {}, { body: PICKS })).status, 401);
    assert.equal((await call(null, routes.takeDown.POST, {}, { body: PICKS })).status, 401);
    assert.equal((await call("zach", routes.publish.POST, {}, { body: PICKS, viewAs: true })).status, 403, "published during a view-as session");
    assert.equal((await call("zach", routes.takeDown.POST, {}, { body: PICKS, viewAs: true })).status, 403);
    assert.equal(w.everything(), before, "a refused caller changed something");
  });

  test("the record holds the figures, words and bases offered, the quote's words, the term, when and by whom, and no person", async (t) => {
    clock(t);
    w.reset(seed());
    assert.deepEqual(await call("zach", routes.publish.POST, {}, { body: PICKS }), { status: 200, body: { ok: true } });
    const record = w.world.db.read(RECORD);
    assert.deepEqual(Object.keys(record).sort(), [
      "attribution",
      "courseId",
      "footer",
      "heading",
      "lastSessionOn",
      "numbers",
      "programmeId",
      "publishedAt",
      "publishedByUid",
      "quotes",
      "roundId",
      "term",
    ]);
    assert.equal(record.courseId, COURSE.agi);
    assert.equal(record.term, "Autumn 2026");
    assert.equal(record.lastSessionOn, "2026-12-09", "the run's last session orders a course's terms");
    assert.equal(record.publishedByUid, "zach");
    assert.ok(record.publishedAt instanceof Date);
    assert.equal(record.heading, "How autumn 2026 went.");
    assert.deepEqual(record.numbers, offerLib.publishedFrom(offerLib.buildOffer(input()), { numbers: ["recommend", "stage"], quotes: [] }).block.numbers);
    assert.deepEqual(record.quotes, [{ text: "Writing the threat model." }]);
    const all = JSON.stringify(record);
    for (const never of ["amara", "bea", "respondent", "s-after", "s-before", "q_a5"]) assert.ok(!all.includes(never), `the record holds ${never}`);
  });

  test("a later answer never moves a published number; the next press does", async (t) => {
    clock(t);
    w.reset(seed());
    await call("zach", routes.publish.POST, {}, { body: PICKS });
    const published = JSON.stringify(w.world.db.read(RECORD).numbers);
    await w.world.db.collection("surveyAnswers").doc("s-after-9").set({
      surveyId: "s-after",
      roundId: ROUND,
      respondent: { kind: "account", uid: "dev" },
      answers: { q_q1: scale(10), q_c1: choice("o_stage5") },
      sentAt: new Date("2026-12-10T09:00:00Z"),
      via: "link",
      afterFirstSession: true,
    });
    assert.equal(JSON.stringify(w.world.db.read(RECORD).numbers), published, "the public numbers moved with the surveys");
    const now = await load.loadOffer(w.world.db, await programmeNow());
    assert.equal(numberOf(now, "recommend").figure.value, "3 of 5", "the offer did not see the new answer");
    await call("zach", routes.publish.POST, {}, { body: PICKS });
    assert.equal(w.world.db.read(RECORD).numbers[0].figure.value, "3 of 5");
  });

  test("refused in a sentence: a body of the wrong shape, nothing picked, a pick no longer offered, no public page", async (t) => {
    clock(t);
    w.reset(seed());
    const before = w.everything();
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: {} })), [400, REFUSE.body]);
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, roundId: "a/b" } })), [400, REFUSE.body]);
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, numbers: "recommend" } })), [400, REFUSE.body]);
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, numbers: [], quotes: [] } })), [400, REFUSE.nothing]);
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, quotes: ["s-after-1.q_a5"] } })), [409, REFUSE.changed], "Bea's unticked comment");
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, quotes: ["s-leaving-0.q_leave_stay"] } })), [409, REFUSE.changed], "the leaving survey's words");
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, numbers: ["overall"] } })), [409, REFUSE.changed]);
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, programmeId: "research-incubator" } })), [404, REFUSE.noProgramme]);
    assert.equal(w.everything(), before, "a refused press changed something");
  });

  test("nothing to publish while the survey at the end has no answers", async (t) => {
    clock(t);
    const base = seed();
    for (const path of Object.keys(base)) if (path.startsWith("surveyAnswers/s-after-")) delete base[path];
    w.reset(base);
    assert.deepEqual(short(await call("zach", routes.publish.POST, {}, { body: { ...PICKS, numbers: ["stage"], quotes: [] } })), [409, REFUSE.notReady]);
    assert.equal(w.world.db.read(RECORD), undefined);
    const offer = await load.loadOffer(w.world.db, await programmeNow());
    assert.equal(offer.footer, "");
    assert.deepEqual(offer.numbers, []);
  });
});

describe("Take it down: any time, by an admin, and the record is gone", () => {
  test("deletes the programme's record; a second press finds nothing", async (t) => {
    clock(t);
    w.reset(seed());
    await call("zach", routes.publish.POST, {}, { body: PICKS });
    assert.ok(w.world.db.read(RECORD));
    assert.deepEqual(await call("zach", routes.takeDown.POST, {}, { body: { roundId: ROUND, programmeId: AGI } }), { status: 200, body: { ok: true } });
    assert.equal(w.world.db.read(RECORD), undefined);
    assert.deepEqual(short(await call("zach", routes.takeDown.POST, {}, { body: { roundId: ROUND, programmeId: AGI } })), [404, REFUSE.nothingPublished]);
    assert.deepEqual(short(await call("zach", routes.takeDown.POST, {}, { body: {} })), [400, REFUSE.body]);
  });

  test("works by the record's own ids, and never takes down a record whose ids name another programme", async (t) => {
    clock(t);
    w.reset(seed({ [`publicNumbers/${ROUND}__${AGI}`]: { roundId: "someone-else", programmeId: AGI, courseId: COURSE.agi, heading: "x", numbers: [], quotes: [{ text: "y" }] } }));
    assert.deepEqual(short(await call("zach", routes.takeDown.POST, {}, { body: { roundId: ROUND, programmeId: AGI } })), [404, REFUSE.nothingPublished]);
    assert.ok(w.world.db.read(RECORD), "another programme's record was deleted");
    assert.equal(await load.readPublished(w.world.db, { roundId: ROUND, programmeId: AGI }), null);
  });
});

// ---------------------------------------------------------------------------
// 4. The admins' page (sv-public)
// ---------------------------------------------------------------------------

const adminPage = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "public-numbers", "page.tsx"))).default;
const listPage = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "page.tsx"))).default;
const pageAs = (who, programme) => w.page(adminPage, { searchParams: Promise.resolve(programme ? { programme } : {}) }, who);

/** A box on the page, by its field and value, or null. */
function boxOf(html, name, value) {
  const found = new RegExp(`<input[^>]*name="${name}"[^>]*value="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>|<input[^>]*value="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*name="${name}"[^>]*>`).exec(html);
  return found ? found[0] : null;
}

describe("the Public numbers page: the offer, its bases, the quotes, Publish and the preview", () => {
  test("for an admin, before anything is published: every number with its base, the ticked quotes, the beliefs line, and nobody's name", async (t) => {
    clock(t);
    w.reset(seed());
    const page = await pageAs("zach", `${ROUND}.${AGI}`);
    assert.ok(page.text.includes("Public numbers"));
    assert.ok(page.text.includes("Pick what goes on a programme’s public page"));
    assert.ok(page.text.includes("AGI Strategy Fellowship"), "the picker names the programme");
    for (const number of offerLib.buildOffer(input()).numbers) {
      assert.ok(page.text.includes(`${number.label} ${number.base}`), `${number.id}: its line and its base`);
      assert.ok(boxOf(page.html, "number", number.id), `${number.id}: no box`);
      assert.ok(!/\bchecked\b/.test(boxOf(page.html, "number", number.id)), `${number.id} starts ticked with nothing published`);
    }
    assert.ok(page.text.includes("“Writing the threat model.” Ticked by its writer"));
    assert.ok(page.text.includes("“Crunch Time. I argued so hard.” Ticked by its writer"));
    assert.ok(!page.text.includes("None at all."), "an unticked comment is offered");
    assert.ok(page.text.includes("Beliefs about AI aren’t offered: they’re reported, never targets."));
    assert.ok(page.text.includes("Publish Changes the public page now. Take it down any time."));
    assert.ok(!page.text.includes("Take it down Take"), "Take it down is offered with nothing published");
    assert.ok(page.text.includes("The AGI Strategy Fellowship’s page, under “Last term”"));
    assert.ok(page.text.includes("Pick a number or a quote to see it here."), "a preview with nothing picked");
    for (const name of ["Amara", "Okafor", "Bea", "Lindqvist", "Tariq", "Dev "]) assert.ok(!page.text.includes(name), `the page names ${name}`);
    for (const never of ["LEAVING", "EVENT", "ANONYMOUS"]) assert.ok(!page.text.includes(never), `the page shows ${never}`);
  });

  test("once published: its boxes start ticked, the preview draws the block on a phone and a computer, and Take it down says when and by whom", async (t) => {
    clock(t);
    w.reset(seed());
    await call("zach", routes.publish.POST, {}, { body: PICKS });
    const page = await pageAs("zach", `${ROUND}.${AGI}`);
    assert.match(boxOf(page.html, "number", "recommend"), /\bchecked\b/);
    assert.match(boxOf(page.html, "number", "stage"), /\bchecked\b/);
    assert.ok(!/\bchecked\b/.test(boxOf(page.html, "number", "wanted")));
    assert.match(boxOf(page.html, "quote", "s-after-0.q_a5"), /\bchecked\b/, "the published quote, matched by its words");
    // Published on Thu 10 Dec, by Zach, on the day the clock stands at.
    assert.ok(page.text.includes("Take it down On the public page since Thu 10 Dec, published by Zach."));
    assert.ok(page.text.includes("2 picked"));
    assert.ok(page.text.includes("1 picked"));
    // The preview: the block twice, a phone's and a computer's, from the offer.
    assert.equal((page.html.match(/How autumn 2026 went\./g) ?? []).length, 2);
    assert.ok(page.text.includes("On a phone"));
    assert.ok(page.text.includes("On a computer At 78% size"));
    assert.ok(page.text.includes("2 of 4 fellows would recommend it"));
    assert.ok(page.text.includes("1 of 2 at the start 2 of 2 at the end Considering, planning or already doing work on AI safety"));
    assert.ok(page.text.includes("“Writing the threat model.” Autumn 2026 fellow"));
    assert.ok(page.text.includes("From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end, 2 of them at the start too."));
  });

  test("the picker: every programme with a public page, the one asked for by the address, Show before the script arrives", async (t) => {
    clock(t);
    w.reset(seed());
    const page = await pageAs("zach", `${ROUND}.technical-ai-safety`);
    const picker = /<form[^>]*action="\/admin\/surveys\/public-numbers"[^>]*>/.exec(page.html)?.[0] ?? "";
    assert.match(picker, /method="get"/, "the picker is not a form that loads the page");
    assert.match(page.html, new RegExp(`<option value="${ROUND}\\.${AGI}">AGI Strategy Fellowship</option>`));
    assert.match(page.html, new RegExp(`<option value="${ROUND}\\.technical-ai-safety" selected="">Technical AI Safety Fellowship</option>`));
    assert.ok(!page.html.includes("research-incubator"), "a programme with no course is offered");
    assert.ok(page.text.includes("Show"));
    assert.ok(page.text.includes("No numbers to offer yet: the survey at the end has no answers."));
    assert.ok(page.text.includes("No comment has been ticked to be quoted yet."));
    // An address naming nothing, or nothing at all, opens the first programme the form lists.
    for (const asked of ["nothing.here", undefined]) {
      const fallback = await pageAs("zach", asked);
      assert.match(fallback.html, new RegExp(`<option value="${ROUND}\\.technical-ai-safety" selected=""`), String(asked));
    }
  });

  test("the list of surveys links here", async (t) => {
    clock(t);
    w.reset(seed());
    const list = await w.page(listPage, {}, "zach");
    assert.match(list.html, /href="\/admin\/surveys\/public-numbers"[^>]*>Public numbers<\/a>/);
  });
});
