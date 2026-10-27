/**
 * THIS TERM IN NUMBERS, THE COUNTING (board sv-term, docs/surveys.md "This
 * term in numbers"): the term at a glance for admins, each event's check-ins
 * and survey, how many different people came and how many came back, and
 * each programme's before and after. Counts only, never names; every count
 * with its base; no threshold.
 *
 * Two layers. The counting, on small made-up inputs where every number can be
 * checked by hand: who is one person across events, what each event's note
 * says, which form is this term, a programme's row. And the loader, over
 * `tests/lib/termWorld.mjs`, read from the records, with every number held to
 * the reader the page it belongs to already uses (the Check-in tab's count, a
 * survey's Results, the Kairos report, the change view's pairing), so the two
 * can never say different things. The page and its file have suites of their
 * own (`surveys-term-numbers-page`, `surveys-term-numbers-file`).
 *
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AFTER, AGI, EV, ROUND, makeTermWorld } from "./lib/termWorld.mjs";

const w = await makeTermWorld("__termNumbersCount");
const model = await w.loadTs(join("lib", "surveys", "term", "model.ts"));
const { chooseTerm } = await w.loadTs(join("lib", "surveys", "term", "choose.ts"));
const words = await w.loadTs(join("lib", "surveys", "term", "words.ts"));
const checkInView = await w.loadTs(join("lib", "events", "checkInView.ts"));
const checkIns = await w.loadTs(join("lib", "events", "checkIns.ts"));
const { loadEventAtTheDoor } = await w.loadTs(join("lib", "events", "checkInLoad.ts"));
const { resultsView } = await w.loadTs(join("lib", "surveys", "adminView.ts"));
const { readSurvey } = await w.loadTs(join("lib", "surveys", "repo.ts"));
const { bothOf } = await w.loadTs(join("lib", "surveys", "change.ts"));
const { loadKairosReport } = await w.loadTs(join("lib", "surveys", "kairosReportLoad.ts"));
const { loadKairosProgramme } = await w.loadTs(join("lib", "kairos", "programmes.ts"));
const { lastTaughtWeek } = await w.loadTs(join("lib", "courses", "weekPlan.ts"));

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const eventRow = (view, title) => view.events.find((row) => row.title === title);
const programmeRow = (view, name) => view.programmes.find((row) => row.name === name);

// ---------------------------------------------------------------------------
// The counting
// ---------------------------------------------------------------------------

describe("who is one person across the term's events", () => {
  const visit = (how, ...keys) => ({ how, keys });

  test("check-ins that share a key are one person, and a person at two or more events came back", () => {
    const across = model.peopleAcross([
      { counted: [visit("qr", "account:a"), visit("door", "address:g@example.com"), visit("door", "account:d")] },
      { counted: [visit("qr", "account:a"), visit("door", "account:g", "address:g@example.com"), visit("door", "account:x")] },
    ]);
    assert.deepEqual(across, { people: 4, cameTwice: 2, unmatched: false });
  });

  test("keys join through each other: a guest's address, the account that holds it, and that account walking in", () => {
    const across = model.peopleAcross([
      { counted: [visit("door", "address:d@example.com")] },
      { counted: [visit("door", "account:d", "address:d@example.com")] },
      { counted: [visit("qr", "account:d")] },
    ]);
    assert.deepEqual(across, { people: 1, cameTwice: 1, unmatched: false });
  });

  test("a walk-in with no account is never matched: one person each time, and the sentence shows once they are at two events", () => {
    assert.deepEqual(model.peopleAcross([{ counted: [visit("door"), visit("door")] }]), { people: 2, cameTwice: 0, unmatched: false });
    assert.deepEqual(model.peopleAcross([{ counted: [visit("door")] }, { counted: [visit("door")] }]), { people: 2, cameTwice: 0, unmatched: true });
  });

  // A check-in whose names have come off is one more person (the Check-in tab
  // counts it) whom nothing matches; the walk-ins' sentence is about walk-ins
  // with no account, so it never shows for these.
  test("a check-in whose names have come off is one person nobody matches, and never shows the walk-ins' sentence", () => {
    const off = (how) => ({ how, keys: [], namesOff: true });
    assert.deepEqual(model.peopleAcross([{ counted: [off("door")] }, { counted: [off("qr")] }]), { people: 2, cameTwice: 0, unmatched: false });
    assert.deepEqual(model.peopleAcross([{ counted: [visit("door")] }, { counted: [off("door"), visit("qr", "account:a")] }]), {
      people: 3,
      cameTwice: 0,
      unmatched: false,
    });
    assert.deepEqual(model.peopleAcross([{ counted: [visit("door"), off("door")] }, { counted: [visit("door")] }]), { people: 3, cameTwice: 0, unmatched: true });
  });

  test("one person checked in twice at one event came to one event", () => {
    assert.deepEqual(model.peopleAcross([{ counted: [visit("door", "account:a"), visit("door", "account:a", "address:a@example.com")] }]), {
      people: 1,
      cameTwice: 0,
      unmatched: false,
    });
  });
});

describe("what an event's note says", () => {
  const since = new Date("2026-11-01T14:05:00Z");
  const at = (iso) => new Date(iso);
  const event = (over) => ({ endsAt: at("2026-11-05T20:00:00Z"), noSignup: false, counted: [], ...over });

  test("nobody counted, and it ended before check-in was first used: Before check-in, whether or not it had sign-ups", () => {
    assert.equal(model.eventNote(event({ endsAt: at("2026-10-14T20:00:00Z") }), since), "Before check-in");
    assert.equal(model.eventNote(event({ endsAt: at("2026-10-14T20:00:00Z"), noSignup: true }), since), "Before check-in");
    assert.equal(model.eventNote(event({}), null), "Before check-in", "nobody has ever been checked in");
  });

  test("nobody counted after check-in was there: No sign-up and no check-in, or No check-in", () => {
    assert.equal(model.eventNote(event({ noSignup: true }), since), "No sign-up and no check-in");
    assert.equal(model.eventNote(event({}), since), "No check-in");
  });

  test("a no-sign-up event says how its people were checked in, by the ways the Check-in tab groups them", () => {
    const came = (...ways) => event({ noSignup: true, counted: ways.map((how) => ({ how, keys: [] })) });
    assert.equal(model.eventNote(came("qr", "door"), since), "No sign-up: checked in by QR and at the door");
    assert.equal(model.eventNote(came("qr"), since), "No sign-up: checked in by QR");
    assert.equal(model.eventNote(came("door", "page"), since), "No sign-up: checked in at the door");
    assert.equal(model.eventNote(event({ counted: [{ how: "qr", keys: [] }] }), since), "", "an event with sign-ups needs no note");
  });
});

describe("which form is this term", () => {
  const NOW = new Date("2026-12-10T12:00:00Z");
  const form = (id, { round = {}, ...over } = {}) => ({
    round: { id, label: id, status: "deciding", archived: false, opensAt: new Date("2026-10-06T08:00:00Z"), ...round },
    decisionsSentAt: null,
    ...over,
  });

  test("the form whose decisions went out most recently, whatever opened since", () => {
    const autumn = form("autumn", { decisionsSentAt: new Date("2026-10-23T08:00:00Z") });
    const spring = form("spring", { round: { status: "open", opensAt: new Date("2026-11-30T09:00:00Z") } });
    assert.equal(chooseTerm([spring, autumn], NOW).round.id, "autumn", "next term's form, open and undecided, does not take over");
    const decided = { ...spring, decisionsSentAt: new Date("2026-12-09T09:00:00Z") };
    assert.equal(chooseTerm([autumn, decided], NOW).round.id, "spring", "once its decisions are out, it is this term");
  });

  test("before any decisions, the form that opened most recently; never a draft, a cancelled or archived form, or one not yet open", () => {
    const one = form("one", { round: { opensAt: new Date("2026-10-01T09:00:00Z") } });
    const two = form("two", { round: { opensAt: new Date("2026-10-06T09:00:00Z") } });
    assert.equal(chooseTerm([one, two], NOW).round.id, "two");
    for (const [why, other] of [
      ["a draft", form("x", { round: { status: "draft", opensAt: new Date("2026-11-01T09:00:00Z") } })],
      ["cancelled", form("x", { round: { status: "cancelled", opensAt: new Date("2026-11-01T09:00:00Z") } })],
      ["archived", form("x", { round: { archived: true, opensAt: new Date("2026-11-01T09:00:00Z") } })],
      ["not yet open", form("x", { round: { opensAt: new Date("2027-01-01T09:00:00Z") } })],
    ]) {
      assert.equal(chooseTerm([one, two, other], NOW).round.id, "two", why);
    }
    assert.equal(chooseTerm([], NOW), null);
  });
});

describe("a programme's row", () => {
  const items = w.lib.templates.templateItems("before", "fellowship", null);
  const endItems = w.lib.templates.templateItems("after", "fellowship", null);
  const stage = (n) => ({ q_c1: { type: "choice", optionId: `o_stage${n}` } });
  const programme = (over = {}) => ({
    name: "AGI Strategy Fellowship",
    started: 6,
    finished: 4,
    before: { items, answers: [{ uid: "a", answers: stage(1) }, { uid: "b", answers: stage(2) }, { uid: "c", answers: {} }] },
    after: {
      items: endItems,
      answers: [{ uid: "a", answers: stage(3) }, { uid: "b", answers: stage(0) }, { uid: "c", answers: stage(5) }, { uid: "d", answers: stage(4) }],
      state: "closed",
      closes: "Closed Fri 18 Dec",
      answered: 5,
      sent: 6,
    },
    comes: { month: "December", lastWeek: 6 },
    ...over,
  });
  const row = (over) => model.buildTermView({ label: "Autumn 2026", events: [], checkInSince: null, programmes: [programme(over)] }).programmes[0];

  test("answered both is the change view's pairing; considering counts stage 2 and up at each end, of those", () => {
    const made = row();
    assert.equal(made.answeredBoth, 3, "a, b and c answered both; d answered at the end only");
    // The stage is counted over the people who answered it both times, as
    // public numbers, the Kairos report and Results count it (walk 4b, L3).
    assert.deepEqual(made.considering, { start: 1, end: 1, of: 2 }, "c skipped the question at the start, so is counted at neither end: a and b answered it both times");
    assert.equal(made.afterSurvey, "Closed Fri 18 Dec: 5 of 6");
    assert.equal(words.consideringWords(1, 2, 3), "1 → 2 of 3");
    assert.equal(model.CONSIDERING_STAGE, 2, "“One of several options I’m seriously considering” and up");
  });

  test("the stage is counted only over the people who answered it both times, skipped at either end, with that number beside answered both", () => {
    // b answers both surveys and skips the stage question at the end, as Dev
    // does in the stage four journey: b answered both, and is counted at
    // neither end of the stage.
    const skippedAtEnd = row({
      before: { items, answers: [{ uid: "a", answers: stage(2) }, { uid: "b", answers: stage(2) }] },
      after: { ...programme().after, answers: [{ uid: "a", answers: stage(3) }, { uid: "b", answers: { q_q1: { type: "scale", value: 7 } } }] },
    });
    assert.equal(skippedAtEnd.answeredBoth, 2);
    assert.deepEqual(skippedAtEnd.considering, { start: 1, end: 1, of: 1 });
    // Nobody answered it both times: no figure, though two answered both surveys.
    const nobody = row({
      before: { items, answers: [{ uid: "a", answers: {} }, { uid: "b", answers: stage(4) }] },
      after: { ...programme().after, answers: [{ uid: "a", answers: stage(3) }, { uid: "b", answers: {} }] },
    });
    assert.deepEqual([nobody.answeredBoth, nobody.considering], [2, null]);
  });

  test("before the survey at the end goes, nothing is compared, and the cell says when it comes, from records", () => {
    const draft = row({ finished: null, after: { ...programme().after, state: "draft", answered: 0, sent: 0, closes: "" } });
    assert.deepEqual([draft.answeredBoth, draft.considering, draft.afterSurvey], [null, null, "In December, after week 6"]);
    assert.equal(row({ finished: null, after: null, comes: { month: "February", lastWeek: 10 } }).afterSurvey, "In February, after week 10");
    assert.equal(row({ finished: null, after: null, comes: { month: null, lastWeek: 10 } }).afterSurvey, "After week 10");
    assert.equal(row({ after: null }).afterSurvey, "Not sent", "over, and never sent");
  });

  test("with no before survey, answered both stays empty; with an open survey at the end, its numbers so far", () => {
    assert.deepEqual([row({ before: null }).answeredBoth, row({ before: null }).considering], [null, null]);
    const open = row({ finished: null, after: { ...programme().after, state: "open", closes: "Closes Fri 18 Dec", answered: 2 } });
    assert.equal(open.afterSurvey, "Closes Fri 18 Dec: 2 of 6");
    assert.equal(open.answeredBoth, 3);
  });

  test("the month and week come from records: a civil date read in London, and the plan's last taught week", () => {
    assert.equal(words.monthWords("2027-02-11"), "February");
    assert.equal(words.monthWords("2026-12-31"), "December");
    assert.equal(words.monthWords(null), null);
    assert.equal(words.monthWords("next week"), null);
    const plan = [{ kind: "week", weekNumber: 1, weekId: "w01" }, { kind: "break", label: "Christmas" }, { kind: "week", weekNumber: 2, weekId: "w02" }];
    assert.equal(lastTaughtWeek(plan), 2);
    assert.equal(lastTaughtWeek([{ kind: "break", label: "Christmas" }]), null);
  });
});

// ---------------------------------------------------------------------------
// The loader, from the records
// ---------------------------------------------------------------------------

describe("the term, read from the records", () => {
  test("its form, its events since the form opened, and the programmes that name a run", async (t) => {
    clock(t);
    w.reset();
    const before = w.everything();
    const { term, view } = await w.load("zach");
    assert.equal(w.everything(), before, "the loader wrote something");
    assert.deepEqual([term.roundId, term.label], [ROUND, "Autumn 2026"]);
    assert.equal(view.line, "7 events and 2 programmes");
    assert.deepEqual(
      view.events.map((row) => [row.date, row.title]),
      [
        ["Wed 14 Oct", "Board games and pizza"],
        ["Fri 16 Oct", "Movie night: WarGames"],
        ["Sun 1 Nov", "VR games night"],
        ["Thu 5 Nov", "AI policy careers panel"],
        ["Thu 12 Nov", "How do you test an AI model?"],
        ["Thu 19 Nov", "Pizza and board games"],
        ["Wed 25 Nov", "Movie night: Ex Machina"],
      ],
      "published and started since the form opened, oldest first: never a draft, a cancelled event, one before the form opened or one to come",
    );
    assert.deepEqual(
      view.programmes.map((row) => row.name),
      ["Technical AI Safety Fellowship", "AGI Strategy Fellowship"],
      "in the form's order; the incubator names no run",
    );
  });

  // CHANGED ON PURPOSE (the Check-in tab counts a check-in whose names have
  // come off, as the privacy policy says it stays in the count): the VR
  // night's names-off record is a 13th check-in and a 9th person, whom
  // nothing matches. It is not a walk-in, so the sentence is the walk-ins'
  // as before (the model's own test below).
  test("the people: 13 check-ins at 3 events, 9 different people, 4 who came back, and the walk-ins' sentence", async (t) => {
    clock(t);
    w.reset();
    const { view } = await w.load("zach");
    assert.deepEqual(view.tiles, { checkIns: 13, atEvents: 3, people: 9, cameTwice: 4, unmatched: true });
  });

  test("a walk-in's email is never matched, though it is the address a guest signed up with", async (t) => {
    clock(t);
    w.reset();
    const { view } = await w.load("zach");
    // Were Mo's walk-in address matched with Mo's guest sign-up, they would be one person who came back.
    assert.equal(view.tiles.people, 9);
    assert.equal(view.tiles.cameTwice, 4);
  });

  test("an account and the guest sign-ups on its address are one person", async (t) => {
    clock(t);
    const seed = w.seed();
    // Without Gwen's and Dev's accounts on record, their guest sign-ups and their accounts are told apart.
    w.reset(seed);
    const joined = (await w.load("zach")).view.tiles;
    delete seed["users/gwen"];
    seed["users/dev"] = { ...seed["users/dev"], email: "dev.patel@example.com" };
    w.reset(seed);
    const apart = (await w.load("zach")).view.tiles;
    assert.deepEqual([joined.people, joined.cameTwice], [9, 4]);
    assert.deepEqual([apart.people, apart.cameTwice], [10, 3], "Dev's account no longer holds the address Dev's guest sign-up gave; Gwen's sign-up with an account still carries the same address");
  });

  test("everybody but an admin is handed nothing, and nothing is read for them", async (t) => {
    clock(t);
    w.reset();
    for (const who of ["sue", "iris", "claudia", "amara", null]) {
      const reads = w.world.db.stats.reads;
      assert.equal(await w.load(who), null, String(who));
      assert.equal(w.world.db.stats.reads, reads, `${who}: something was read`);
    }
  });

  test("a before survey that was never sent is compared with nothing", async (t) => {
    clock(t);
    const seed = w.seed();
    seed["surveys/s-before"] = { ...seed["surveys/s-before"], firstSentAt: null, presses: [] };
    for (const path of Object.keys(seed)) if (path.startsWith("surveyAnswers/s-before-")) delete seed[path];
    w.reset(seed);
    const agi = programmeRow((await w.load("zach")).view, "AGI Strategy Fellowship");
    assert.deepEqual([agi.answeredBoth, agi.considering, agi.afterSurvey], [null, null, "Closed Wed 9 Dec: 5 of 6"]);
  });

  test("with no form opened, there is no term", async (t) => {
    clock(t);
    const seed = w.seed();
    seed[`admissionRounds/${ROUND}`] = { ...seed[`admissionRounds/${ROUND}`], opensAt: new Date("2027-01-04T09:00:00Z"), decisionsSentAt: null };
    w.reset(seed);
    assert.deepEqual(await w.load("zach"), { term: null });
  });
});

describe("every number is the one its own page shows", () => {
  test("Came is each event's Check-in tab count, and the check-ins add up to those", async (t) => {
    clock(t);
    w.reset();
    const { view } = await w.load("zach");
    let sum = 0;
    let at = 0;
    for (const [id, title] of [
      [EV.vr, "VR games night"],
      [EV.panel, "AI policy careers panel"],
      [EV.talk, "How do you test an AI model?"],
      [EV.games, "Board games and pizza"],
      [EV.movie, "Movie night: WarGames"],
      [EV.pizza, "Pizza and board games"],
      [EV.film, "Movie night: Ex Machina"],
    ]) {
      const loaded = await loadEventAtTheDoor(w.world.db, id);
      const here = checkInView.doorCounts(
        checkInView.doorRows(checkIns.doorListSignups(loaded.signups), loaded.checkIns),
        checkInView.namesOffOf(loaded.checkIns),
      ).here;
      assert.equal(eventRow(view, title).came, here > 0 ? here : null, `${title}: the tab says ${here}`);
      if (here > 0) {
        sum += here;
        at += 1;
      }
    }
    assert.deepEqual([view.tiles.checkIns, view.tiles.atEvents], [sum, at]);
  });

  test("Survey answers and How was it? are the event survey's Results; a survey not yet sent says so", async (t) => {
    clock(t);
    w.reset();
    const { view } = await w.load("zach");
    const results = await resultsView(w.world.db, await readSurvey(w.world.db, "s-vr"), false);
    const how = results.questions.find((question) => question.id === "q_ev_how");
    assert.deepEqual([results.answers, how.rows[0].mean], [3, 4.5]);
    assert.deepEqual(eventRow(view, "VR games night").survey, { sent: true, answers: String(results.answers), average: "4.5" });
    assert.deepEqual(eventRow(view, "AI policy careers panel").survey, { sent: false, answers: "Not sent yet", average: "" });
    assert.equal(eventRow(view, "Pizza and board games").survey, null);
  });

  test("Started and Finished are the Kairos report's; the survey at the end is its Results' answers of the people it was sent to", async (t) => {
    clock(t);
    w.reset();
    const { view } = await w.load("zach");
    const report = await loadKairosReport(w.world.db, await loadKairosProgramme(w.world.db, ROUND, AGI), new Date());
    const funnel = report.metrics.find((metric) => metric.id === "funnel");
    const figure = (label) => funnel.figures.find((each) => each.label === label).value;
    const agi = programmeRow(view, "AGI Strategy Fellowship");
    assert.deepEqual([String(agi.started), String(agi.finished)], [figure("Started"), figure("Finished")]);
    assert.deepEqual([agi.started, agi.finished], [6, 4]);
    const after = await resultsView(w.world.db, await readSurvey(w.world.db, "s-after"), false);
    assert.deepEqual([after.answers, after.sent], [5, 6], "a reminder reaches nobody new, and a nameless answer still counts");
    assert.equal(agi.afterSurvey, `Closed Wed 9 Dec: ${after.answers} of ${after.sent}`);
    const tais = programmeRow(view, "Technical AI Safety Fellowship");
    assert.deepEqual([tais.started, tais.finished, tais.answeredBoth, tais.considering], [2, null, null, null]);
    assert.equal(tais.afterSurvey, "In February, after week 10", "its last session is Thu 11 Feb, week 10 of its plan; its survey at the end is a draft");
  });

  test("Answered both is the change view's own pairing, and the Results' comparison of C1 counts the same people", async (t) => {
    clock(t);
    w.reset();
    const { view } = await w.load("zach");
    const paired = (prefix) =>
      w.world.db
        .paths()
        .filter((path) => path.startsWith(`surveyAnswers/${prefix}-`))
        .map((path) => w.world.db.read(path))
        .filter((answer) => answer.respondent)
        .map((answer) => ({ uid: answer.respondent.uid, answers: answer.answers }));
    const both = bothOf(paired("s-before"), paired("s-after"));
    assert.deepEqual(both.map((person) => person.uid).sort(), ["amara", "bea", "dev"]);
    const after = await resultsView(w.world.db, await readSurvey(w.world.db, "s-after"), false);
    assert.equal(after.questions.find((question) => question.id === "q_c1").change.both, both.length);
    const agi = programmeRow(view, "AGI Strategy Fellowship");
    assert.equal(agi.answeredBoth, both.length);
    assert.deepEqual(agi.considering, { start: 1, end: 2, of: 3 }, "Dev at stage 2 at the start; Amara and Dev at 3 and 4 at the end");
  });
});
