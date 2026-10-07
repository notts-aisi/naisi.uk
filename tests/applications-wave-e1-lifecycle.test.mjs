/**
 * An application form's lifecycle, as rules: when it is ready to open, which
 * moves it may make, where it is in its term, and what the term page is
 * handed about all three.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * A form is stored on an admission round and opens, closes and settles by the
 * round's own status table. Three pure modules under
 * `src/lib/applications/lifecycle/` hold every rule that is not about a
 * database, and each is run here against the cases it exists for:
 *
 *  - `readiness.ts`: the one list of what has to be true before a form opens,
 *    line by line. The term page's panel and the status route both read it,
 *    so each sentence here is a sentence an admin is shown and a refusal the
 *    route gives.
 *  - `status.ts`: the moves the table allows a form, the refusals a form adds
 *    to it, the walk to settled, where the form is in its term, and which of
 *    its days is marked Now.
 *  - `view.ts`: what the term page is handed, and that somebody who is not an
 *    admin is handed the sentence and nothing else.
 *
 * The route itself, with its gate and its transaction, is executed in
 * `tests/applications-wave-e1-status-route.test.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const at = (file) => join("lib", "applications", "lifecycle", file);

const readiness = await loadTs(at("readiness.ts"));
const status = await loadTs(at("status.ts"));
const view = await loadTs(at("view.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const rounds = await loadTs(join("lib", "firestore", "admissionRounds.ts"));

// ---------------------------------------------------------------------------
// The autumn form, a day before it opens
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const ROUND = "autumn-2026__k3f9a2b1";
const HOME = `/admin/admissions/forms/${ROUND}`;

/** Mon 5 Oct 2026, noon in London. Applications open the next morning. */
const NOW = new Date("2026-10-05T11:00:00Z");
const OPENS = new Date("2026-10-06T08:00:00Z");
/** Sun 18 Oct, 23:59 in London (still summer time). */
const CLOSES = new Date("2026-10-18T22:59:00Z");

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  places: 24,
  groupCount: 3,
  groupSize: "Up to 8",
  leadUid: null,
  reviewerUids: [],
  useScores: true,
  closed: false,
  runId: null,
  emailWording: {},
  ...over,
});

const question = (id, over = {}) => ({
  id,
  text: `Question ${id}`,
  help: "",
  type: "long",
  options: [],
  optionsFromRanking: false,
  wordLimit: 300,
  required: true,
  scored: false,
  ...over,
});

const set = (id, scope, label, questions) =>
  normalise.normaliseQuestionSet(id, {
    roundId: ROUND,
    role: scope.type === "kind" ? "general" : scope.type === "programme" ? "stream" : "facilitator",
    scope,
    label,
    intro: "",
    questions,
  });

const SETS = () => [
  set("fellowships", { type: "kind", kind: "fellowship" }, "Fellowships", [question("why")]),
  set(AGI, { type: "programme", programmeId: AGI }, "AGI Strategy", [question("event", { scored: true })]),
  set(TAIS, { type: "programme", programmeId: TAIS }, "Technical AI Safety", [question("code")]),
  set("incubator", { type: "kind", kind: "incubator" }, "Research incubator", [question("idea")]),
  set("facilitator", { type: "facilitating" }, "Facilitator questions", [question("led")]),
];

function roundDoc(over = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    slug: "autumn-2026",
    status: "draft",
    opensAt: OPENS,
    closesAt: CLOSES,
    decisionsByDate: "2026-10-23",
    invitationReplyBy: "2026-10-25",
    stageIds: [],
    reviewerUids: ["zach", "claudia", "lloyd"],
    finalDeciderUid: null,
    archived: false,
    authorUid: "zach",
    programmeIds: [TAIS, AGI, INC],
    programmes: {
      [TAIS]: programme({ name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", leadUid: "zach" }),
      [AGI]: programme({ name: "AGI Strategy Fellowship", shortName: "AGI Strategy", places: 32, leadUid: "claudia" }),
      [INC]: programme({ kind: "incubator", name: "Research Incubator", shortName: "Research incubator", leadUid: "zach" }),
    },
    questionSetIds: ["fellowships", AGI, TAIS, "incubator", "facilitator"],
    asksFacilitating: true,
    ...over,
  };
}

const formOf = (over) => normalise.normaliseForm(ROUND, roundDoc(over));

/** The readiness list for a form, with everything the page or the route would read. */
function ready({ round = {}, sets = SETS(), standing = ["zach", "claudia"], now = NOW } = {}) {
  const form = formOf(round);
  return readiness.formReadiness(
    {
      opensAt: form.round.opensAt,
      closesAt: form.round.closesAt,
      decisionsByDate: form.round.decisionsByDate,
      form,
      sets,
      leadsInStanding: new Set(standing),
    },
    now,
  );
}

const line = (result, id) => result.checks.find((check) => check.id === id);
const withProgrammes = (change) => {
  const doc = roundDoc();
  change(doc.programmes, doc);
  return doc;
};

// ---------------------------------------------------------------------------
// 1. Readiness, line by line
// ---------------------------------------------------------------------------

describe("a form that is ready to open", () => {
  test("every line is ticked, in the order an admin would work down them", () => {
    const result = ready();
    assert.equal(result.ready, true);
    assert.deepEqual(result.unmet, []);
    assert.deepEqual(
      result.checks.map((check) => check.id),
      ["window", "decisions", "programmes", "leads", "general-fellowship", "general-incubator", "facilitator", "questions"],
    );
    for (const check of result.checks) {
      assert.deepEqual([check.ok, check.hint, check.fixAt], [true, "", null], check.id);
      assert.ok(check.label.length > 10, `${check.id} says what it asserts`);
    }
  });

  test("the refusal is one sentence a blocker, after saying the form is not ready", () => {
    const result = ready({ round: { opensAt: null, decisionsByDate: null } });
    assert.equal(
      readiness.readinessRefusal(result.unmet),
      "This form is not ready to open. Set when applications open. Set the day everybody hears. Applicants are shown it.",
    );
  });
});

describe("the opening and closing times", () => {
  const hintFor = (round, now) => {
    const result = ready({ round, now });
    assert.equal(result.ready, false);
    const check = line(result, "window");
    assert.deepEqual([check.ok, check.fixAt], [false, "/form"]);
    return check.hint;
  };

  test("both have to be set", () => {
    assert.equal(hintFor({ opensAt: null, closesAt: null }), "Set when applications open and when they close.");
    assert.equal(hintFor({ opensAt: null }), "Set when applications open.");
    assert.match(hintFor({ closesAt: null }), /^Set when applications close\./);
  });

  test("the close comes after the opening", () => {
    assert.equal(hintFor({ closesAt: OPENS }), "Applications have to close after they open. Move one of the two.");
    assert.match(hintFor({ closesAt: new Date(OPENS.getTime() - 1) }), /have to close after they open/);
  });

  test("the close is still ahead, to the millisecond, and the hint names it in London time", () => {
    const after = hintFor({}, new Date(CLOSES.getTime() + 1));
    assert.match(after, /^The close, Sun 18 Oct, 23:59, has already passed/);
    assert.match(hintFor({}, CLOSES), /has already passed/, "a close that is now is not ahead");
    assert.equal(line(ready({ now: new Date(CLOSES.getTime() - 1) }), "window").ok, true);
  });

  test("an opening that has already been is fine: the form opens straight away", () => {
    assert.equal(line(ready({ now: new Date("2026-10-10T12:00:00Z") }), "window").ok, true);
  });
});

describe("the day everybody hears", () => {
  test("it has to be set", () => {
    const check = line(ready({ round: { decisionsByDate: null } }), "decisions");
    assert.deepEqual([check.ok, check.hint, check.fixAt], [false, "Set the day everybody hears. Applicants are shown it.", "/form"]);
  });

  test("it is not before the day applications close, in London", () => {
    const early = line(ready({ round: { decisionsByDate: "2026-10-17" } }), "decisions");
    assert.deepEqual([early.ok, early.hint], [false, "Everyone hears after applications close. Pick a later day."]);
    // The same day passes, as it does when the dates are saved.
    assert.equal(line(ready({ round: { decisionsByDate: "2026-10-18" } }), "decisions").ok, true);
    assert.equal(line(ready({ round: { decisionsByDate: "2026-10-19" } }), "decisions").ok, true);
    // 23:30 UTC on 18 Oct is still 18 Oct in London, but 23:30 UTC on 17 Oct
    // in summer is already the 18th there: the day is read in London.
    const lateClose = { closesAt: new Date("2026-10-17T23:30:00Z"), decisionsByDate: "2026-10-17" };
    assert.equal(line(ready({ round: lateClose }), "decisions").ok, false);
  });

  test("with no close set, only whether it is set can be judged", () => {
    assert.equal(line(ready({ round: { closesAt: null, decisionsByDate: "2020-01-01" } }), "decisions").ok, true);
  });
});

describe("at least one programme is taking applications", () => {
  test("a form with no programme has nothing to tick", () => {
    const result = ready({ round: { programmeIds: [], programmes: {} } });
    const check = line(result, "programmes");
    assert.deepEqual([check.ok, check.hint, check.fixAt], [false, "Add a programme. With none, an applicant has nothing to tick.", ""]);
  });

  test("a form whose programmes are all closed says so", () => {
    const round = withProgrammes((programmes) => {
      for (const id of [AGI, TAIS, INC]) programmes[id].closed = true;
    });
    const check = line(ready({ round }), "programmes");
    assert.equal(check.ok, false);
    assert.match(check.hint, /^Every programme on this form is closed\./);
  });

  test("an id in the order that the form does not hold is not a programme", () => {
    const check = line(ready({ round: { programmeIds: ["gone", "constructor"] } }), "programmes");
    assert.equal(check.ok, false);
    assert.match(check.hint, /^Add a programme\./);
  });

  test("with nothing open, the lines that could not apply are left off, so no tick is unearned", () => {
    const result = ready({ round: { programmeIds: [], programmes: {} } });
    assert.deepEqual(
      result.checks.map((check) => check.id),
      // Facilitating is asked whatever anybody ticks, so its questions still count.
      ["window", "decisions", "programmes", "facilitator", "questions"],
    );
    const bare = ready({ round: { programmeIds: [], programmes: {}, asksFacilitating: false } });
    assert.deepEqual(bare.checks.map((check) => check.id), ["window", "decisions", "programmes"]);
  });
});

describe("every open programme has a lead who still has the standing to be one", () => {
  test("a programme with no lead is named, and the link goes to its settings", () => {
    const round = withProgrammes((programmes) => {
      programmes[AGI].leadUid = null;
    });
    const check = line(ready({ round }), "leads");
    assert.deepEqual(
      [check.ok, check.hint, check.fixAt],
      [false, "Name a lead for AGI Strategy. A programme’s lead is who decides its applications.", `/programmes/${AGI}/setup`],
    );
  });

  test("a lead who is no longer an admin or SU-recognised committee does not count", () => {
    const check = line(ready({ standing: ["zach"] }), "leads");
    assert.equal(check.ok, false);
    assert.equal(
      check.hint,
      "The lead of AGI Strategy is no longer an admin or SU-recognised committee, so they cannot read its applications. Name another.",
    );
    assert.equal(check.fixAt, `/programmes/${AGI}/setup`);
  });

  test("several are named together, in the form's order", () => {
    const round = withProgrammes((programmes) => {
      programmes[INC].leadUid = null;
      programmes[TAIS].leadUid = null;
    });
    const check = line(ready({ round, standing: [] }), "leads");
    assert.match(check.hint, /^Name a lead for Technical AI Safety and Research incubator\./);
    assert.match(check.hint, /The lead of AGI Strategy is no longer/);
    assert.equal(check.fixAt, `/programmes/${TAIS}/setup`);

    const all = line(ready({ standing: [] }), "leads");
    assert.match(all.hint, /^The leads of Technical AI Safety, AGI Strategy and Research incubator are no longer admins/);
  });

  test("a closed programme is not asked for a lead", () => {
    const round = withProgrammes((programmes) => {
      programmes[AGI].leadUid = null;
      programmes[AGI].closed = true;
    });
    assert.equal(line(ready({ round }), "leads").ok, true);
  });
});

describe("the questions everybody who ticks a kind is asked", () => {
  test("a general set with no questions is not there, as it is not there for an applicant", () => {
    const sets = SETS().map((each) => (each.id === "fellowships" ? { ...each, questions: [] } : each));
    const check = line(ready({ sets }), "general-fellowship");
    assert.equal(check.ok, false);
    assert.equal(
      check.hint,
      "“Fellowships” has no questions yet. Add at least one: everybody who ticks a fellowship answers it, and questions lock once somebody applies.",
    );
    assert.equal(check.fixAt, "/form?set=fellowships");
    assert.equal(line(ready({ sets }), "general-incubator").ok, true);
  });

  test("a general set that is gone, or off the form's order, is asked for", () => {
    const gone = SETS().filter((each) => each.id !== "incubator");
    const check = line(ready({ sets: gone }), "general-incubator");
    assert.deepEqual(
      [check.ok, check.hint, check.fixAt],
      [
        false,
        "There is no question set for everybody who ticks the incubator. Add one in the application form, with at least one question.",
        "/form",
      ],
    );
    const unlisted = ready({ round: { questionSetIds: [AGI, TAIS, "incubator", "facilitator"] } });
    assert.equal(line(unlisted, "general-fellowship").ok, false);
    assert.match(line(unlisted, "general-fellowship").hint, /^There is no question set for everybody who ticks a fellowship\./);
  });

  test("a kind with no open programme is not asked for its questions", () => {
    const round = withProgrammes((programmes) => {
      programmes[INC].closed = true;
    });
    const result = ready({ round, sets: SETS().filter((each) => each.id !== "incubator") });
    assert.equal(line(result, "general-incubator"), undefined);
    assert.equal(result.ready, true);
  });
});

describe("the facilitator questions", () => {
  test("a form that does not ask about facilitating wants none", () => {
    const result = ready({ round: { asksFacilitating: false }, sets: SETS().filter((each) => each.id !== "facilitator") });
    assert.equal(line(result, "facilitator"), undefined);
    assert.equal(result.ready, true);
  });

  test("a form that asks needs at least one, and is told both ways out", () => {
    const empty = SETS().map((each) => (each.id === "facilitator" ? { ...each, questions: [] } : each));
    const check = line(ready({ sets: empty }), "facilitator");
    assert.deepEqual(
      [check.ok, check.hint, check.fixAt],
      [
        false,
        "“Facilitator questions” has no questions yet. Add at least one, or switch off the question about facilitating.",
        "/form?set=facilitator",
      ],
    );
    const gone = line(ready({ sets: SETS().filter((each) => each.id !== "facilitator") }), "facilitator");
    assert.equal(gone.ok, false);
    assert.match(gone.hint, /^There are no facilitator questions\./);
  });
});

describe("every question an applicant is shown can be answered", () => {
  const withQuestion = (setId, added) =>
    SETS().map((each) => (each.id === setId ? { ...each, questions: [...each.questions, added] } : each));

  test("a question with no text is named by its place and its set", () => {
    const check = line(ready({ sets: withQuestion(AGI, question("blank", { text: "   " })) }), "questions");
    assert.deepEqual(
      [check.ok, check.hint, check.fixAt],
      [false, "Question 2 in “AGI Strategy” has no text. Finish it or delete it.", `/form?set=${AGI}`],
    );
  });

  test("a choice, a multiple choice or a scale needs two options, unless they come from the ranking", () => {
    for (const type of ["choice", "multi", "scale"]) {
      const sets = withQuestion("fellowships", question("pick", { type, options: ["Only one"] }));
      const check = line(ready({ sets }), "questions");
      assert.equal(check.ok, false, type);
      assert.match(check.hint, /^Question 2 in “Fellowships” has fewer than 2 options to pick from\./, type);
    }
    const ranked = withQuestion("fellowships", question("which", { type: "choice", options: [], optionsFromRanking: true }));
    assert.equal(line(ready({ sets: ranked }), "questions").ok, true);
    const two = withQuestion("fellowships", question("pick", { type: "choice", options: ["Yes", "No"] }));
    assert.equal(line(ready({ sets: two }), "questions").ok, true);
  });

  test("a question nobody can be shown does not hold the form shut", () => {
    // The stream of a closed programme.
    const closed = withProgrammes((programmes) => {
      programmes[AGI].closed = true;
    });
    assert.equal(ready({ round: closed, sets: withQuestion(AGI, question("blank", { text: "" })) }).ready, true);
    // A set the form's order does not list.
    const stray = [...SETS(), set("stray", { type: "kind", kind: "fellowship" }, "Stray", [question("blank", { text: "" })])];
    assert.equal(ready({ sets: stray }).ready, true);
    // The facilitator questions of a form that does not ask.
    const unasked = withQuestion("facilitator", question("blank", { text: "" }));
    assert.equal(ready({ round: { asksFacilitating: false }, sets: unasked }).ready, true);
  });

  test("past three, the rest are counted", () => {
    const sets = SETS().map((each) =>
      each.id === TAIS
        ? { ...each, questions: ["a", "b", "c", "d", "e"].map((id) => question(id, { text: "" })) }
        : each,
    );
    const check = line(ready({ sets }), "questions");
    assert.equal(
      check.hint,
      "Question 1 in “Technical AI Safety” has no text. Question 2 in “Technical AI Safety” has no text. " +
        "Question 3 in “Technical AI Safety” has no text. So do 2 more. Finish each one or delete it.",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The moves
// ---------------------------------------------------------------------------

const STATUSES = rounds.ADMISSION_ROUND_STATUSES;
const SENT = new Date("2026-10-23T17:00:00Z");
/** A moment after the close, when the leads are deciding. */
const AFTER_CLOSE = new Date("2026-10-19T09:00:00Z");

const facts = (over = {}) => ({
  status: "draft",
  archived: false,
  destroying: false,
  opensAt: OPENS,
  closesAt: CLOSES,
  decisionsSentAt: null,
  ...over,
});

describe("a form moves by the round's own table", () => {
  test("every arrow in the table is a move, and everything else is refused or walked", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        // Settling is tested on its own below: it needs decision day.
        if (to === "settled") continue;
        const plan = status.planFormMove(facts({ status: from }), to, AFTER_CLOSE);
        if (from === to) {
          assert.deepEqual(plan, { ok: true, kind: "noop", status: from }, `${from} to ${to}`);
        } else if (rounds.ADMISSION_ROUND_TRANSITIONS[from].includes(to)) {
          assert.deepEqual([plan.ok, plan.kind, plan.to, plan.through], [true, "move", to, [to]], `${from} to ${to}`);
        } else {
          assert.equal(plan.ok, false, `${from} to ${to}`);
          assert.ok(["illegal", "terminal"].includes(plan.code), `${from} to ${to}: ${plan.code}`);
        }
      }
    }
  });

  test("a refusal says what the form can do instead, in the form's own words", () => {
    const refusal = (from, to) => status.planFormMove(facts({ status: from }), to, AFTER_CLOSE).error;
    assert.equal(refusal("draft", "closed"), "A form that is a draft can only be opened or cancelled.");
    assert.equal(refusal("open", "deciding"), "A form that is open can only be closed or cancelled.");
    assert.equal(refusal("closed", "cancelled"), "A form that is closed can only be moved to deciding or opened.");
    assert.equal(refusal("deciding", "open"), "A form that is deciding can only be settled.");
    assert.equal(refusal("settled", "open"), "A settled form is finished and cannot be moved again.");
    assert.equal(refusal("cancelled", "open"), "A cancelled form is finished and cannot be moved again.");
    // Nothing a form is told calls it a round.
    for (const from of STATUSES) {
      for (const to of [...STATUSES, "nonsense"]) {
        const plan = status.planFormMove(facts({ status: from, decisionsSentAt: SENT }), to, AFTER_CLOSE);
        if (!plan.ok) assert.doesNotMatch(plan.error, /\bround\b/i, `${from} to ${to}`);
      }
    }
  });

  test("a status this site does not know is refused at both ends, and never repaired into a draft", () => {
    const from = status.planFormMove(facts({ status: "live" }), "open", NOW);
    assert.deepEqual(
      [from.ok, from.code, from.error],
      [false, "unknown-status", "This form’s status is not one this site recognises, so it cannot be moved."],
    );
    for (const stored of [undefined, null, 7, ""]) {
      assert.equal(status.planFormMove(facts({ status: stored }), "open", NOW).code, "unknown-status");
    }
    const to = status.planFormMove(facts(), "published", NOW);
    assert.deepEqual([to.ok, to.code, to.error], [false, "unknown-status", "That is not a status an application form can be in."]);
  });

  test("a form that is being destroyed does not move at all, not even to where it is", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const plan = status.planFormMove(facts({ status: from, destroying: true, decisionsSentAt: SENT }), to, AFTER_CLOSE);
        assert.deepEqual([plan.ok, plan.code], [false, "destroying"], `${from} to ${to}`);
        assert.match(plan.error, /^A destroy of this form has begun/);
      }
    }
  });
});

describe("opening and reopening", () => {
  test("opening a draft needs the form to be ready and nothing confirmed", () => {
    const plan = status.planFormMove(facts(), "open", NOW);
    assert.deepEqual(
      [plan.kind, plan.to, plan.needsReadiness, plan.requiresConfirmation, plan.confirmPrompt],
      ["move", "open", true, false, null],
    );
  });

  test("reopening has to be confirmed, and needs the form to be ready too", () => {
    const plan = status.planFormMove(facts({ status: "closed" }), "open", NOW);
    assert.deepEqual([plan.kind, plan.needsReadiness, plan.requiresConfirmation], ["move", true, true]);
    assert.equal(plan.confirmPrompt, status.REOPEN_PROMPT);
    assert.match(plan.confirmPrompt, /^Reopening tells everybody/);
  });

  test("no other move asks for readiness or a confirmation", () => {
    for (const [from, to] of [["draft", "cancelled"], ["open", "closed"], ["open", "cancelled"], ["closed", "deciding"]]) {
      const plan = status.planFormMove(facts({ status: from }), to, NOW);
      assert.deepEqual([plan.needsReadiness, plan.requiresConfirmation], [false, false], `${from} to ${to}`);
    }
  });

  test("an archived form cannot be opened or reopened", () => {
    for (const from of ["draft", "closed"]) {
      const plan = status.planFormMove(facts({ status: from, archived: true }), "open", NOW);
      assert.deepEqual([plan.ok, plan.code], [false, "archived"], from);
      assert.match(plan.error, /^This form is archived\./);
    }
    // Archiving does not stop it being closed.
    assert.equal(status.planFormMove(facts({ status: "open", archived: true }), "closed", NOW).ok, true);
  });

  test("once decisions have been sent the form cannot take applications again", () => {
    const plan = status.planFormMove(facts({ status: "closed", decisionsSentAt: SENT }), "open", AFTER_CLOSE);
    assert.deepEqual(
      [plan.ok, plan.code, plan.error],
      [false, "decisions-sent", "Decisions for this term went out on Fri 23 Oct, so the form cannot take applications again."],
    );
  });
});

describe("settling", () => {
  const settle = (over, now = new Date("2026-10-24T09:00:00Z")) =>
    status.planFormMove(facts({ decisionsSentAt: SENT, ...over }), "settled", now);

  test("it walks the table from wherever the form is on the road, naming each status on the way", () => {
    assert.deepEqual(settle({ status: "open" }).through, ["closed", "deciding", "settled"]);
    assert.deepEqual(settle({ status: "closed" }).through, ["deciding", "settled"]);
    assert.deepEqual(settle({ status: "deciding" }).through, ["settled"]);
    for (const from of ["open", "closed", "deciding"]) {
      const plan = settle({ status: from });
      assert.deepEqual([plan.ok, plan.to, plan.needsReadiness, plan.requiresConfirmation], [true, "settled", false, false], from);
      // Each hop is an arrow the table has.
      let at = from;
      for (const hop of plan.through) {
        assert.ok(rounds.ADMISSION_ROUND_TRANSITIONS[at].includes(hop), `${at} to ${hop} is not in the table`);
        at = hop;
      }
    }
  });

  test("a form that never opened, or is already finished, is not on that road", () => {
    assert.deepEqual([settle({ status: "draft" }).ok, settle({ status: "draft" }).code], [false, "illegal"]);
    assert.equal(settle({ status: "draft" }).error, "A form that is a draft can only be opened or cancelled.");
    assert.equal(settle({ status: "cancelled" }).code, "terminal");
    assert.deepEqual(settle({ status: "settled" }), { ok: true, kind: "noop", status: "settled" });
  });

  test("it waits for decision day", () => {
    for (const from of ["open", "closed", "deciding"]) {
      const plan = settle({ status: from, decisionsSentAt: null });
      assert.deepEqual([plan.ok, plan.code], [false, "decisions-not-sent"], from);
      assert.equal(plan.error, "Decision day has not been sent, so there is nothing to settle yet. Send every decision first.");
    }
  });

  test("it does not settle a form that is still taking applications, or has not started to", () => {
    const open = settle({ status: "open" }, new Date("2026-10-10T12:00:00Z"));
    assert.deepEqual(
      [open.ok, open.code, open.error],
      [false, "still-open", "Applications are still open until Sun 18 Oct, 23:59. Close them before settling the term."],
    );
    const early = settle({ status: "open" }, NOW);
    assert.deepEqual([early.ok, early.code], [false, "still-open"]);
    assert.match(early.error, /have not opened yet/);
    // The close is the last instant applications are taken, so one millisecond on is closed.
    assert.equal(settle({ status: "open" }, CLOSES).code, "still-open");
    assert.equal(settle({ status: "open" }, new Date(CLOSES.getTime() + 1)).ok, true);
  });
});

describe("the body of a move", () => {
  test("a status and, when it was, a confirmation", () => {
    assert.deepEqual(status.parseFormMove({ status: "open" }), { ok: true, request: { to: "open", confirm: false } });
    assert.deepEqual(status.parseFormMove({ status: "open", confirm: true }), { ok: true, request: { to: "open", confirm: true } });
    assert.deepEqual(status.parseFormMove({ status: "closed", confirm: false }).request, { to: "closed", confirm: false });
  });

  test("anything else is refused with a sentence", () => {
    for (const body of [null, undefined, [], "open", {}, { confirm: true }]) {
      assert.deepEqual(status.parseFormMove(body), { ok: false, error: "Say which status to move the form to." });
    }
    for (const body of [{ status: "published" }, { status: 3 }, { status: "constructor" }, { status: ["open"] }]) {
      assert.deepEqual(status.parseFormMove(body), { ok: false, error: "That is not a status an application form can be in." });
    }
    for (const confirm of ["true", 1, null, {}]) {
      assert.equal(status.parseFormMove({ status: "open", confirm }).ok, false, String(confirm));
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Where the form is
// ---------------------------------------------------------------------------

describe("the stage follows the clock and decision day, not only the status", () => {
  const stage = (over, now) => status.termStageFor({ ...facts(over) }, now);

  test("a draft, and the three ways a form is finished", () => {
    assert.equal(stage({ status: "draft" }, AFTER_CLOSE), "draft");
    assert.equal(stage({ status: "settled", decisionsSentAt: SENT }, AFTER_CLOSE), "settled");
    assert.equal(stage({ status: "cancelled" }, NOW), "cancelled");
    assert.equal(stage({ status: "open", archived: true }, new Date("2026-10-10T12:00:00Z")), "archived");
  });

  test("an open form is not open before its time or after it", () => {
    assert.equal(stage({ status: "open" }, NOW), "opens-later");
    assert.equal(stage({ status: "open" }, OPENS), "open", "the opening instant is in");
    assert.equal(stage({ status: "open" }, CLOSES), "open", "the close is the last instant in");
    assert.equal(stage({ status: "open" }, new Date(CLOSES.getTime() + 1)), "deciding");
  });

  test("closed or deciding by an admin's hand is deciding, whatever the clock says", () => {
    assert.equal(stage({ status: "closed" }, new Date("2026-10-10T12:00:00Z")), "deciding");
    assert.equal(stage({ status: "deciding" }, AFTER_CLOSE), "deciding");
  });

  test("once decision day has been sent the form is decided until it is settled", () => {
    for (const from of ["open", "closed", "deciding"]) {
      assert.equal(stage({ status: from, decisionsSentAt: SENT }, new Date("2026-10-24T09:00:00Z")), "decided", from);
    }
  });
});

describe("the day marked Now", () => {
  test("it is the next day the term is heading for, and never more than one", () => {
    const expected = {
      draft: ["ahead", "ahead", "ahead", "ahead"],
      "opens-later": ["now", "ahead", "ahead", "ahead"],
      open: ["done", "now", "ahead", "ahead"],
      deciding: ["done", "done", "now", "ahead"],
      decided: ["done", "done", "done", "now"],
      settled: ["done", "done", "done", "now"],
      cancelled: ["ahead", "ahead", "ahead", "ahead"],
      archived: ["ahead", "ahead", "ahead", "ahead"],
    };
    for (const [stage, states] of Object.entries(expected)) {
      const steps = status.termStepsFor(stage);
      assert.deepEqual([steps.opens, steps.closes, steps.decisions, steps.start], states, stage);
      assert.ok(states.filter((state) => state === "now").length <= 1, stage);
    }
  });
});

describe("the actions an admin is offered", () => {
  test("each stage offers the one careful thing to do next, and each asks for an arrow or the walk to settled", () => {
    assert.deepEqual(status.actionsFor("draft", "draft"), ["open"]);
    assert.deepEqual(status.actionsFor("opens-later", "open"), ["close"]);
    assert.deepEqual(status.actionsFor("open", "open"), ["close"]);
    assert.deepEqual(status.actionsFor("deciding", "closed"), ["reopen"]);
    assert.deepEqual(status.actionsFor("decided", "open"), ["settle"]);
    assert.deepEqual(status.actionsFor("decided", "closed"), ["settle"]);
    assert.deepEqual(status.ACTION_TARGET, { open: "open", close: "closed", reopen: "open", settle: "settled" });
  });

  test("nothing is offered where no move is the answer", () => {
    // The close passed and nobody moved the status: a later close is a date, not a move.
    assert.deepEqual(status.actionsFor("deciding", "open"), []);
    assert.deepEqual(status.actionsFor("deciding", "deciding"), []);
    for (const stage of ["settled", "cancelled", "archived"]) {
      assert.deepEqual(status.actionsFor(stage, "settled"), [], stage);
    }
  });

  test("every action offered is a move the plan would make from that stage", () => {
    const cases = [
      ["draft", "draft", NOW, null],
      ["open", "open", new Date("2026-10-10T12:00:00Z"), null],
      ["deciding", "closed", new Date("2026-10-10T12:00:00Z"), null],
      ["decided", "open", new Date("2026-10-24T09:00:00Z"), SENT],
      ["decided", "deciding", new Date("2026-10-24T09:00:00Z"), SENT],
    ];
    for (const [stage, stored, now, sentAt] of cases) {
      const form = facts({ status: stored, decisionsSentAt: sentAt });
      assert.equal(status.termStageFor(form, now), stage);
      for (const action of status.actionsFor(stage, stored)) {
        const plan = status.planFormMove(form, status.ACTION_TARGET[action], now);
        assert.deepEqual([plan.ok, plan.kind], [true, "move"], `${action} from ${stage}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. What the term page is handed
// ---------------------------------------------------------------------------

function lifecycle({ round = {}, canRunTerm = true, now = NOW, sent = 0, list = undefined } = {}) {
  const form = formOf(round);
  const wanted = view.wantsReadiness(form, canRunTerm, now);
  const worked = list === undefined ? (wanted ? ready({ round, now }) : null) : list;
  return view.buildLifecycleView({ form, readiness: worked, canRunTerm, sent, home: HOME, now });
}

describe("the term page, for an admin", () => {
  test("a draft that is ready: the list all ticked and Open applications to press", () => {
    const result = lifecycle();
    assert.deepEqual([result.stage, result.title, result.live], ["draft", "Draft", false]);
    assert.match(result.line, /^Nobody can apply to a draft\./);
    assert.deepEqual([result.readiness.ready, result.readiness.left, result.readiness.lines.length], [true, 0, 8]);
    assert.equal(result.actions.length, 1);
    const [open] = result.actions;
    assert.deepEqual([open.action, open.target, open.label, open.enabled, open.reason], ["open", "open", "Open applications", true, null]);
    assert.deepEqual(open.dialog, {
      title: "Open applications?",
      lines: [
        "People will be able to apply from Tue 6 Oct, 09:00 until Sun 18 Oct, 23:59.",
        "Once somebody has sent an application, the questions are locked.",
      ],
      confirm: "Open applications",
      busy: "Opening…",
    });
  });

  test("a draft that is not ready: the button waits, and each line links to where it is put right", () => {
    const round = withProgrammes((programmes, doc) => {
      programmes[AGI].leadUid = null;
      doc.decisionsByDate = null;
    });
    const result = lifecycle({ round });
    const [open] = result.actions;
    assert.deepEqual([open.enabled, open.reason], [false, "2 things are left to do first."]);
    assert.deepEqual([result.readiness.ready, result.readiness.left], [false, 2]);
    const links = Object.fromEntries(result.readiness.lines.map((each) => [each.id, each.link]));
    assert.deepEqual(links.decisions, { href: `${HOME}/form`, label: "Open the application form" });
    assert.deepEqual(links.leads, { href: `${HOME}/programmes/${AGI}/setup`, label: "Open its settings" });
    assert.equal(links.window, null, "a line that is met links nowhere");
    // A line that is put right on the term page itself links nowhere either.
    const bare = lifecycle({ round: { programmeIds: [], programmes: {}, asksFacilitating: false } });
    const programmes = bare.readiness.lines.find((each) => each.id === "programmes");
    assert.deepEqual([programmes.ok, programmes.link], [false, null]);
    assert.equal(lifecycle({ round: { decisionsByDate: null } }).actions[0].reason, "1 thing is left to do first.");
  });

  test("a form that opens straight away says so", () => {
    const result = lifecycle({ now: new Date("2026-10-07T12:00:00Z") });
    assert.equal(result.actions[0].dialog.lines[0], "People will be able to apply straight away until Sun 18 Oct, 23:59.");
  });

  test("an open form: how long for, how many so far, and Close early", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const result = lifecycle({ round: { status: "open" }, now, sent: 12 });
    assert.deepEqual([result.stage, result.title, result.live], ["open", "Open", true]);
    assert.equal(result.line, "Applications are open until Sun 18 Oct, 23:59. 12 applications sent so far.");
    assert.equal(result.readiness, null, "the list is for a form that could open");
    const [close] = result.actions;
    assert.deepEqual([close.action, close.target, close.label, close.enabled], ["close", "closed", "Close early", true]);
    assert.equal(close.dialog.title, "Close applications early?");
    assert.match(close.dialog.lines[0], /^The form says applications close on Sun 18 Oct, 23:59\. Closing now stops anybody applying/);
    assert.equal(close.dialog.lines[1], "12 applications sent so far.");
    assert.match(lifecycle({ round: { status: "open" }, now, sent: 1 }).line, /1 application sent so far\.$/);
    assert.match(lifecycle({ round: { status: "open" }, now }).line, /Nobody has sent an application yet\.$/);
  });

  test("opened but not open yet: when it opens, and closing it means it never does", () => {
    const result = lifecycle({ round: { status: "open" } });
    assert.deepEqual([result.stage, result.title, result.live], ["opens-later", "Opens Tue 6 Oct", false]);
    assert.equal(lifecycle({ round: { status: "open", opensAt: null, closesAt: null } }).stage, "open", "no opening time is no wait");
    assert.equal(result.line, "Applications open on Tue 6 Oct, 09:00 and close on Sun 18 Oct, 23:59.");
    assert.match(result.actions[0].dialog.lines[0], /^Applications have not opened yet\. Closing the form now means they do not open on Tue 6 Oct, 09:00\./);
  });

  test("the close has passed and nobody moved the status: no button, and a pointer to the dates", () => {
    const result = lifecycle({ round: { status: "open" }, now: AFTER_CLOSE });
    assert.deepEqual([result.stage, result.title, result.live], ["deciding", "Deciding", true]);
    assert.equal(result.line, "Applications closed on Sun 18 Oct, 23:59. Each lead is deciding their own programme.");
    assert.deepEqual(result.actions, []);
    assert.deepEqual(result.pointer, {
      text: "To take applications again, move the close to a later time.",
      label: "Application form",
      href: `${HOME}/form`,
    });
  });

  test("closed early by an admin: Reopen, which waits on the same list", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const result = lifecycle({ round: { status: "closed" }, now });
    assert.equal(result.line, "Applications are closed. An admin closed them before Sun 18 Oct, 23:59. Each lead is deciding their own programme.");
    const [reopen] = result.actions;
    assert.deepEqual([reopen.action, reopen.target, reopen.label, reopen.enabled, reopen.reason], ["reopen", "open", "Reopen", true, null]);
    assert.deepEqual(reopen.dialog.lines, [status.REOPEN_PROMPT, "Applications will be open until Sun 18 Oct, 23:59."]);
    // It has been through the list once. With nothing on it in the way, the list is not drawn again.
    assert.equal(result.readiness, null);
    assert.equal(result.pointer, null);

    // Once the close has passed, reopening waits for a later one: the button
    // says why, and the list is back with the line that is in the way.
    const late = lifecycle({ round: { status: "closed" }, now: AFTER_CLOSE });
    assert.equal(late.actions[0].enabled, false);
    assert.match(late.actions[0].reason, /^The close, Sun 18 Oct, 23:59, has already passed/);
    assert.deepEqual([late.readiness.ready, late.readiness.left], [false, 1]);
    assert.deepEqual(late.readiness.lines.filter((each) => !each.ok).map((each) => each.id), ["window"]);
  });

  test("decisions sent: Settle the term, and what settling does", () => {
    const result = lifecycle({ round: { status: "open", decisionsSentAt: SENT }, now: new Date("2026-10-24T09:00:00Z") });
    assert.deepEqual([result.stage, result.title], ["decided", "Decisions sent"]);
    assert.equal(result.line, "Every decision went out on Fri 23 Oct. Settle the term to keep each applicant’s record.");
    const [settle] = result.actions;
    assert.deepEqual([settle.action, settle.target, settle.label, settle.enabled], ["settle", "settled", "Settle the term", true]);
    assert.equal(settle.dialog.title, "Settle the term?");
    assert.equal(settle.dialog.lines.at(-1), "It cannot be undone.");
    assert.equal(result.readiness, null);
  });

  test("settled, cancelled and archived offer nothing", () => {
    const after = new Date("2026-10-30T09:00:00Z");
    const settled = lifecycle({ round: { status: "settled", decisionsSentAt: SENT }, now: after });
    assert.deepEqual([settled.title, settled.line, settled.actions], ["Settled", "This term is settled. Every decision went out on Fri 23 Oct.", []]);
    assert.deepEqual(lifecycle({ round: { status: "cancelled" }, now: after }).actions, []);
    assert.match(lifecycle({ round: { status: "cancelled" }, now: after }).line, /^This form was cancelled\./);
    const archived = lifecycle({ round: { archived: true }, now: after });
    assert.deepEqual([archived.title, archived.actions, archived.readiness], ["Archived", [], null]);
  });
});

describe("the term page, for a lead or a reviewer", () => {
  test("the state in a sentence, the steps, and nothing an admin does", () => {
    const moments = [
      [{}, NOW],
      [{ status: "open" }, NOW],
      [{ status: "open" }, new Date("2026-10-10T12:00:00Z")],
      [{ status: "open" }, AFTER_CLOSE],
      [{ status: "closed" }, new Date("2026-10-10T12:00:00Z")],
      [{ status: "open", decisionsSentAt: SENT }, new Date("2026-10-24T09:00:00Z")],
      [{ status: "settled", decisionsSentAt: SENT }, new Date("2026-10-30T09:00:00Z")],
    ];
    for (const [round, now] of moments) {
      const result = lifecycle({ round, now, canRunTerm: false, sent: 4 });
      assert.deepEqual([result.actions, result.readiness, result.pointer], [[], null, null], JSON.stringify(round));
      assert.ok(result.line.length > 10);
      assert.equal(view.wantsReadiness(formOf(round), false, now), false);
    }
  });

  test("the sentences that differ are the ones that would tell them to press something", () => {
    assert.equal(lifecycle({ canRunTerm: false }).line, "This form is a draft, so nobody can apply yet. An admin opens it.");
    const decided = lifecycle({
      round: { status: "open", decisionsSentAt: SENT },
      now: new Date("2026-10-24T09:00:00Z"),
      canRunTerm: false,
    });
    assert.equal(decided.line, "Every decision went out on Fri 23 Oct.");
  });

  test("a readiness list handed in by mistake is not passed on", () => {
    const result = lifecycle({ canRunTerm: false, list: ready() });
    assert.equal(result.readiness, null);
  });
});

describe("nothing the page is handed uses a word the design does not", () => {
  test("no sentence calls the form a round, and none uses a dash", () => {
    const strings = [];
    const collect = (value) => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    const moments = [
      [{}, NOW],
      [{ decisionsByDate: null, opensAt: null }, NOW],
      [{ status: "open" }, NOW],
      [{ status: "open" }, new Date("2026-10-10T12:00:00Z")],
      [{ status: "open" }, AFTER_CLOSE],
      [{ status: "closed" }, AFTER_CLOSE],
      [{ status: "open", decisionsSentAt: SENT }, new Date("2026-10-24T09:00:00Z")],
      [{ status: "settled", decisionsSentAt: SENT }, new Date("2026-10-30T09:00:00Z")],
      [{ status: "cancelled" }, NOW],
    ];
    for (const [round, now] of moments) {
      collect(lifecycle({ round, now, sent: 3 }));
      collect(lifecycle({ round, now, canRunTerm: false }));
    }
    assert.ok(strings.length > 60);
    const dash = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
    for (const text of strings) {
      assert.doesNotMatch(text, /\bround\b/i, text);
      assert.doesNotMatch(text, dash, text);
    }
  });
});
