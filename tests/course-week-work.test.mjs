/**
 * THE WEEK YOU SUBMIT: a week's work saves as you go and has one Submit;
 * submitting locks the week, and so does the group's session starting; the
 * people running the group can reopen it for one person; every tick, untick,
 * save, submit and reopen is logged with its time; and the people who read
 * somebody's work read their written answer only once the week is submitted
 * or locked (privacy v15, "Changing your work").
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. The model, pure: when a week locks (a dated session, a cancelled one, a
 *     group with no time, somebody told their group late, nobody placed yet,
 *     a facilitator of two groups), where it stands (open, submitted, locked,
 *     reopened and locked again), whether a written answer may be read, what
 *     "done" means, and the check before Submit.
 *  2. The words, run: the line that says until when work can change, the
 *     check, the staff line, never a mark, a grade or a score, and no dash.
 *  3. The routes, executed on AGI Strategy's run in week 3
 *     (`tests/lib/writtenAnswersWorld.mjs`): Submit as every caller, the
 *     lock it leaves on the written answer and the ticks, the session's own
 *     lock, Reopen as every caller (the review page's own "Reopen for edits"
 *     before it), who it tells its writer did it, that feedback already
 *     given stays, and the log.
 */
import { describe, test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";
import { B, NOW, RUN, makeWrittenAnswersWorld, ONE_BOX } from "./lib/writtenAnswersWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const model = await loadTs("lib/courses/weekWork/model.ts");
const lock = await loadTs("lib/courses/weekWork/lock.ts");
const words = await loadTs("lib/courses/weekWork/words.ts");
const progress = await loadTs("lib/courses/weekBlocks/progress.ts");

// ---------------------------------------------------------------------------
// 1. The model
// ---------------------------------------------------------------------------

/** One group's session in week `n`, on `dateKey` at `time` London (November is GMT). */
function session(n, dateKey, { time = "18:00", cancelled = false } = {}) {
  return {
    weekNumber: n,
    weekId: `w0${n}`,
    occurrence: 1,
    sessionKey: `w0${n}`,
    slotStartKey: dateKey,
    dateKey,
    session: { weekday: 2, startTimeLocal: time, durationMinutes: 120, location: "Room B2", meetingUrl: null, notes: "" },
    cancelled,
  };
}

/** Tuesdays at 6pm: weeks 2, 3 and 4 of a run, as Group B meets. */
const TUESDAYS = [session(2, "2026-11-10"), session(3, "2026-11-17"), session(4, "2026-11-24")];
const at = (iso) => new Date(iso);

describe("1. when a week locks, and where it stands", () => {
  test("a week locks when the group's session that week starts", () => {
    const source = { sessionLists: [TUESDAYS], toldAt: null };
    assert.deepEqual(lock.weekLockOf(source, 3), { at: at("2026-11-17T18:00:00Z"), by: "session" });
    assert.equal(lock.weekStateOf(source, 3, null, at("2026-11-17T17:59:00Z")).kind, "open");
    assert.deepEqual(lock.weekStateOf(source, 3, null, at("2026-11-17T18:00:00Z")), { kind: "locked", at: at("2026-11-17T18:00:00Z") });
  });

  test("a cancelled session moves the lock to the group's next session that meets", () => {
    const source = { sessionLists: [[session(2, "2026-11-10"), session(3, "2026-11-17", { cancelled: true }), session(4, "2026-11-24")]], toldAt: null };
    assert.deepEqual(lock.weekLockOf(source, 3), { at: at("2026-11-24T18:00:00Z"), by: "next-session" });
    assert.equal(lock.weekStateOf(source, 3, null, at("2026-11-18T12:00:00Z")).kind, "open");
  });

  test("with no time to lock at, only Submit locks it: no time set, nobody placed, told the group after the session", () => {
    assert.deepEqual(lock.weekLockOf({ sessionLists: [[{ ...session(3, ""), dateKey: "" }]], toldAt: null }, 3), { at: null, by: "undated" });
    assert.deepEqual(lock.weekLockOf({ sessionLists: [TUESDAYS] , toldAt: null }, 5), { at: null, by: "undated" }, "a week the plan does not teach");
    assert.deepEqual(lock.weekLockOf(lock.NO_GROUP, 1), { at: null, by: "no-group" });
    // Told on Wed 11 Nov: week 2 (Tue 10 Nov) had already met, week 3 had not.
    const late = { sessionLists: [TUESDAYS], toldAt: at("2026-11-11T09:00:00Z") };
    assert.deepEqual(lock.weekLockOf(late, 2), { at: null, by: "joined-late" });
    assert.deepEqual(lock.weekLockOf(late, 3), { at: at("2026-11-17T18:00:00Z"), by: "session" });
    assert.equal(lock.weekStateOf(late, 2, null, at("2026-12-01T12:00:00Z")).kind, "open", "a week before they joined never locks by the clock");
  });

  test("a facilitator of two groups locks at the earlier of the two sessions that week", () => {
    const thursdays = [session(3, "2026-11-12"), session(4, "2026-11-19")];
    const source = { sessionLists: [TUESDAYS, thursdays], toldAt: null };
    assert.deepEqual(lock.weekLockOf(source, 3), { at: at("2026-11-12T18:00:00Z"), by: "session" });
  });

  test("submitted is submitted until a reopen; a reopen lasts until a submit or the next session that meets", () => {
    const source = { sessionLists: [TUESDAYS], toldAt: null };
    const submitted = { submittedAt: at("2026-11-16T21:31:00Z"), reopenedAt: null, reopenedByUid: "" };
    assert.deepEqual(lock.weekStateOf(source, 3, submitted, at("2026-11-16T22:00:00Z")), { kind: "submitted", at: at("2026-11-16T21:31:00Z") });
    assert.equal(lock.weekStateOf(source, 3, submitted, at("2026-12-01T00:00:00Z")).kind, "submitted", "the session does not move a submit");
    // Reopened on Wed 18 Nov, after week 3's session: open until week 4's.
    const reopened = { submittedAt: null, reopenedAt: at("2026-11-18T10:00:00Z"), reopenedByUid: "rahul" };
    assert.deepEqual(lock.weekStateOf(source, 3, reopened, at("2026-11-20T10:00:00Z")), {
      kind: "reopened",
      at: at("2026-11-18T10:00:00Z"),
      byUid: "rahul",
      locksAt: at("2026-11-24T18:00:00Z"),
    });
    assert.deepEqual(lock.weekStateOf(source, 3, reopened, at("2026-11-24T18:00:00Z")), { kind: "locked", at: at("2026-11-24T18:00:00Z") });
    // Reopened before its own session: that session locks it again.
    const early = { submittedAt: null, reopenedAt: at("2026-11-16T10:00:00Z"), reopenedByUid: "rahul" };
    assert.equal(lock.weekStateOf(source, 3, early, at("2026-11-17T12:00:00Z")).locksAt.toISOString(), "2026-11-17T18:00:00.000Z");
    // A week reopened with no session left to date stays open until it is submitted.
    assert.equal(lock.weekStateOf(source, 4, { ...reopened, reopenedAt: at("2026-11-25T10:00:00Z") }, at("2027-01-01T00:00:00Z")).kind, "reopened");
  });

  test("submitted and locked weeks take no work; open and reopened ones do", () => {
    const states = [
      [{ kind: "open", locksAt: null, by: "undated" }, true],
      [{ kind: "reopened", at: NOW, byUid: "rahul", locksAt: null }, true],
      [{ kind: "submitted", at: NOW }, false],
      [{ kind: "locked", at: NOW }, false],
    ];
    for (const [state, takes] of states) {
      assert.equal(model.weekTakesWork(state), takes, state.kind);
      assert.equal(model.weekIsShut(state), !takes, state.kind);
    }
  });

  test("a written answer may be read once the week is submitted or locked, or when it was sent before weeks were submitted; never while open or reopened otherwise", () => {
    const sent = { firstSentAt: at("2026-11-01T10:00:00Z") };
    const draft = { firstSentAt: null };
    const cases = [
      [{ kind: "submitted", at: NOW }, draft, true],
      [{ kind: "locked", at: NOW }, draft, true],
      [{ kind: "open", locksAt: NOW, by: "session" }, draft, false],
      [{ kind: "open", locksAt: NOW, by: "session" }, sent, true],
      [{ kind: "reopened", at: NOW, byUid: "rahul", locksAt: null }, sent, false],
      [{ kind: "reopened", at: NOW, byUid: "rahul", locksAt: null }, draft, false],
      [{ kind: "open", locksAt: null, by: "joined-late" }, null, false],
    ];
    for (const [state, answer, readable] of cases) {
      assert.equal(model.workIsReadable(state, answer), readable, `${state.kind} with ${answer?.firstSentAt ? "a sent" : "no sent"} answer`);
    }
  });
});

/** A small block week: a reading and a step to tick, a reflection, an answer of two boxes, a pack, a talk. */
const WEEK = [
  {
    id: "tw",
    type: "thisWeek",
    rows: [
      { type: "task", what: "Read and reflect", time: "", when: "before", whenText: "", covers: ["p1"] },
      { type: "task", what: "Your plan", time: "", when: "dayBefore", whenText: "", covers: ["p2"] },
      { type: "task", what: "Your pathway", time: "", when: "before", whenText: "", covers: ["c1"] },
    ],
    total: "",
    note: [],
  },
  {
    id: "p1",
    type: "part",
    title: "Two views",
    time: "",
    framing: [],
    blocks: [
      { id: "s1", type: "source", kind: "read", lead: "", title: "Compute as a lever", url: "https://example.com/a", by: "", date: "", time: "", compute: "", note: [] },
      { id: "ck", type: "checklist", items: [{ id: "step1", title: "Book a room" }] },
      { id: "r1", type: "reflection", prompts: [{ id: "rp1", text: "What changed your mind?" }, { id: "rp2", text: "And why?" }] },
    ],
  },
  {
    id: "p2",
    type: "part",
    title: "Your plan, the week’s written answer",
    time: "",
    framing: [],
    blocks: [
      {
        id: "wa",
        type: "writtenAnswer",
        prompt: [],
        boxes: [{ id: "b1", label: "One", hint: "" }, { id: "b2", label: "Two", hint: "" }],
        guidance: [],
        words: { min: 10, max: 20 },
        due: "dayBefore",
      },
    ],
  },
  { id: "c1", type: "chooseOne", form: "table", title: "Pathway", givenBy: "fellow", kind: "read", time: "", groups: [], packs: [{ id: "pk1", name: "Policy", time: "", note: [], read: [] }] },
];

describe("2. done, and the check before Submit", () => {
  const tasks = progress.weekTaskNeeds(WEEK);
  const nothing = { isTicked: () => false, isWritten: () => false, isSent: () => false, packOf: () => null, isReady: () => false };

  test("a week that asks for something written is done once it is submitted and every tick it counts is ticked", () => {
    assert.equal(model.weekAsksForWriting(WEEK), true);
    const ticked = new Set(["s1", "step1", "pk1"]);
    const all = { ...nothing, isTicked: (id) => ticked.has(id), packOf: () => "pk1" };
    assert.equal(model.weekDone({ tasks, state: all, writes: true, submitted: false }), false, "not submitted");
    assert.equal(model.weekDone({ tasks, state: all, writes: true, submitted: true }), true);
    assert.equal(model.weekDone({ tasks, state: { ...all, isTicked: (id) => id !== "pk1" }, writes: true, submitted: true }), false, "the pack's reading");
    assert.equal(model.weekDone({ tasks, state: { ...all, packOf: () => null }, writes: true, submitted: true }), false, "no pack yet");
    // A week with only things to tick has no Submit, and is done once they are ticked.
    const readings = [WEEK[0], { ...WEEK[1], blocks: [WEEK[1].blocks[0]] }];
    assert.equal(model.weekAsksForWriting(readings), false);
    assert.equal(model.weekDone({ tasks: progress.weekTaskNeeds(readings), state: { ...nothing, isTicked: () => true }, writes: false, submitted: false }), true);
    // A week with nothing to count is never "not done".
    assert.equal(model.weekDone({ tasks: [], state: nothing, writes: false, submitted: false }), true);
  });

  test("one person's week as a staff page counts it: the same tasks, done, started or not", () => {
    const touched = model.personWeekProgress({ tasks, state: { ...nothing, isTicked: (id) => id === "s1" }, writes: true, submitted: false, touched: true });
    assert.deepEqual(touched, { done: 0, of: 3, weekDone: false, started: true });
    const fresh = model.personWeekProgress({ tasks, state: nothing, writes: true, submitted: false, touched: false });
    assert.deepEqual(fresh, { done: 0, of: 3, weekDone: false, started: false });
  });

  test("the check names each thing not done, in page order, and an answer over its limit stops Submit", () => {
    const check = model.weekCheck(WEEK, tasks, { ...nothing, isWritten: (id) => id === "rp1", answerOf: () => ({ words: 25, emptyBoxes: 1 }) });
    assert.deepEqual(check, [
      { kind: "readings", titles: ["Compute as a lever"] },
      { kind: "steps", count: 1 },
      { kind: "pack", title: "pathway", picked: false, byYou: true },
      { kind: "reflection", partNumber: 1, empty: false },
      { kind: "answer", emptyBoxes: 1, boxes: 2 },
      { kind: "overLimit", words: 25, limit: 20 },
    ]);
    assert.equal(model.checkStopsSubmit(check), true);
    const done = model.weekCheck(WEEK, tasks, {
      isTicked: () => true,
      isWritten: () => true,
      isSent: () => true,
      packOf: () => "pk1",
      isReady: () => true,
      answerOf: () => ({ words: 12, emptyBoxes: 0 }),
    });
    assert.deepEqual(done, []);
    assert.equal(model.checkStopsSubmit(done), false);
  });
});

describe("3. the words", () => {
  const room = { room: "Portland A21", reopenedBy: "Rahul" };

  test("the week's page says until when the work can change, in every state (privacy v15)", () => {
    assert.equal(
      words.lockLineWords({ kind: "open", locksAt: at("2026-11-18T15:00:00Z"), by: "session" }, room),
      "Your session: Wed 18 Nov, 3pm, Portland A21. This week locks when it starts.",
    );
    assert.equal(
      words.lockLineWords({ kind: "open", locksAt: at("2026-11-25T15:00:00Z"), by: "next-session" }, room),
      "Your session this week is cancelled. This week locks when your next session starts, Wed 25 Nov, 3pm.",
    );
    assert.equal(
      words.lockLineWords({ kind: "open", locksAt: null, by: "undated" }, room),
      "This week locks when your group’s session starts. Your group’s time isn’t set yet.",
    );
    assert.equal(words.lockLineWords({ kind: "open", locksAt: null, by: "no-group" }, room), "This week locks when you submit it.");
    assert.equal(
      words.lockLineWords({ kind: "open", locksAt: null, by: "joined-late" }, room),
      "You joined your group after this week’s session, so this week locks only when you submit it.",
    );
    assert.equal(
      words.lockLineWords({ kind: "submitted", at: at("2026-11-10T21:31:00Z") }, room),
      "Submitted Tue 10 Nov, 9:31pm. Your work for this week is locked.",
    );
    assert.equal(words.lockLineWords({ kind: "locked", at: at("2026-11-18T15:00:00Z") }, room), "Locked when your session started on Wed 18 Nov, 3pm.");
    assert.equal(
      words.lockLineWords({ kind: "reopened", at: NOW, byUid: "rahul", locksAt: at("2026-11-25T15:00:00Z") }, room),
      "Rahul reopened this week for you. It locks again when you submit it, or at your next session, Wed 25 Nov, 3pm.",
    );
  });

  test("the check, the locked box and the readers' line say who reads the written answer, and when", () => {
    assert.equal(words.notDoneLeadWords(2), "Two things aren’t done yet:");
    assert.equal(words.notDoneLeadWords(1), "One thing isn’t done yet:");
    assert.equal(words.notDoneWords({ kind: "readings", titles: ["Compute as a lever for governance"] }), "One reading isn’t ticked: “Compute as a lever for governance”.");
    assert.equal(words.notDoneWords({ kind: "answer", emptyBoxes: 1, boxes: 3 }), "One box of your written answer is empty.");
    assert.equal(words.notDoneWords({ kind: "overLimit", words: 412, limit: 350 }), "Your written answer is 412 words. The limit is 350.");
    assert.equal(
      words.checkLockLineWords({ hasAnswer: true, ownIsTheLeads: false }),
      "Submitting locks your work for this week, and your facilitator and the programme team can then read your written answer.",
    );
    assert.equal(
      words.answerReadersWords({ kind: "facilitators", names: ["Rahul"] }, "Claudia"),
      "Once you submit, or your week locks, Rahul, Claudia and admins can read your written answer.",
    );
    assert.equal(
      words.answerReadersWords({ kind: "lead", leadName: "Claudia" }, "Claudia"),
      "Once you submit, or your week locks, Claudia and admins can read your written answer.",
    );
    assert.equal(
      words.lockedBoxWords({ kind: "facilitators", names: ["Rahul"] }, true),
      "You didn’t submit this week, but everything you wrote was saved and Rahul can read it.",
    );
    assert.equal(words.askToReopenWords({ kind: "facilitators", names: ["Rahul", "Sofia"] }), "Ask Rahul or Sofia if you need it reopened.");
    assert.equal(words.askToReopenWords({ kind: "lead", leadName: "Claudia" }), "Ask Claudia if you need it reopened.");
  });

  test("a staff page leads with Submitted, and says only started, never how much, until the week is submitted or locked", () => {
    const some = { done: 2, of: 3, weekDone: false, started: true };
    assert.deepEqual(words.personWeekWords({ kind: "submitted", at: at("2026-11-10T21:31:00Z") }, some), { text: "Submitted Tue 10 Nov, 9:31pm", detail: "2 of 3 done" });
    assert.deepEqual(words.personWeekWords({ kind: "locked", at: NOW }, some), { text: "Not submitted", detail: "2 of 3 done" });
    assert.deepEqual(words.personWeekWords({ kind: "open", locksAt: NOW, by: "session" }, some), { text: "2 of 3 done", detail: null });
    assert.deepEqual(words.personWeekWords({ kind: "open", locksAt: NOW, by: "session" }, { ...some, done: 0 }), { text: "Started", detail: null });
    assert.deepEqual(words.personWeekWords({ kind: "open", locksAt: NOW, by: "session" }, { ...some, done: 0, started: false }), { text: "Not started", detail: null });
    assert.deepEqual(words.personWeekWords({ kind: "open", locksAt: null, by: "joined-late" }, { ...some, done: 0, started: false }), { text: "Before they joined", detail: null });
    assert.deepEqual(words.personWeekWords({ kind: "reopened", at: NOW, byUid: "rahul", locksAt: null }, some), { text: "Reopened, not submitted again", detail: "2 of 3 done" });
    assert.equal(words.groupLockWords(at("2026-11-18T15:00:00Z"), at("2026-11-17T12:00:00Z")), "Locks Wed 3pm");
    assert.equal(words.groupLockWords(at("2026-11-18T15:00:00Z"), at("2026-11-19T12:00:00Z")), "Locked Wed 3pm");
  });

  test("no word of the week you submit says mark, grade or score, or carries a dash", () => {
    const all = Object.values(words).filter((value) => typeof value === "string");
    for (const value of all) {
      assert.doesNotMatch(value, /\b(?:marks?|marked|grades?|scores?)\b/i, value);
      assert.doesNotMatch(value, /[–—]/, value);
    }
    for (const kind of ["readings", "steps", "pack", "reflection", "boxes", "answer", "talk", "overLimit"]) {
      const sample = {
        readings: { kind, titles: ["A"] },
        steps: { kind, count: 2 },
        pack: { kind, title: "pathway", picked: true, byYou: true },
        reflection: { kind, partNumber: 2, empty: true },
        boxes: { kind, title: "My action plan", empty: 2 },
        answer: { kind, emptyBoxes: 2, boxes: 3 },
        talk: { kind },
        overLimit: { kind, words: 21, limit: 20 },
      }[kind];
      assert.doesNotMatch(words.notDoneWords(sample), /\b(?:marks?|marked|grades?|scores?)\b|[–—]/i, kind);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The routes
// ---------------------------------------------------------------------------

const w = await makeWrittenAnswersWorld("__weekWork");
/** Twenty one words: inside week 2's range of 20 to 40. */
const ENOUGH = Array.from({ length: 21 }, (_, i) => `word${i + 1}`).join(" ");
/** Group B meets on Tuesdays at 6pm: Monday 9 Nov is before week 2's session. */
const BEFORE_WEEK_TWO = "2026-11-09T09:00:00Z";

beforeEach(() => w.reset());

describe("4. Submit, the lock and Reopen", () => {
  test("Submit sends the written answer once, locks the week, and logs it; a second Submit is refused", async () => {
    w.at(BEFORE_WEEK_TWO);
    assert.equal((await w.write("chloe", 2, { text: ENOUGH })).status, 200);
    const submitted = await w.submitWeek("chloe", 2);
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.deepEqual(Object.keys(submitted.body).sort(), ["ok", "sent", "work"]);
    assert.equal(submitted.body.work.state, "submitted");
    assert.deepEqual(submitted.body.sent, [{ id: ONE_BOX.id, at: new Date(BEFORE_WEEK_TWO).toISOString() }]);
    const row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(new Date(row.firstSentAt).toISOString(), new Date(BEFORE_WEEK_TWO).toISOString(), "the answer's first-sent time is the submit's");
    const stored = w.weekWorkOf("chloe", 2);
    assert.equal(stored.submitCount, 1);
    assert.ok(stored.submittedAt && stored.firstSubmittedAt);
    assert.deepEqual(w.logOf("chloe").map((entry) => entry.kind), ["save", "submit"]);
    // Locked: no more writing, ticking or submitting until it is reopened.
    const after = await w.write("chloe", 2, { text: `${ENOUGH} more` });
    assert.equal(after.status, 409);
    assert.equal(after.body.error, words.WEEK_SHUT);
    assert.equal((await w.tick("chloe", 2, "n2-s1")).status, 409);
    const again = await w.submitWeek("chloe", 2);
    assert.deepEqual([again.status, again.body.error], [409, words.ALREADY_SUBMITTED]);
  });

  test("Submit anyway: an empty answer is submitted as it is and never sent; an answer over its limit stops it", async () => {
    w.at(BEFORE_WEEK_TWO);
    const empty = await w.submitWeek("kofi", 2);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.sent, []);
    assert.equal(w.world.db.read(w.rowPath("kofi", 2)), undefined, "nothing written is nothing sent");
    const long = Array.from({ length: 41 }, (_, i) => `w${i}`).join(" ");
    assert.equal((await w.write("farah", 2, { text: long })).status, 200, "a draft may run over while it is written");
    const over = await w.submitWeek("farah", 2);
    assert.deepEqual([over.status, over.body.error], [409, "Your written answer is 41 words. The limit is 40."]);
    assert.equal(w.weekWorkOf("farah", 2), undefined, "nothing is stamped");
  });

  test("Submit is the person's own: everybody else is refused, a view-as session too, and a body is checked first", async () => {
    w.at(BEFORE_WEEK_TWO);
    for (const who of ["claudia", "zach", "tess", "una", "omar", "nobody"]) {
      const answer = await w.submitWeek(who, 2);
      assert.equal(answer.status, 403, `${who} submitted: ${JSON.stringify(answer.body)}`);
    }
    assert.equal((await w.submitWeek(null, 2)).status, 401);
    assert.equal((await w.submitWeek("chloe", 2, { viewAs: true })).status, 403);
    assert.equal((await w.submitWeek("chloe", 2, { body: {} })).status, 400);
    assert.equal((await w.submitWeek("chloe", 1)).status, 404, "a week written before blocks keeps its own pages");
    assert.equal(w.weekWorkOf("chloe", 2), undefined);
  });

  test("the session locks a week nobody submitted, and the written answer may then be read", async () => {
    w.at(BEFORE_WEEK_TWO);
    assert.equal((await w.write("chloe", 2, { text: ENOUGH })).status, 200);
    w.at("2026-11-10T18:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} late` })).status, 409, "locked when the session started");
    assert.equal((await w.tick("chloe", 2, "n2-s1")).status, 409);
    assert.deepEqual([(await w.submitWeek("chloe", 2)).status], [409]);
    // Week 3 meets a week later, so it still takes work.
    assert.equal((await w.tick("chloe", 3, "n3-s1")).status, 200);
  });

  test("Reopen is for the people running the person's group: never the person, never anybody else; it clears the submit and logs who", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.submitWeek("chloe", 2);
    for (const who of ["chloe", "farah", "tess", "una", "nobody"]) {
      const refused = await w.reopenWeek(who, "chloe", 2);
      assert.equal(refused.status, 403, `${who} reopened Chloe's week`);
    }
    assert.equal((await w.reopenWeek("rahul", "chloe", 2, { viewAs: true })).status, 403);
    const reopened = await w.reopenWeek("rahul", "chloe", 2);
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.deepEqual(Object.keys(reopened.body).sort(), ["ok", "work"]);
    assert.equal(reopened.body.work.state, "reopened");
    assert.equal(reopened.body.work.reopened.byName, "Rahul");
    assert.equal(reopened.body.work.locksAt, "2026-11-10T18:00:00.000Z", "it locks again at the group's next session");
    const stored = w.weekWorkOf("chloe", 2);
    assert.equal(stored.submittedAt, null);
    assert.equal(stored.reopenedByUid, "rahul");
    assert.equal(stored.reopenCount, 1);
    assert.deepEqual(w.logOf("chloe").map((entry) => [entry.kind, entry.byUid]), [["save", ""], ["submit", ""], ["reopen", "rahul"]]);
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} again` })).status, 200, "it takes work again");
    // Not locked any more: nothing to reopen.
    assert.equal((await w.reopenWeek("rahul", "chloe", 2)).status, 409);
    // The lead and admins reopen too; resubmitting counts again.
    assert.equal((await w.submitWeek("chloe", 2)).status, 200);
    assert.equal((await w.reopenWeek("claudia", "chloe", 2)).status, 200);
    assert.equal((await w.submitWeek("chloe", 2)).status, 200);
    assert.equal((await w.reopenWeek("zach", "chloe", 2)).status, 200);
    assert.equal(w.weekWorkOf("chloe", 2).submitCount, 3);
    assert.equal(w.weekWorkOf("chloe", 2).reopenCount, 3);
  });

  test("the group's other facilitator reopens a fellow's week too; its writer is told who, on their own week, never whether it was late; nobody is emailed", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.submitWeek("chloe", 2);
    w.at("2026-11-09T10:15:00Z");
    const reopened = await w.reopenWeek("sofia", "chloe", 2);
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.work.reopened.byName, "Sofia");
    assert.equal(w.weekWorkOf("chloe", 2).reopenedByUid, "sofia");
    assert.deepEqual(w.logOf("chloe").map((entry) => [entry.kind, entry.byUid]).at(-1), ["reopen", "sofia"]);
    // Her own week says so, through the overview, from when.
    const overview = await w.call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    const work = overview.body.weeks.find((week) => week.weekNumber === 2).work;
    assert.deepEqual([work.state, work.reopened.byName, work.reopened.at, work.locksAt], ["reopened", "Sofia", "2026-11-09T10:15:00.000Z", "2026-11-10T18:00:00.000Z"]);
    // Her own read of the answer never says whether it was late; and a reopen emails nobody.
    const own = await w.ownRowsOf("chloe", 2);
    assert.equal(own.status, 200);
    assert.doesNotMatch(JSON.stringify(own.body), /late/i);
    assert.equal(w.world.mail.length, 0);
    // The change after it has its own time; the first-sent time stays the submit's.
    w.at("2026-11-09T10:20:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} again` })).status, 200);
    const row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(new Date(row.editedAt).toISOString(), "2026-11-09T10:20:00.000Z");
    assert.equal(new Date(row.firstSentAt).toISOString(), new Date(BEFORE_WEEK_TWO).toISOString());
  });

  test("a reopen after feedback goes through: the feedback stays, with its date, and the answer can change again", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.submitWeek("chloe", 2);
    w.at("2026-11-09T11:00:00Z");
    const levels = w.levels();
    assert.equal((await w.review("rahul", "chloe", 2, { action: "feedback", levels, comment: "Clear." })).status, 200);
    const given = w.world.db.read(w.rowPath("chloe", 2)).feedback;
    w.at("2026-11-09T12:00:00Z");
    assert.equal((await w.reopenWeek("sofia", "chloe", 2)).status, 200, "reopened after feedback");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} more` })).status, 200);
    const row = w.world.db.read(w.rowPath("chloe", 2));
    assert.deepEqual(row.feedback, given, "the feedback stays as it was given");
    assert.equal(new Date(row.feedback.sentAt).toISOString(), "2026-11-09T11:00:00.000Z");
    // Her own read still leads to it.
    const own = await w.ownRowsOf("chloe", 2);
    assert.equal(own.body.responses.find((entry) => entry.exerciseId === ONE_BOX.id).written.feedback.byName, "Rahul");
  });

  test("a facilitator's own week is reopened by the lead and admins alone, never a co-facilitator", async () => {
    w.at(BEFORE_WEEK_TWO);
    assert.equal((await w.submitWeek("rahul", 2)).status, 200);
    assert.equal((await w.reopenWeek("sofia", "rahul", 2)).status, 403, "a co-facilitator");
    assert.equal((await w.reopenWeek("claudia", "rahul", 2)).status, 200);
  });

  test("an answer opened before weeks were submitted stays locked until its week is reopened, which clears it", async () => {
    w.world.db.seed(w.rowPath("chloe", 3), {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      exerciseId: "wa-three",
      responseType: "text",
      boxes: { "wb-what": "Lamps." },
      words: 1,
      firstSentAt: new Date("2026-11-15T10:00:00Z"),
      submittedAt: new Date("2026-11-15T10:00:00Z"),
      openedAt: new Date("2026-11-16T10:00:00Z"),
      openedByUid: "rahul",
      reviewStatus: "unreviewed",
    });
    assert.equal((await w.write("chloe", 3, { boxes: { "wb-what": "Lamps and keepers." } })).status, 409);
    assert.equal((await w.submitWeek("chloe", 3)).status, 200, "the week itself still submits");
    assert.equal((await w.reopenWeek("rahul", "chloe", 3)).status, 200);
    const row = w.world.db.read(w.rowPath("chloe", 3));
    assert.equal(row.openedAt, undefined);
    assert.equal(row.reopenedByUid, "rahul");
    // Its writer's own read of the answer no longer says who opened it, and says who reopened it.
    const own = (await w.ownRowsOf("chloe", 3)).body.responses.find((entry) => entry.exerciseId === "wa-three");
    assert.deepEqual([own.written.opened, own.written.reopened.byName], [null, "Rahul"]);
    assert.equal((await w.write("chloe", 3, { boxes: { "wb-what": "Lamps and keepers." } })).status, 200);
  });

  test("a page opened before weeks were submitted is told to reload when it asks to send", async () => {
    const old = await w.call("chloe", w.routes.write.PUT, { runId: RUN.agi, answerId: ONE_BOX.id }, { course: true, body: { weekId: "w02", text: ENOUGH, send: true } });
    assert.equal(old.status, 400);
    assert.match(old.body.error, /Reload the page/);
  });
});

describe("5. ticks go through the tick route, which locks and logs them", () => {
  test("a tick and an untick are written by the server, logged once each, and a tick kept keeps its time", async () => {
    const ticked = await w.tick("chloe", 3, "n3-s1");
    assert.deepEqual([ticked.status, ticked.body], [200, { ok: true, itemId: "n3-s1", completed: true }]);
    const row = w.world.db.read(`courseProgress/${RUN.agi}__chloe__n3-s1`);
    assert.equal(row.completed, true);
    const first = new Date(row.completedAt).toISOString();
    w.at("2026-11-17T13:00:00Z");
    assert.equal((await w.tick("chloe", 3, "n3-s1")).status, 200, "ticking again changes nothing");
    assert.equal(new Date(w.world.db.read(`courseProgress/${RUN.agi}__chloe__n3-s1`).completedAt).toISOString(), first);
    assert.equal((await w.tick("chloe", 3, "n3-s1", false)).status, 200);
    assert.equal(w.world.db.read(`courseProgress/${RUN.agi}__chloe__n3-s1`).completedAt, undefined);
    assert.deepEqual(w.logOf("chloe").map((entry) => [entry.kind, entry.itemKind, entry.itemId]), [
      ["tick", "material", "n3-s1"],
      ["untick", "material", "n3-s1"],
    ]);
  });

  test("ticks are the person's own: everybody else is refused, and an item not on the week is not found", async () => {
    for (const who of ["claudia", "zach", "una", "omar", "nobody"]) {
      assert.equal((await w.tick(who, 3, "n3-s1")).status, 403, `${who} ticked`);
    }
    assert.equal((await w.tick(null, 3, "n3-s1")).status, 401);
    assert.equal((await w.tick("chloe", 3, "n3-s1", true, { viewAs: true })).status, 403);
    assert.equal((await w.tick("chloe", 3, "n2-s1")).status, 404, "another week's source");
    assert.equal((await w.call("chloe", w.routes.tick.PUT, { runId: RUN.agi, itemId: "n3-s1" }, { course: true, body: { completed: true } })).status, 400);
  });

  test("Group B's week 3 is still open at noon; Group A's locked when it met on Thursday", async () => {
    assert.equal((await w.tick("chloe", 3, "n3-s1")).status, 200, B);
    assert.equal((await w.tick("amara", 3, "n3-s1")).status, 409);
  });
});
