/**
 * THE WEEK STAYS OPEN: a week's work saves as you go and nothing closes at
 * the session, or at a send: a week takes ticks, words, picks and sends until
 * the programme closes (14 days after the run's last session, unless the run
 * says otherwise), and is read only after. What is added or changed after the
 * session is late, worked out when read; a written answer has its own Send,
 * and before the session its readers read it as last sent; earlier versions
 * are kept when a change crosses a line; feedback and ratings say which
 * version they were about; and "done" keeps everybody who was done under the
 * old rule (privacy v17, "Changing your work").
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. The model, pure: the session a person is due at (moved, cancelled with
 *     the group keeping pace, pushed back, no time set, nobody placed, told
 *     their group late, a facilitator holding a place, one holding none),
 *     when the programme closes (no setting, a setting, a group pushed back,
 *     a run with a long break, no sessions), where a week stands, late and
 *     its words at each boundary, and which words of a written answer may be
 *     read before and after the session.
 *  2. Done, as a table: every way to be done under the old rule is done
 *     still, a submitted week with an empty reflection among them; when a
 *     week became done; and the check before Send.
 *  3. The words: the line under the week's title (until when the work can
 *     change), a closed programme, how late, the staff line, and never a
 *     mark, a grade, a score or a dash.
 *  4. The routes, executed on AGI Strategy's run in week 3
 *     (`tests/lib/writtenAnswersWorld.mjs`): the answer's own Send and Send
 *     again, the old Submit (kept for an old page), what the review page
 *     reads before and after the session, the earlier version kept at each
 *     line (and once only), feedback and ratings pointing at the version they
 *     were about, a closed programme refusing every write with when it
 *     closed, and the old Reopen answering that weeks stay open.
 *  5. Ticks: open after the session, refused once the programme closes.
 *  6. Reflections (`tests/lib/weekBlocksPageWorld.mjs`): the version at the
 *     session kept once, an emptied box kept for its version, and a closed
 *     programme.
 */
import { describe, test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";
import { B, NOW, RUN, makeWrittenAnswersWorld, ONE_BOX, BOXES } from "./lib/writtenAnswersWorld.mjs";
import { makeWeekBlocksPageWorld } from "./lib/weekBlocksPageWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const model = await loadTs("lib/courses/weekWork/model.ts");
const sessionMoment = await loadTs("lib/courses/weekWork/sessionDue.ts");
const closes = await loadTs("lib/courses/weekWork/closes.ts");
const versions = await loadTs("lib/courses/weekWork/versions.ts");
const words = await loadTs("lib/courses/weekWork/words.ts");
const pageFacts = await loadTs("lib/courses/weekWork/pageFacts.ts");
const progress = await loadTs("lib/courses/weekBlocks/progress.ts");
const courses = await loadTs("lib/firestore/courses.ts");
const groupsStore = await loadTs("lib/firestore/courseGroups.ts");

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
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("1. the session a person is due at, when the programme closes, and where a week stands", () => {
  test("the session is the group's session that week; moved or put right, it is when it meets; pushed back, its new session", () => {
    const source = { sessionLists: [TUESDAYS], toldAt: null };
    assert.deepEqual(sessionMoment.weekDueOf(source, 3), { at: at("2026-11-17T18:00:00Z"), by: "session" });
    // Moved within its week (or put right after it met): when it meets.
    const moved = { sessionLists: [[session(2, "2026-11-10"), session(3, "2026-11-19", { time: "10:00" }), session(4, "2026-11-24")]], toldAt: null };
    assert.deepEqual(sessionMoment.weekDueOf(moved, 3), { at: at("2026-11-19T10:00:00Z"), by: "session" });
    // Pushed back a week: the week's own session is now a week later.
    const pushed = { sessionLists: [[session(2, "2026-11-10"), session(3, "2026-11-24"), session(4, "2026-12-01")]], toldAt: null };
    assert.deepEqual(sessionMoment.weekDueOf(pushed, 3), { at: at("2026-11-24T18:00:00Z"), by: "session" });
  });

  test("cancelled with the group keeping pace: when the session would have started, never the next one that meets", () => {
    const source = { sessionLists: [[session(2, "2026-11-10"), session(3, "2026-11-17", { cancelled: true }), session(4, "2026-11-24")]], toldAt: null };
    assert.deepEqual(sessionMoment.weekDueOf(source, 3), { at: at("2026-11-17T18:00:00Z"), by: "cancelled" });
  });

  test("no session to tell against: no time set, a week the plan does not teach, nobody placed, told the group after it started", () => {
    assert.deepEqual(sessionMoment.weekDueOf({ sessionLists: [[{ ...session(3, ""), dateKey: "" }]], toldAt: null }, 3), { at: null, by: "undated" });
    assert.deepEqual(sessionMoment.weekDueOf({ sessionLists: [TUESDAYS], toldAt: null }, 5), { at: null, by: "undated" }, "a week the plan does not teach");
    assert.deepEqual(sessionMoment.weekDueOf(sessionMoment.NO_GROUP, 1), { at: null, by: "no-group" });
    // Told on Wed 11 Nov: week 2 (Tue 10 Nov) had already met, week 3 had not.
    const late = { sessionLists: [TUESDAYS], toldAt: at("2026-11-11T09:00:00Z") };
    assert.deepEqual(sessionMoment.weekDueOf(late, 2), { at: null, by: "joined-late" });
    assert.deepEqual(sessionMoment.weekDueOf(late, 3), { at: at("2026-11-17T18:00:00Z"), by: "session" });
    // The group's own session, whenever they were told: what "Feedback to write" counts from.
    assert.deepEqual(sessionMoment.groupSessionAt(late, 2), at("2026-11-10T18:00:00Z"));
  });

  test("a facilitator holding a place goes by that group; one holding none, by the earliest of the groups they run", () => {
    const thursdays = [session(3, "2026-11-12"), session(4, "2026-11-19")];
    // Holding none: every group they run, the earliest.
    assert.deepEqual(sessionMoment.weekDueOf({ sessionLists: [TUESDAYS, thursdays], toldAt: null }, 3), { at: at("2026-11-12T18:00:00Z"), by: "session" });
    // Holding a place (the readers hand the one group they hold it in).
    assert.deepEqual(sessionMoment.weekDueOf({ sessionLists: [TUESDAYS], toldAt: null }, 3), { at: at("2026-11-17T18:00:00Z"), by: "session" });
  });

  test("the programme closes at the end of the London day 14 days after its last session, or the run's own number of days", () => {
    // Wed 9 Dec: the end of Wed 23 Dec is the midnight that starts Thu 24 Dec (GMT).
    assert.deepEqual(closes.workClosesAfter("2026-12-09", null), at("2026-12-24T00:00:00Z"));
    assert.deepEqual(closes.workClosesAfter("2026-12-09", 0), at("2026-12-10T00:00:00Z"), "0 days: the end of the last session's day");
    assert.deepEqual(closes.workClosesAfter("2026-12-09", 7), at("2026-12-17T00:00:00Z"));
    // A summer close is told in London's own time (BST): midnight is 11pm the day before in UTC.
    assert.deepEqual(closes.workClosesAfter("2027-06-01", 14), at("2027-06-15T23:00:00Z"));
    assert.equal(closes.workClosesAfter(null, null), null, "no session to date: never closes by the clock");
    assert.equal(closes.WORK_CLOSES_AFTER_DAYS, 14);
    // The setting is read only as a whole number of days.
    for (const [stored, read] of [[undefined, null], [10, 10], [0, 0], [-1, null], [2.5, null], ["14", null], [400, null]]) {
      assert.equal(courses.normalizeCourseRun("r", { workClosesAfterDays: stored }).workClosesAfterDays, read, String(stored));
    }
  });

  test("the close is told from the latest session any live group has: a group pushed back, a long break, an archived group, a cancelled last session, no sessions", () => {
    const week = (n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` });
    const run = (over = {}) =>
      courses.normalizeCourseRun("run", { startDate: "2026-10-29", weekPlan: [1, 2, 3, 4, 5, 6].map(week), ...over });
    const group = (id, over = {}) =>
      groupsStore.normalizeCourseGroup(id, {
        runId: "run",
        name: id,
        facilitatorUids: [],
        archived: false,
        session: { weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "", meetingUrl: null, notes: "" },
        ...over,
      });
    // Tuesdays: week 6 is Tue 8 Dec, so it closes at the end of Tue 22 Dec.
    assert.deepEqual(closes.workClosesAt(run(), [group("b")]), at("2026-12-23T00:00:00Z"));
    // Wednesdays meet later: the latest group decides.
    const wednesdays = group("c", { session: { weekday: 3, startTimeLocal: "13:00", durationMinutes: 120, location: "", meetingUrl: null, notes: "" } });
    assert.deepEqual(closes.workClosesAt(run(), [group("b"), wednesdays]), at("2026-12-24T00:00:00Z"));
    // An archived group meets for nobody.
    assert.deepEqual(closes.workClosesAt(run(), [group("b"), { ...wednesdays, archived: true }]), at("2026-12-23T00:00:00Z"));
    // A group pushed back a week finishes a week later.
    const pushed = group("b", {
      paceStartDate: "2026-10-29",
      paceWeekPlan: [week(1), week(2), week(3), { kind: "break", label: "No session" }, week(4), week(5), week(6)],
    });
    assert.deepEqual(closes.workClosesAt(run(), [pushed]), at("2026-12-30T00:00:00Z"));
    // A run with a winter break of seven weeks between weeks 6 and 7.
    const incubator = run({
      weekPlan: [1, 2, 3, 4, 5, 6].map(week).concat(Array.from({ length: 7 }, () => ({ kind: "break", label: "Winter" })), [7, 8, 9].map(week)),
    });
    // Week 9 is the sixteenth slot: Tue 16 Feb 2027, closing at the end of Tue 2 Mar.
    assert.deepEqual(closes.workClosesAt(incubator, [group("b")]), at("2027-03-03T00:00:00Z"));
    // The run's own number of days.
    assert.deepEqual(closes.workClosesAt(run({ workClosesAfterDays: 3 }), [group("b")]), at("2026-12-12T00:00:00Z"));
    // A cancelled last session is no meeting: the one before it is the last.
    const cancelledLast = group("b", { sessionChanges: { w06: { kind: "cancelled", reason: "Away.", dateKey: "2026-12-08", byUid: "rahul", at: NOW } } });
    const lastOf = closes.workClosesAt(run(), [cancelledLast]);
    assert.ok(lastOf === null || lastOf.getTime() <= at("2026-12-23T00:00:00Z").getTime());
    // No session to date: a group with no day set, or no groups at all.
    assert.equal(closes.workClosesAt(run(), []), null);
    assert.equal(closes.workClosesAt(run({ startDate: "" }), [group("b")]), null);
  });

  test("a week takes work until the programme closes, whatever its session and whether the old Submit was pressed; the reopen facts change nothing", () => {
    const due = { at: at("2026-11-17T18:00:00Z"), by: "session" };
    const closesAt = at("2026-12-24T00:00:00Z");
    // Before the session, after it, submitted under the old button, reopened: all open.
    for (const [facts, now] of [
      [null, at("2026-11-17T12:00:00Z")],
      [null, at("2026-11-20T12:00:00Z")],
      [{ submittedAt: at("2026-11-16T21:31:00Z"), firstSubmittedAt: at("2026-11-16T21:31:00Z") }, at("2026-11-20T12:00:00Z")],
      [{ submittedAt: null, firstSubmittedAt: at("2026-11-16T21:31:00Z"), reopenedAt: at("2026-11-18T10:00:00Z") }, at("2026-11-20T12:00:00Z")],
    ]) {
      const state = model.weekWorkState({ due, closesAt, facts, now });
      assert.equal(state.kind, "open");
      assert.equal(model.weekTakesWork(state), true);
    }
    // Pressed once and reopened since: still "submitted" for done, from the first press.
    assert.deepEqual(model.submittedOnce({ submittedAt: null, firstSubmittedAt: at("2026-11-16T21:31:00Z") }), at("2026-11-16T21:31:00Z"));
    assert.equal(model.submittedOnce(null), null);
    // Closed: read only, for everybody, from the moment it closes.
    const closed = model.weekWorkState({ due, closesAt, facts: null, now: closesAt });
    assert.deepEqual(closed, { kind: "closed", at: closesAt, due, submittedAt: null });
    assert.equal(model.weekTakesWork(closed), false);
    assert.equal(model.weekWorkState({ due, closesAt, facts: null, now: new Date(closesAt.getTime() - 1) }).kind, "open");
    // A programme that never closes by the clock never closes.
    assert.equal(model.weekWorkState({ due, closesAt: null, facts: null, now: at("2030-01-01T00:00:00Z") }).kind, "open");
    assert.equal(model.workIsClosed(null, at("2030-01-01T00:00:00Z")), false);
  });

  test("late is worked out from the session, never stored: after it by how much, at each boundary; nothing is late with no session", () => {
    const due = { at: at("2026-11-17T18:00:00Z"), by: "session" };
    assert.equal(model.lateBy(at("2026-11-17T17:59:59Z"), due), null, "before the session");
    assert.equal(model.lateBy(at("2026-11-17T18:00:00Z"), due), null, "at its start");
    assert.equal(model.lateBy(at("2026-11-17T18:40:00Z"), due), 40 * 60 * 1000);
    assert.equal(model.lateBy(null, due), null);
    for (const by of ["undated", "joined-late", "no-group"]) assert.equal(model.lateBy(at("2027-01-01T00:00:00Z"), { at: null, by }), null, by);
    assert.equal(model.sessionHasStarted(due, at("2026-11-17T17:59:59Z")), false);
    assert.equal(model.sessionHasStarted(due, at("2026-11-17T18:00:00Z")), true);
    assert.equal(model.sessionHasStarted({ at: null, by: "joined-late" }, at("2030-01-01T00:00:00Z")), false);
    // "After its deadline": first sent after the block's own deadline, before the session; staff only.
    const deadline = at("2026-11-16T12:00:00Z");
    assert.equal(model.afterItsDeadline(at("2026-11-16T11:00:00Z"), deadline, due), false, "on time");
    assert.equal(model.afterItsDeadline(at("2026-11-16T13:00:00Z"), deadline, due), true);
    assert.equal(model.afterItsDeadline(at("2026-11-17T19:00:00Z"), deadline, due), false, "after the session it is late instead");
    assert.equal(model.afterItsDeadline(at("2026-11-16T13:00:00Z"), deadline, { at: null, by: "joined-late" }), false, "joined late: never");
    assert.equal(model.afterItsDeadline(null, deadline, due), false);
  });

  test("which words of a written answer its readers read: before the session only words sent, as last sent; once it starts, the latest", () => {
    const due = at("2026-11-17T18:00:00Z");
    const before = at("2026-11-16T12:00:00Z");
    const after = at("2026-11-17T18:00:00Z");
    const piece = (over) => ({ text: "", boxes: null, words: 0, savedAt: null, firstSentAt: null, sentAt: null, earlierVersions: [], ...over });
    const draft = piece({ text: "A draft.", words: 2, savedAt: at("2026-11-15T10:00:00Z") });
    assert.equal(versions.readableAnswer(draft, due, before), null, "never sent, before the session: nothing");
    assert.equal(versions.readableAnswer(draft, null, at("2030-01-01T00:00:00Z")), null, "never sent, no session: nothing, ever");
    assert.equal(versions.readableAnswer(draft, due, after).text, "A draft.", "once the session has started: everything saved");
    assert.equal(versions.readableAnswer(null, due, after), null);
    // Sent, unchanged: its words.
    const sent = piece({ text: "Sent words.", words: 2, savedAt: at("2026-11-15T10:00:00Z"), firstSentAt: at("2026-11-15T11:00:00Z"), sentAt: at("2026-11-15T11:00:00Z") });
    assert.equal(versions.readableAnswer(sent, due, before).text, "Sent words.");
    // Changed since it was sent, before the session: the words as last sent, kept as a version.
    const kept = { text: "Sent words.", boxes: null, words: 2, savedAt: at("2026-11-15T10:00:00Z"), replacedAt: at("2026-11-16T09:00:00Z"), sentAt: at("2026-11-15T11:00:00Z"), reasons: ["sent"] };
    const changed = { ...sent, text: "Changed words.", savedAt: at("2026-11-16T09:00:00Z"), earlierVersions: [kept] };
    const read = versions.readableAnswer(changed, due, before);
    assert.deepEqual([read.text, read.latest], ["Sent words.", false]);
    // Sent again: the latest.
    assert.equal(versions.readableAnswer({ ...changed, sentAt: at("2026-11-16T10:00:00Z") }, due, before).text, "Changed words.");
    // Once the session has started: the latest, sent or not.
    assert.deepEqual([versions.readableAnswer(changed, due, after).text, versions.readableAnswer(changed, due, after).latest], ["Changed words.", true]);
    // With no session (joined late): as last sent, for good.
    assert.equal(versions.readableAnswer(changed, null, at("2030-01-01T00:00:00Z")).text, "Sent words.");
    // Sent by the old Submit and changed before versions were kept: its latest words, as always.
    const legacy = piece({ text: "Edited after.", words: 2, savedAt: at("2026-11-16T09:00:00Z"), firstSentAt: at("2026-11-15T11:00:00Z") });
    assert.equal(versions.readableAnswer(legacy, due, before).text, "Edited after.");
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

describe("2. done, and the check before Send", () => {
  const tasks = progress.weekTaskNeeds(WEEK);
  const nothing = { isTicked: () => false, isWritten: () => false, isSent: () => false, packOf: () => null, isReady: () => false };
  const ticked = new Set(["s1", "step1", "pk1"]);
  const allTicked = { ...nothing, isTicked: (id) => ticked.has(id), packOf: () => "pk1" };
  const everything = { ...allTicked, isWritten: () => true, isSent: () => true };

  /** The old rule, as it stood: submitted where the week asks for writing, and every counted tick ticked. */
  function oldDone({ state, writes, submitted, tasks: list = tasks }) {
    if (writes && !submitted) return false;
    const counted = list.filter(progress.isCounted);
    const ticks = [...new Set(counted.flatMap((needs) => needs.tickIds))];
    const packs = [...new Set(counted.flatMap((needs) => needs.chooseOneIds))];
    return ticks.every((id) => state.isTicked(id)) && packs.every((id) => state.packOf(id) !== null && state.isTicked(state.packOf(id)));
  }

  test("nobody done under the old rule is not done now: every way to be done, as a table", () => {
    const readings = [WEEK[0], { ...WEEK[1], blocks: [WEEK[1].blocks[0]] }];
    const cases = [
      // [what, tasks, writes, state, submitted]
      ["submitted, every tick ticked", tasks, true, allTicked, true],
      ["submitted with an empty reflection and an unsent answer", tasks, true, { ...allTicked, isWritten: () => false, isSent: () => false }, true],
      ["submitted with everything", tasks, true, everything, true],
      ["a week with only things to tick, ticked", progress.weekTaskNeeds(readings), false, { ...nothing, isTicked: () => true, packOf: () => null }, false],
      ["a week with nothing to count", [], false, nothing, false],
    ];
    for (const [what, list, writes, state, submitted] of cases) {
      assert.equal(oldDone({ state, writes, submitted, tasks: list }), true, `the old rule: ${what}`);
      assert.equal(model.weekDone({ tasks: list, state, submitted }), true, `still done: ${what}`);
    }
    // And the old rule's not-done that stay not done: a tick missing, the pack's reading, no pack.
    for (const [what, state] of [
      ["the reading", { ...everything, isTicked: (id) => id !== "s1" }],
      ["the pack's reading", { ...everything, isTicked: (id) => id !== "pk1" }],
      ["no pack yet", { ...everything, packOf: () => null }],
    ]) {
      assert.equal(model.weekDone({ tasks, state, submitted: true }), false, what);
    }
  });

  test("done now, without the old Submit: every tick, every box its tasks count written, every answer it counts sent", () => {
    assert.equal(model.weekDone({ tasks, state: everything, submitted: false }), true);
    assert.equal(model.weekDone({ tasks, state: { ...everything, isSent: () => false }, submitted: false }), false, "the answer not sent");
    assert.equal(model.weekDone({ tasks, state: { ...everything, isWritten: (id) => id !== "rp2" }, submitted: false }), false, "a reflection box empty");
    assert.equal(model.weekDone({ tasks, state: { ...everything, isTicked: (id) => id !== "step1" }, submitted: false }), false, "a step");
    // A talk's ready mark stays out of done.
    assert.equal(model.weekDone({ tasks, state: { ...everything, isReady: () => false }, submitted: false }), true);
  });

  test("a week whose This week counts nothing asks for everything written in it, so it is never done by default; a week with nothing to write needs nothing", () => {
    const noThisWeek = WEEK.slice(1);
    const asks = model.weekWritingNeeds(noThisWeek);
    assert.deepEqual([asks.promptIds, asks.fillInIds, asks.answerIds], [["rp1", "rp2"], [], ["wa"]]);
    const none = progress.weekTaskNeeds(noThisWeek);
    assert.equal(none.filter(progress.isCounted).length, 0);
    assert.equal(model.weekDone({ tasks: none, state: nothing, submitted: false, asks }), false, "nothing written: not done");
    assert.equal(model.weekDone({ tasks: none, state: { ...nothing, isWritten: () => true }, submitted: false, asks }), false, "the answer not sent");
    assert.equal(model.weekDone({ tasks: none, state: { ...nothing, isWritten: () => true, isSent: () => true }, submitted: false, asks }), true);
    assert.equal(model.weekDone({ tasks: none, state: nothing, submitted: true, asks }), true, "the old Submit, as it always was");
    // Counted tasks decide when there are any: the week's other writing is not asked.
    assert.equal(model.weekDone({ tasks, state: { ...everything, isWritten: (id) => id === "rp1" || id === "rp2" }, submitted: false, asks }), true);
    // Nothing to write and nothing counted: never not done.
    assert.equal(model.weekDone({ tasks: [], state: nothing, submitted: false, asks: model.weekWritingNeeds([]) }), true);
  });

  test("when a week became done: the latest moment its needed things were done, by the old Submit or by what was written and sent", () => {
    const t = (iso) => at(iso);
    const times = {
      tickedAt: (id) => ({ s1: t("2026-11-15T10:00:00Z"), step1: t("2026-11-15T11:00:00Z"), pk1: t("2026-11-16T09:00:00Z") })[id] ?? null,
      writtenAt: (id) => ({ rp1: t("2026-11-14T10:00:00Z"), rp2: t("2026-11-14T10:05:00Z") })[id] ?? null,
      sentAt: (id) => ({ wa: t("2026-11-18T20:00:00Z") })[id] ?? null,
      packOf: () => "pk1",
    };
    assert.deepEqual(model.weekDoneAt({ tasks, times, submittedAt: null }), t("2026-11-18T20:00:00Z"), "the send came last");
    // Pressed the old Submit earlier: done when the ticks were, then.
    assert.deepEqual(model.weekDoneAt({ tasks, times, submittedAt: t("2026-11-16T08:00:00Z") }), t("2026-11-16T09:00:00Z"));
    // Not done: a tick missing.
    assert.equal(model.weekDoneAt({ tasks, times: { ...times, tickedAt: (id) => (id === "s1" ? null : times.tickedAt(id)) }, submittedAt: null }), null);
    // Nothing to count: no moment.
    assert.equal(model.weekDoneAt({ tasks: [], times, submittedAt: null }), null);
    // Through the one count a staff page uses.
    const counted = model.personWeekProgress({ tasks, state: everything, times, submittedAt: null, touched: true });
    assert.deepEqual(counted, { done: 3, of: 3, weekDone: true, doneAt: t("2026-11-18T20:00:00Z"), started: true });
    const touched = model.personWeekProgress({ tasks, state: { ...nothing, isTicked: (id) => id === "s1" }, submittedAt: null, touched: true });
    assert.deepEqual(touched, { done: 0, of: 3, weekDone: false, doneAt: null, started: true });
    const fresh = model.personWeekProgress({ tasks, state: nothing, submittedAt: null, touched: false });
    assert.deepEqual(fresh, { done: 0, of: 3, weekDone: false, doneAt: null, started: false });
  });

  test("the check names each thing not done, in page order, and an answer over its limit stops it", () => {
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
    assert.equal(model.weekAsksForWriting(WEEK), true);
  });
});

describe("3. the words", () => {
  const closesAt = at("2026-12-24T00:00:00Z");
  /** Before the session (Wed 18 Nov, 3pm), and after it. */
  const before = { room: "Portland A21", now: at("2026-11-17T12:00:00Z") };
  const after = { room: "Portland A21", now: at("2026-11-20T12:00:00Z") };

  test("the week's page says until when the work can change, in every state (privacy v17)", () => {
    const open = (due) => ({ kind: "open", due, closesAt, submittedAt: null });
    assert.equal(
      words.untilWhenWords(open({ at: at("2026-11-18T15:00:00Z"), by: "session" }), before),
      "Your session: Wed 18 Nov, 3pm, Portland A21. Your work stays open after it: anything you add or change after it shows as late to the people who read your work, with how late. This week stays open until the programme closes, at the end of Wed 23 Dec.",
    );
    // Once the session has started, the box at the top says the session and the late; this line says when the programme closes.
    assert.equal(
      words.untilWhenWords(open({ at: at("2026-11-18T15:00:00Z"), by: "session" }), after),
      "This week stays open until the programme closes, at the end of Wed 23 Dec.",
    );
    assert.equal(
      words.untilWhenWords(open({ at: at("2026-11-18T15:00:00Z"), by: "cancelled" }), before),
      "Your session this week, Wed 18 Nov, 3pm, is cancelled. Anything you add or change after the time it would have started shows as late to the people who read your work, with how late. This week stays open until the programme closes, at the end of Wed 23 Dec.",
    );
    assert.equal(
      words.untilWhenWords(open({ at: null, by: "undated" }), before),
      "Your group’s time isn’t set yet. This week stays open until the programme closes, at the end of Wed 23 Dec.",
    );
    assert.equal(words.untilWhenWords(open({ at: null, by: "no-group" }), before), "This week stays open until the programme closes, at the end of Wed 23 Dec.");
    assert.equal(
      words.untilWhenWords(open({ at: null, by: "joined-late" }), after),
      "You joined your group after this week’s session, so nothing you add to it shows as late. This week stays open until the programme closes, at the end of Wed 23 Dec.",
    );
    assert.equal(
      words.untilWhenWords({ kind: "open", due: { at: null, by: "no-group" }, closesAt: null, submittedAt: null }, before),
      "This week stays open until the programme closes.",
    );
    assert.equal(
      words.untilWhenWords({ kind: "closed", at: closesAt, due: { at: null, by: "no-group" }, submittedAt: null }, after),
      "The programme closed at the end of Wed 23 Dec, so this week can’t change now.",
    );
    // Nothing on it says locked, submitted or reopened, in any state.
    for (const state of [open({ at: at("2026-11-18T15:00:00Z"), by: "session" }), open({ at: null, by: "joined-late" }), { kind: "closed", at: closesAt, due: { at: null, by: "no-group" }, submittedAt: null }]) {
      for (const when of [before, after]) assert.doesNotMatch(words.untilWhenWords(state, when), /\block|submit|reopen/i);
    }
    assert.equal(words.closedWords(closesAt), "The programme closed at the end of Wed 23 Dec, so this week can’t change now.");
    // The wire carries it, and the page reads it back.
    const wire = model.weekWorkWire(open({ at: at("2026-11-18T15:00:00Z"), by: "session" }), at("2026-11-18T16:00:00Z"));
    assert.deepEqual(wire, {
      dueAt: "2026-11-18T15:00:00.000Z",
      dueBy: "session",
      sessionStarted: true,
      closesAt: "2026-12-24T00:00:00.000Z",
      closed: false,
      submittedAt: null,
      state: "open",
      lockedAt: null,
      locksAt: "2026-12-24T00:00:00.000Z",
      by: "session",
      reopened: null,
    });
    assert.deepEqual(model.weekWorkStateOf(wire), open({ at: at("2026-11-18T15:00:00Z"), by: "session" }));
    const closedWire = model.weekWorkWire({ kind: "closed", at: closesAt, due: { at: null, by: "no-group" }, submittedAt: null }, closesAt);
    assert.deepEqual([closedWire.state, closedWire.closed, closedWire.lockedAt], ["locked", true, "2026-12-24T00:00:00.000Z"]);
  });

  test("how late, in words: minutes under an hour, hours under a day, then days, each rounded down", () => {
    const MIN = 60 * 1000;
    const cases = [
      [1, "1 minute"],
      [30 * 1000, "1 minute"],
      [40 * MIN, "40 minutes"],
      [59 * MIN + 59 * 1000, "59 minutes"],
      [HOUR, "1 hour"],
      [5 * HOUR + 59 * MIN, "5 hours"],
      [DAY - 1, "23 hours"],
      [DAY, "1 day"],
      [3 * DAY + 3 * HOUR, "3 days"],
    ];
    for (const [ms, said] of cases) assert.equal(words.lateWords(ms), said, String(ms));
    assert.equal(words.lateAfterSessionWords(40 * MIN), "Late: 40 minutes after the session");
    assert.equal(words.afterYourSessionWords(3 * DAY), "3 days after your session");
    assert.equal(words.AFTER_ITS_DEADLINE, "After its deadline");
    assert.equal(words.JOINED_LATE, "Joined late");
  });

  test("what isn't done, Send, and the readers' line say who reads the written answer, and when", () => {
    assert.equal(words.notDoneWords({ kind: "readings", titles: ["Compute as a lever for governance"] }), "One reading isn’t ticked: “Compute as a lever for governance”.");
    assert.equal(words.notDoneWords({ kind: "answer", emptyBoxes: 1, boxes: 3 }), "One box of your written answer is empty.");
    assert.equal(words.notDoneWords({ kind: "overLimit", words: 412, limit: 350 }), "Your written answer is 412 words. The limit is 350.");
    assert.equal(
      words.answerReadersWords({ kind: "facilitators", names: ["Rahul"] }, "Claudia"),
      "Once you send it, or once your session has started, Rahul, Claudia and admins can read your written answer.",
    );
    assert.equal(
      words.answerReadersWords({ kind: "lead", leadName: "Claudia" }, "Claudia"),
      "Once you send it, or once your session has started, Claudia and admins can read your written answer.",
    );
    assert.equal(words.SEND_MY_ANSWER, "Send my answer");
    assert.equal(words.CHANGE_MY_ANSWER, "Change my answer");
    assert.equal(words.sentLineWords(at("2026-11-10T21:31:00Z")), "Sent Tue 10 Nov, 9:31pm.");
  });

  test("beside each thing the person did: when, and once the session has started whether it was before it or how long after; never late with no session", () => {
    const due = { at: at("2026-11-04T15:00:00Z"), by: "session" };
    const sixDaysOn = at("2026-11-10T20:30:00Z");
    // After the session.
    assert.equal(words.savedLineWords(at("2026-11-03T20:15:00Z"), due, sixDaysOn), "Saved Tue 3 Nov, 8:15pm, before the session.");
    assert.equal(words.savedLineWords(at("2026-11-10T20:01:00Z"), due, sixDaysOn), "Saved Tue 10 Nov, 8:01pm: 6 days after your session");
    assert.equal(words.sentLineWords(at("2026-11-08T21:12:00Z"), due, sixDaysOn), "Sent Sun 8 Nov, 9:12pm: 4 days after your session");
    assert.equal(words.sentLineWords(at("2026-11-04T15:40:00Z"), due, sixDaysOn), "Sent Wed 4 Nov, 3:40pm: 40 minutes after your session");
    assert.equal(words.tickedOnWords(at("2026-11-07T18:20:00Z"), due, sixDaysOn), "Ticked Sat 7 Nov: 3 days after your session");
    assert.equal(words.tickedOnWords(at("2026-11-03T18:20:00Z"), due, sixDaysOn), "Ticked Tue 3 Nov");
    assert.equal(words.allTickedWords(at("2026-11-03T18:20:00Z"), due, sixDaysOn), "All ticked by Tue 3 Nov.");
    assert.equal(words.allTickedWords(at("2026-11-07T18:20:00Z"), due, sixDaysOn), "All ticked by Sat 7 Nov: 3 days after your session");
    // Before the session: the time alone, never "before the session" or late.
    const dayBefore = at("2026-11-03T21:00:00Z");
    assert.equal(words.savedLineWords(at("2026-11-03T20:15:00Z"), due, dayBefore), "Saved Tue 3 Nov, 8:15pm.");
    assert.equal(words.tickedOnWords(at("2026-11-03T18:20:00Z"), due, dayBefore), "Ticked Tue 3 Nov");
    // No session to be due at (no group, told after it met, no time set): never late.
    for (const none of [{ at: null, by: "no-group" }, { at: null, by: "joined-late" }, { at: null, by: "undated" }]) {
      assert.equal(words.savedLineWords(at("2026-11-10T20:01:00Z"), none, sixDaysOn), "Saved Tue 10 Nov, 8:01pm.");
      assert.equal(words.sentLineWords(at("2026-11-08T21:12:00Z"), none, sixDaysOn), "Sent Sun 8 Nov, 9:12pm.");
      assert.equal(words.tickedOnWords(at("2026-11-07T18:20:00Z"), none, sixDaysOn), "Ticked Sat 7 Nov");
      assert.equal(words.allTickedWords(at("2026-11-07T18:20:00Z"), none, sixDaysOn), "All ticked by Sat 7 Nov.");
    }
    // Changed since sent: who sees what, before and after the session.
    assert.equal(
      words.changedSinceSentWords(false),
      "You’ve changed it since you sent it. The people who read your work still see the version you sent until you send it again.",
    );
    assert.equal(
      words.changedSinceSentWords(true),
      "You’ve changed it since you sent it. Your session has started, so the people who read your work see your latest words.",
    );
    // What makes the week done, under Send.
    assert.equal(words.doneOnceSentWords(1, "ticks"), "Week 1 is done once it’s sent: every reading is already ticked.");
    assert.equal(words.doneOnceSentWords(1, "done"), "Week 1 is done once it’s sent: everything else it asks for is done.");
    assert.equal(words.doneOnceSentWords(1, "left"), "Week 1 is done once it’s sent and everything else it asks for is done.");
    assert.equal(words.doneOnceSentWords(1, "nothing"), "Week 1 is done once it’s sent.");
  });

  test("the box at the top of the week: once the session has started, that the group met, in neutral words; a facilitator's own, who reads it", () => {
    const due = { at: at("2026-11-04T15:00:00Z"), by: "session" };
    const later = at("2026-11-10T20:30:00Z");
    assert.equal(
      words.sessionMetWords({ due, weekNumber: 1, groupName: "Group C", done: false, now: later }),
      "Group C met for week 1 on Wed 4 Nov. You can still finish it. Anything you add or change now shows as late to the people who read your work, with how late.",
    );
    assert.equal(
      words.sessionMetWords({ due, weekNumber: 1, groupName: "Group C", done: true, now: later }),
      "Group C met for week 1 on Wed 4 Nov. Anything you add or change now shows as late to the people who read your work, with how late.",
    );
    assert.equal(
      words.sessionMetWords({ due: { ...due, by: "cancelled" }, weekNumber: 1, groupName: null, done: false, now: later }),
      "Your group’s week 1 session, Wed 4 Nov, 3pm, was cancelled. You can still finish it. Anything you add or change after the time it would have started shows as late to the people who read your work, with how late.",
    );
    // Before the session, and with no session to be due at, nothing.
    assert.equal(words.sessionMetWords({ due, weekNumber: 1, groupName: "Group C", done: false, now: at("2026-11-04T14:59:00Z") }), null);
    for (const none of ["no-group", "joined-late", "undated"]) {
      assert.equal(words.sessionMetWords({ due: { at: null, by: none }, weekNumber: 1, groupName: "Group C", done: false, now: later }), null);
    }
    // A facilitator's own work: who reads it, and that what they add after their group's session shows those people as late.
    const own = { runs: "Group C", meets: "Group C", readers: "Claudia and admins" };
    assert.equal(
      words.ownWorkWords({ ...own, due, now: later }),
      "You run Group C, so your own work is read by Claudia and admins, not by your group. Group C met on Wed 4 Nov: anything you add now shows them as late.",
    );
    assert.equal(
      words.ownWorkWords({ ...own, due, now: at("2026-11-02T10:00:00Z") }),
      "You run Group C, so your own work is read by Claudia and admins, not by your group. Anything you add after Group C’s session on Wed 4 Nov shows them as late.",
    );
    assert.equal(
      words.ownWorkWords({ runs: null, meets: null, readers: "admins", due: { at: null, by: "undated" }, now: later }),
      "You run groups on this programme, so your own work is read by admins, not by your groups.",
    );
    for (const line of [
      words.sessionMetWords({ due, weekNumber: 1, groupName: "Group C", done: false, now: later }),
      words.ownWorkWords({ ...own, due, now: later }),
    ]) {
      assert.doesNotMatch(line, /\block|submit|reopen|warning|[–—]/i, line);
    }
  });

  test("staff words: sent, changed and saved, the version at the session, and the version feedback was about", () => {
    assert.equal(words.staffSentWords(at("2026-11-16T22:42:00Z")), "Sent Mon 16 Nov, 10:42pm");
    assert.equal(words.staffChangedWords(at("2026-11-07T18:20:00Z")), "Changed Sat 7 Nov, 6:20pm");
    assert.equal(words.staffChangedWords(at("2026-11-07T18:20:00Z"), false), "Saved Sat 7 Nov, 6:20pm");
    assert.equal(words.staffChangedSinceSentWords("Amara"), "Amara has changed it since sending it. You read it as sent until it’s sent again or the session starts.");
    assert.equal(words.AS_IT_STOOD_AT_THE_SESSION, "As it stood at the session");
    assert.equal(words.THE_VERSION_THIS_FEEDBACK_WAS_ABOUT, "The version this feedback was about");
    assert.equal(words.answerChangedSinceWords("Amara"), "Amara’s answer has changed since this feedback was written.");
    assert.equal(words.YOUR_ANSWER_CHANGED_SINCE, "Your answer has changed since this feedback was written.");
  });

  test("what the rest of the week needs once an answer is sent (`restOfWeekOnceSent`): done asks it, as everywhere", () => {
    const tasks = [
      { tickIds: ["s1", "s2"], promptIds: [], answerIds: [], chooseOneIds: [], talkIds: [], fillInIds: [], unseenIds: [] },
      { tickIds: [], promptIds: [], answerIds: ["wa"], chooseOneIds: [], talkIds: [], fillInIds: [], unseenIds: [] },
    ];
    const asks = { tickIds: [], promptIds: [], answerIds: ["wa"], chooseOneIds: [], talkIds: [], fillInIds: [], unseenIds: [] };
    const state = (ticked, sent = []) => ({ isTicked: (id) => ticked.includes(id), isWritten: () => false, isSent: (id) => sent.includes(id), packOf: () => null });
    assert.equal(pageFacts.restOfWeekOnceSent({ tasks, asks, state: state(["s1", "s2"]), submitted: false, answerId: "wa" }), "ticks");
    assert.equal(pageFacts.restOfWeekOnceSent({ tasks, asks, state: state(["s1"]), submitted: false, answerId: "wa" }), "left");
    assert.equal(pageFacts.restOfWeekOnceSent({ tasks, asks, state: state(["s1", "s2"], ["wa"]), submitted: false, answerId: "wa" }), null, "done already");
    const withReflection = [...tasks, { tickIds: [], promptIds: ["p1"], answerIds: [], chooseOneIds: [], talkIds: [], fillInIds: [], unseenIds: [] }];
    const written = { ...state(["s1", "s2"]), isWritten: (id) => id === "p1" };
    assert.equal(pageFacts.restOfWeekOnceSent({ tasks: withReflection, asks, state: written, submitted: false, answerId: "wa" }), "done");
    assert.equal(pageFacts.restOfWeekOnceSent({ tasks: [tasks[1]], asks, state: state([]), submitted: false, answerId: "wa" }), "nothing");
    // The old Submit pressed: done already, whatever is unsent.
    assert.equal(pageFacts.restOfWeekOnceSent({ tasks, asks, state: state(["s1", "s2"]), submitted: true, answerId: "wa" }), null);
    assert.deepEqual(pageFacts.dueOfWire(null), { at: null, by: "no-group" });
    assert.deepEqual(pageFacts.dueOfWire({ dueAt: "2026-11-04T15:00:00.000Z", dueBy: "session" }), { at: at("2026-11-04T15:00:00Z"), by: "session" });
    assert.equal(pageFacts.latestOf([at("2026-11-03T10:00:00Z"), at("2026-11-04T10:00:00Z")]).toISOString(), "2026-11-04T10:00:00.000Z");
    assert.equal(pageFacts.latestOf([at("2026-11-03T10:00:00Z"), null]), null);
    assert.equal(pageFacts.latestOf([]), null);
  });

  test("a staff page says done on time or done late, how far along otherwise, and joined late; never how much is written", () => {
    const due = { at: at("2026-11-17T18:00:00Z"), by: "session" };
    const some = { done: 2, of: 3, weekDone: false, doneAt: null, started: true };
    const done = { done: 3, of: 3, weekDone: true, doneAt: at("2026-11-17T12:00:00Z"), started: true };
    assert.deepEqual(words.personWeekWords({ progress: done, doneAt: done.doneAt, due }), { text: "Done on time", detail: null });
    assert.deepEqual(words.personWeekWords({ progress: done, doneAt: at("2026-11-20T18:00:00Z"), due }), { text: "Done late", detail: "Late: 3 days after the session" });
    assert.deepEqual(words.personWeekWords({ progress: done, doneAt: done.doneAt, due: { at: null, by: "undated" } }), { text: "Done", detail: null });
    assert.deepEqual(words.personWeekWords({ progress: done, doneAt: null, due }), { text: "Done", detail: null }, "no time to tell it by");
    // A week with nothing to count is never said to be done: how far along, as before.
    const nothingCounted = { done: 0, of: 0, weekDone: true, doneAt: null, started: true };
    assert.deepEqual(words.personWeekWords({ progress: nothingCounted, doneAt: null, due }), { text: "Started", detail: null });
    assert.equal(words.personWeekTone({ progress: nothingCounted, doneAt: null, due }), "partly");
    assert.deepEqual(words.personWeekWords({ progress: some, doneAt: null, due }), { text: "2 of 3 done", detail: null });
    assert.deepEqual(words.personWeekWords({ progress: { ...some, done: 0 }, doneAt: null, due }), { text: "Started", detail: null });
    assert.deepEqual(words.personWeekWords({ progress: { ...some, done: 0, started: false }, doneAt: null, due }), { text: "Not started", detail: null });
    assert.deepEqual(words.personWeekWords({ progress: { ...some, done: 0, started: false }, doneAt: null, due: { at: null, by: "joined-late" } }), { text: "Joined late", detail: null });
    assert.equal(words.personWeekTone({ progress: done, doneAt: done.doneAt, due }), "done");
    assert.equal(words.personWeekTone({ progress: some, doneAt: null, due }), "partly");
    assert.equal(words.personWeekTone({ progress: { ...some, done: 0, started: false }, doneAt: null, due }), "none");
    assert.equal(words.groupSessionWords(at("2026-11-18T15:00:00Z"), at("2026-11-17T12:00:00Z")), "Meets Wed 3pm");
    assert.equal(words.groupSessionWords(at("2026-11-18T15:00:00Z"), at("2026-11-19T12:00:00Z")), "Met Wed 3pm");
  });

  test("no word of the week says mark, grade or score, or carries a dash", () => {
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
    for (const line of [
      words.lateWords(DAY),
      words.closedWords(at("2026-12-24T00:00:00Z")),
      words.WEEKS_STAY_OPEN,
      words.staysOpenWords(null),
      words.changedSinceSentWords(true),
      words.changedSinceSentWords(false),
      words.doneOnceSentWords(2, "ticks"),
      words.staffChangedSinceSentWords("Amara"),
    ]) {
      assert.doesNotMatch(line, /\b(?:marks?|marked|grades?|scores?)\b|[–—]/i, line);
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
const WEEK_TWO_SESSION = "2026-11-10T18:00:00Z";
/** The run's last session is Group C's, Wed 9 Dec: the programme closes at the end of Wed 23 Dec. */
const CLOSES = "2026-12-24T00:00:00Z";

const reviewPage = await w.loadTs("lib/courses/writtenAnswers/reviewPage.ts");
/** What the review page hands `who` for `uid`'s week `n` answer, at the clock's now. */
async function reviewOf(who, n, uid) {
  const run = w.lib.courses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
  const group = groupsStore.normalizeCourseGroup(B, w.world.db.read(`courseGroups/${B}`));
  return reviewPage.loadWrittenReview(w.world.db, w.sessionFor(who), run, group, n, uid, new Date());
}

beforeEach(() => w.reset());

describe("4. Send, the old Submit, versions, a closed programme, and the old Reopen", () => {
  test("Send sends the written answer: its first send once, every send, each logged, and it closes nothing", async () => {
    w.at(BEFORE_WEEK_TWO);
    assert.equal((await w.write("chloe", 2, { text: ENOUGH })).status, 200);
    const sent = await w.sendAnswer("chloe", 2);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(Object.keys(sent.body).sort(), ["ok", "work", "written"]);
    assert.equal(sent.body.written.firstSentAt, new Date(BEFORE_WEEK_TWO).toISOString());
    assert.equal(sent.body.written.sentAt, new Date(BEFORE_WEEK_TWO).toISOString());
    assert.deepEqual([sent.body.work.closed, sent.body.work.closesAt, sent.body.work.dueAt], [false, CLOSES.replace("Z", ".000Z"), WEEK_TWO_SESSION.replace("Z", ".000Z")]);
    let row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(new Date(row.firstSentAt).toISOString(), new Date(BEFORE_WEEK_TWO).toISOString());
    assert.equal(new Date(row.submittedAt).toISOString(), new Date(BEFORE_WEEK_TWO).toISOString(), "stamped with the first send, as every reader of answers sent reads");
    assert.equal(w.weekWorkOf("chloe", 2), undefined, "Send stamps nothing on the week: only the old Submit did");
    // Change my answer: it saves, keeps the words as sent, and sends again.
    w.at("2026-11-09T10:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} more` })).status, 200, "a sent answer still takes changes");
    row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(row.earlierVersions.length, 1);
    assert.deepEqual([row.earlierVersions[0].text, row.earlierVersions[0].reasons], [ENOUGH, ["sent"]]);
    assert.equal(new Date(row.editedAt).toISOString(), "2026-11-09T10:00:00.000Z");
    w.at("2026-11-09T11:00:00Z");
    const again = await w.sendAnswer("chloe", 2);
    assert.equal(again.status, 200);
    row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(new Date(row.sentAt).toISOString(), "2026-11-09T11:00:00.000Z");
    assert.equal(new Date(row.firstSentAt).toISOString(), new Date(BEFORE_WEEK_TWO).toISOString(), "the first send never moves");
    // Sending words already sent, with no change since, writes nothing.
    const logged = w.logOf("chloe").length;
    assert.equal((await w.sendAnswer("chloe", 2)).status, 200);
    assert.equal(w.logOf("chloe").length, logged);
    assert.deepEqual(w.logOf("chloe").map((entry) => entry.kind), ["save", "send", "save", "send-again"]);
    // Nothing closed: ticks still go through, and so do changes.
    assert.equal((await w.tick("chloe", 2, "n2-s1")).status, 200);
  });

  test("Send is the writer's own, refuses an empty answer and one over its limit, and checks its body first", async () => {
    w.at(BEFORE_WEEK_TWO);
    for (const who of ["claudia", "zach", "tess", "una", "omar", "nobody"]) {
      assert.equal((await w.sendAnswer(who, 2)).status, 403, `${who} sent`);
    }
    assert.equal((await w.sendAnswer(null, 2)).status, 401);
    assert.equal((await w.sendAnswer("chloe", 2, { viewAs: true })).status, 403);
    assert.equal((await w.sendAnswer("chloe", 2, { body: {} })).status, 400);
    assert.equal((await w.sendAnswer("chloe", 2, { answerId: "wa-nothing" })).status, 404);
    const empty = await w.sendAnswer("chloe", 2);
    assert.deepEqual([empty.status, empty.body.error], [409, words.NOTHING_TO_SEND]);
    const long = Array.from({ length: 41 }, (_, i) => `w${i}`).join(" ");
    assert.equal((await w.write("farah", 2, { text: long })).status, 200, "a draft may run over while it is written");
    const over = await w.sendAnswer("farah", 2);
    assert.deepEqual([over.status, over.body.error], [409, "Your written answer is 41 words. The limit is 40."]);
    assert.equal(w.world.db.read(w.rowPath("farah", 2)).firstSentAt, undefined, "nothing is stamped");
  });

  test("the old Submit, kept for an old page: sends what changed, stamps the week as it always did, and closes nothing", async () => {
    w.at(BEFORE_WEEK_TWO);
    assert.equal((await w.write("chloe", 2, { text: ENOUGH })).status, 200);
    const submitted = await w.submitWeek("chloe", 2);
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.deepEqual(Object.keys(submitted.body).sort(), ["ok", "sent", "work"]);
    assert.equal(submitted.body.work.state, "open", "an old page is told the week is open");
    assert.equal(submitted.body.work.submittedAt, new Date(BEFORE_WEEK_TWO).toISOString());
    assert.deepEqual(submitted.body.sent, [{ id: ONE_BOX.id, at: new Date(BEFORE_WEEK_TWO).toISOString() }]);
    const stored = w.weekWorkOf("chloe", 2);
    assert.equal(stored.submitCount, 1);
    assert.ok(stored.submittedAt && stored.firstSubmittedAt);
    assert.deepEqual(w.logOf("chloe").map((entry) => entry.kind), ["save", "send", "submit"]);
    // Nothing is locked: a change, a tick and a second Submit all go through; the second sends the change.
    w.at("2026-11-09T10:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} more` })).status, 200);
    assert.equal((await w.tick("chloe", 2, "n2-s1")).status, 200);
    const again = await w.submitWeek("chloe", 2);
    assert.equal(again.status, 200);
    assert.equal(again.body.sent.length, 1);
    assert.equal(w.weekWorkOf("chloe", 2).submitCount, 2);
    assert.deepEqual(w.logOf("chloe").map((entry) => entry.kind).slice(-2), ["send-again", "submit"]);
    // An empty answer is never sent; one over its limit stops it, and nothing is stamped.
    const empty = await w.submitWeek("kofi", 2);
    assert.deepEqual([empty.status, empty.body.sent], [200, []]);
    const long = Array.from({ length: 41 }, (_, i) => `w${i}`).join(" ");
    await w.write("farah", 2, { text: long });
    const over = await w.submitWeek("farah", 2);
    assert.deepEqual([over.status, over.body.error], [409, "Your written answer is 41 words. The limit is 40."]);
    assert.equal(w.weekWorkOf("farah", 2), undefined);
    // Still the person's own.
    for (const who of ["claudia", "zach", "tess", "una", "omar", "nobody"]) {
      assert.equal((await w.submitWeek(who, 2)).status, 403, `${who} submitted`);
    }
    assert.equal((await w.submitWeek(null, 2)).status, 401);
    assert.equal((await w.submitWeek("chloe", 2, { viewAs: true })).status, 403);
    assert.equal((await w.submitWeek("chloe", 2, { body: {} })).status, 400);
    assert.equal((await w.submitWeek("chloe", 1)).status, 404, "a week written before blocks keeps its own pages");
  });

  test("before the session its readers read the answer as last sent, never words not sent; once the session starts, the latest, sent or not", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.sendAnswer("chloe", 2);
    await w.write("kofi", 2, { text: `${ENOUGH} unsentword` });
    w.at("2026-11-09T10:00:00Z");
    await w.write("chloe", 2, { text: `${ENOUGH} changed` });
    w.at("2026-11-09T11:00:00Z");
    let review = await reviewOf("rahul", 2, "chloe");
    assert.equal(review.selected.person.uid, "chloe");
    assert.equal(review.selected.text, ENOUGH, "the words as last sent");
    assert.deepEqual([review.selected.shown.latest, review.selected.person.changedSinceSent], [false, true]);
    // When the words shown were saved: never when the change not sent yet was.
    assert.equal(review.selected.person.changedAt, new Date(BEFORE_WEEK_TWO).toISOString());
    assert.equal(review.selected.person.words, 21);
    const kofi = [...review.toGive, ...review.feedbackSent, ...review.notSent].find((person) => person.uid === "kofi");
    assert.deepEqual([kofi.readable, kofi.words, kofi.changedAt], [false, 0, null], "never sent: nothing of it");
    assert.ok(!JSON.stringify(review).includes("unsentword"), "no unsent word reaches the reader");
    assert.ok(!JSON.stringify(review).includes(`${ENOUGH} changed`), "nor a change not sent yet");
    // The session starts: the latest words, sent or not.
    w.at(WEEK_TWO_SESSION);
    review = await reviewOf("rahul", 2, "chloe");
    assert.deepEqual([review.selected.text, review.selected.shown.latest], [`${ENOUGH} changed`, true]);
    const kofiAfter = (await reviewOf("rahul", 2, "kofi")).selected;
    assert.deepEqual([kofiAfter.person.uid, kofiAfter.text, kofiAfter.person.readable], ["kofi", `${ENOUGH} unsentword`, true]);
  });

  test("the first change after the session keeps the words as they stood at it, once; late is told from the session", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    w.at("2026-11-11T10:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} late` })).status, 200, "nothing closes at the session");
    let row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(row.earlierVersions.length, 1);
    const kept = row.earlierVersions[0];
    assert.deepEqual([kept.text, kept.reasons, new Date(kept.savedAt).toISOString(), new Date(kept.replacedAt).toISOString()], [
      ENOUGH,
      ["session"],
      new Date(BEFORE_WEEK_TWO).toISOString(),
      "2026-11-11T10:00:00.000Z",
    ]);
    w.at("2026-11-11T11:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} later` })).status, 200);
    row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(row.earlierVersions.length, 1, "a second change keeps nothing more");
    // A save that changes nothing writes nothing.
    const saved = row.updatedAt;
    w.at("2026-11-11T12:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} later` })).status, 200);
    assert.deepEqual(w.world.db.read(w.rowPath("chloe", 2)).updatedAt, saved);
    // The review page: the latest, how late, and the words at the session one step away.
    const review = await reviewOf("rahul", 2, "chloe");
    assert.equal(review.selected.text, `${ENOUGH} later`);
    assert.equal(review.selected.person.changedLateMs, 17 * HOUR);
    assert.equal(words.lateWords(review.selected.person.changedLateMs), "17 hours");
    assert.equal(review.selected.atSession.text, ENOUGH);
    assert.equal(review.selected.person.late, false, "never sent: no send to be late");
  });

  test("an answer sent after the session is late; one sent after its own deadline but before the session is after its deadline, to staff alone", async () => {
    w.at("2026-11-09T13:00:00Z");
    await w.write("chloe", 2, { text: ENOUGH });
    await w.sendAnswer("chloe", 2);
    w.at("2026-11-12T18:00:00Z");
    await w.write("farah", 2, { text: ENOUGH });
    await w.sendAnswer("farah", 2);
    const people = (await reviewOf("rahul", 2, null));
    const all = [...people.toGive, ...people.feedbackSent, ...people.notSent];
    const chloe = all.find((person) => person.uid === "chloe");
    const farah = all.find((person) => person.uid === "farah");
    assert.deepEqual([chloe.afterDeadline, chloe.late, chloe.sentLateMs], [true, false, null], "after noon the day before, before the session");
    assert.deepEqual([farah.afterDeadline, farah.late, farah.sentLateMs], [false, true, 2 * DAY]);
    // The writer's own read never says either.
    const own = await w.ownRowsOf("chloe", 2);
    assert.doesNotMatch(JSON.stringify(own.body), /deadline|afterDeadline|\blate\b/i);
  });

  test("feedback and a rating say which version they were about; the first change after either keeps it, and the cards carry it", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.sendAnswer("chloe", 2);
    const sentRow = w.world.db.read(w.rowPath("chloe", 2));
    w.at("2026-11-09T09:30:00Z");
    const given = await w.give("rahul", "chloe", 2, "Clear.");
    assert.equal(given.status, 200, JSON.stringify(given.body));
    const piece = w.world.db.read(`courseFeedback/${given.body.piece.id}`);
    assert.deepEqual(new Date(piece.aboutSavedAt), new Date(sentRow.updatedAt), "the version it was about: the words as sent");
    const stamp = w.weekWorkOf("chloe", 2).reviewedVersions[ONE_BOX.id];
    assert.deepEqual(new Date(stamp), new Date(sentRow.updatedAt), "the person's week record carries the reviewed mark, never their own row");
    assert.equal(w.world.db.read(w.rowPath("chloe", 2)).reviewedVersions, undefined);
    // A rating, read by nobody the person is: the same mark.
    const rated = await w.rate("claudia", "chloe", 2, 7, "Names a keeper.");
    assert.equal(rated.status, 200, JSON.stringify(rated.body));
    assert.deepEqual(new Date(w.workRatings()[0].aboutSavedAt), new Date(sentRow.updatedAt));
    // The change: one version kept, for both lines at once (sent before the session, and reviewed).
    w.at("2026-11-09T10:00:00Z");
    await w.write("chloe", 2, { text: `${ENOUGH} changed` });
    const row = w.world.db.read(w.rowPath("chloe", 2));
    assert.equal(row.earlierVersions.length, 1);
    assert.deepEqual(row.earlierVersions[0].reasons.sort(), ["reviewed", "sent"]);
    // One word for feedback and a rating alike, on a row the writer can read: never "rating".
    assert.doesNotMatch(JSON.stringify(row), /rating|rated/i);
    // Once the session has started, the reviewers read the latest, and the card carries the version it was about.
    w.at(WEEK_TWO_SESSION);
    const review = await reviewOf("rahul", 2, "chloe");
    const card = [...review.selected.cards, ...(review.selected.own ? [review.selected.own] : [])].find((each) => each.text === "Clear.");
    assert.equal(card.about.text, ENOUGH);
    assert.equal(card.aboutGone, false);
    // The person's own week page reads the same.
    const overview = await w.call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    const own = overview.body.weeks.find((week) => week.weekNumber === 2).feedback.find((each) => each.text === "Clear.");
    assert.equal(own.about.text, ENOUGH);
  });

  test("feedback on words that have not changed carries no version; feedback before versions were kept reads as the version that stood then", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.sendAnswer("chloe", 2);
    w.at("2026-11-09T09:30:00Z");
    await w.give("rahul", "chloe", 2, "Clear.");
    w.at(WEEK_TWO_SESSION);
    const card = (await reviewOf("rahul", 2, "chloe")).selected.own;
    assert.deepEqual([card.about, card.aboutGone], [null, false]);
    // A piece with no pointer (saved before pointers were kept), and the answer unchanged since: no version.
    const id = w.pieces()[0].id;
    w.world.db.poke(`courseFeedback/${id}`, { aboutSavedAt: undefined });
    const legacy = (await reviewOf("rahul", 2, "chloe")).selected.own;
    assert.deepEqual([legacy.about, legacy.aboutGone], [null, false]);
  });

  test("an unsent answer emptied after the session keeps its row, empty, for the version at the session; one emptied before goes", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.write("farah", 2, { text: ENOUGH });
    assert.equal((await w.write("farah", 2, { text: "" })).status, 200);
    assert.equal(w.world.db.read(w.rowPath("farah", 2)), undefined, "nothing written is nothing stored");
    w.at("2026-11-11T10:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: "" })).status, 200);
    const row = w.world.db.read(w.rowPath("chloe", 2));
    assert.deepEqual([row.words, row.text, row.earlierVersions.length, row.earlierVersions[0].text], [0, "", 1, ENOUGH]);
    assert.deepEqual(w.logOf("chloe").map((entry) => entry.kind), ["save", "cleared"]);
    // A sent answer can never be emptied.
    await w.write("kofi", 2, { text: ENOUGH });
    await w.sendAnswer("kofi", 2);
    assert.equal((await w.write("kofi", 2, { text: "" })).status, 400);
  });

  test("once the programme closes, every write is refused with when it closed: a save, a send, a tick, the old Submit", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    w.at(CLOSES);
    const closedSaying = "The programme closed at the end of Wed 23 Dec, so this week can’t change now.";
    for (const answer of [
      await w.write("chloe", 2, { text: `${ENOUGH} closed` }),
      await w.sendAnswer("chloe", 2),
      await w.tick("chloe", 2, "n2-s1"),
      await w.submitWeek("chloe", 2),
    ]) {
      assert.deepEqual([answer.status, answer.body.error], [409, closedSaying]);
    }
    assert.equal(w.world.db.read(w.rowPath("chloe", 2)).text, ENOUGH, "nothing changed");
    // The minute before, it all went through.
    w.at("2026-12-23T23:59:00Z");
    assert.equal((await w.write("chloe", 2, { text: `${ENOUGH} just in time` })).status, 200);
    // The overview says when it closed.
    w.at(CLOSES);
    const overview = await w.call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    const work = overview.body.weeks.find((week) => week.weekNumber === 2).work;
    assert.deepEqual([work.closed, work.closesAt, work.state], [true, "2026-12-24T00:00:00.000Z", "locked"]);
  });

  test("the old Reopen answers that weeks no longer lock, to the people it always answered, and writes nothing", async () => {
    w.at(BEFORE_WEEK_TWO);
    await w.write("chloe", 2, { text: ENOUGH });
    await w.submitWeek("chloe", 2);
    const before = w.everything();
    for (const who of ["rahul", "sofia", "claudia", "zach"]) {
      const answer = await w.reopenWeek(who, "chloe", 2);
      assert.deepEqual([answer.status, Object.keys(answer.body).sort(), answer.body.message], [200, ["message", "ok"], words.WEEKS_STAY_OPEN], who);
    }
    assert.equal(w.everything(), before, "nothing written: no week record, no answer, no log, no audit row");
    // Who it refuses, as before: never the person, nobody outside the group, never a co-facilitator on a facilitator's own week.
    for (const who of ["chloe", "farah", "tess", "una", "nobody"]) {
      assert.equal((await w.reopenWeek(who, "chloe", 2)).status, 403, `${who} reopened Chloe's week`);
    }
    assert.equal((await w.reopenWeek("sofia", "rahul", 2)).status, 403, "a co-facilitator");
    assert.equal((await w.reopenWeek("claudia", "rahul", 2)).status, 200);
    assert.equal((await w.reopenWeek("rahul", "chloe", 2, { viewAs: true })).status, 403);
    // A stored reopen from the time weeks locked changes nothing: the week reads open, from its first submit.
    w.world.db.poke(`courseWeekWork/${RUN.agi}__chloe__w02`, { submittedAt: null, reopenedAt: new Date("2026-11-09T10:00:00Z"), reopenedByUid: "rahul" });
    const overview = await w.call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    const work = overview.body.weeks.find((week) => week.weekNumber === 2).work;
    assert.deepEqual([work.state, work.reopened, work.submittedAt], ["open", null, new Date(BEFORE_WEEK_TWO).toISOString()]);
  });

  test("an answer opened by a reviewer before weeks were submitted no longer locks it", async () => {
    w.world.db.seed(w.rowPath("chloe", 3), {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      exerciseId: BOXES.id,
      responseType: "text",
      boxes: { "wb-what": "Lamps." },
      words: 1,
      firstSentAt: new Date("2026-11-15T10:00:00Z"),
      submittedAt: new Date("2026-11-15T10:00:00Z"),
      openedAt: new Date("2026-11-16T10:00:00Z"),
      openedByUid: "rahul",
      reviewStatus: "unreviewed",
      updatedAt: new Date("2026-11-15T09:00:00Z"),
    });
    assert.equal((await w.write("chloe", 3, { boxes: { "wb-what": "Lamps and keepers." } })).status, 200);
    const row = w.world.db.read(w.rowPath("chloe", 3));
    assert.deepEqual(row.boxes, { "wb-what": "Lamps and keepers." });
    assert.deepEqual(row.earlierVersions[0].boxes, { "wb-what": "Lamps." }, "the words as sent, kept");
  });

  test("a page opened before an answer had its own Send is told to reload when it asks to send", async () => {
    const old = await w.call("chloe", w.routes.write.PUT, { runId: RUN.agi, answerId: ONE_BOX.id }, { course: true, body: { weekId: "w02", text: ENOUGH, send: true } });
    assert.equal(old.status, 400);
    assert.match(old.body.error, /Reload the page/);
  });
});

describe("5. ticks go through the tick route, which logs them and closes only with the programme", () => {
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

  test("Group A's week 3 met on Thursday and still takes ticks, with their own time; once the programme closes, none", async () => {
    assert.equal((await w.tick("chloe", 3, "n3-s1")).status, 200, B);
    assert.equal((await w.tick("amara", 3, "n3-s1")).status, 200, "after the session: late, never refused");
    assert.equal(new Date(w.world.db.read(`courseProgress/${RUN.agi}__amara__n3-s1`).completedAt).toISOString(), new Date(NOW).toISOString());
    w.at(CLOSES);
    assert.equal((await w.tick("amara", 3, "n3-s1", false)).status, 409);
  });
});

// ---------------------------------------------------------------------------
// 6. Reflections
// ---------------------------------------------------------------------------

const r = await makeWeekBlocksPageWorld("__weekWorkReflections");

describe("6. reflections: the version at the session kept once, an emptied box kept for it, and the close", () => {
  const rowOf = (uid, promptId, weekId) => r.world.db.read(`courseExerciseResponses/${RUN.agi}__${uid}__${weekId}__${promptId}`);
  const setClock = (iso) => mock.timers.setTime(new Date(iso).getTime());

  beforeEach(() => r.reset());

  test("written before the session and changed after it: the words at the session kept, once, in the same write", async () => {
    // Group B's week 3 meets tonight at 6pm.
    setClock("2026-11-17T12:00:00Z");
    assert.equal((await r.writeBox("chloe", "k3-rp1", "w03", "Before.")).status, 200);
    setClock("2026-11-17T19:00:00Z");
    assert.equal((await r.writeBox("chloe", "k3-rp1", "w03", "After.")).status, 200, "nothing closes at the session");
    const row = rowOf("chloe", "k3-rp1", "w03");
    assert.deepEqual([row.text, row.earlierVersions.length, row.earlierVersions[0].text, row.earlierVersions[0].reasons], ["After.", 1, "Before.", ["session"]]);
    setClock("2026-11-17T20:00:00Z");
    assert.equal((await r.writeBox("chloe", "k3-rp1", "w03", "Later.")).status, 200);
    assert.equal(rowOf("chloe", "k3-rp1", "w03").earlierVersions.length, 1, "a second change keeps nothing more");
    // Written first after the session: nothing to keep.
    assert.equal((await r.writeBox("chloe", "k3-rp2", "w03", "First words.")).status, 200);
    assert.equal(rowOf("chloe", "k3-rp2", "w03").earlierVersions, undefined);
  });

  test("the box's own route answers with when its words were saved, for the writer's page; an unchanged save answers with the last one", async () => {
    setClock("2026-11-17T12:00:00Z");
    const first = await r.writeBox("chloe", "k3-rp1", "w03", "Before.");
    assert.equal(first.body.response.savedAt, "2026-11-17T12:00:00.000Z");
    setClock("2026-11-17T19:00:00Z");
    const same = await r.writeBox("chloe", "k3-rp1", "w03", "Before.");
    assert.equal(same.status, 200);
    assert.equal(new Date(same.body.response.savedAt).getTime(), rowOf("chloe", "k3-rp1", "w03").updatedAt.getTime(), "an unchanged save says when the words were really saved");
    assert.notEqual(same.body.response.savedAt, "2026-11-17T19:00:00.000Z");
    // Emptied, nothing is said to be saved.
    setClock("2026-11-17T20:00:00Z");
    assert.equal((await r.writeBox("chloe", "k3-rp1", "w03", "")).body.response.savedAt, null);
  });

  test("an emptied box keeps its row, empty, when a version is owed; it reads as nothing written; otherwise its row goes", async () => {
    setClock("2026-11-17T12:00:00Z");
    await r.writeBox("chloe", "k3-rp1", "w03", "Before.");
    await r.writeBox("chloe", "k3-rp2", "w03", "Gone soon.");
    assert.equal((await r.writeBox("chloe", "k3-rp2", "w03", "")).status, 200);
    assert.equal(rowOf("chloe", "k3-rp2", "w03"), undefined, "emptied before the session: nothing kept");
    setClock("2026-11-17T19:00:00Z");
    assert.equal((await r.writeBox("chloe", "k3-rp1", "w03", "")).status, 200);
    const row = rowOf("chloe", "k3-rp1", "w03");
    assert.deepEqual([row.text, row.earlierVersions[0].text, Boolean(row.emptiedAt)], ["", "Before.", true]);
    // The one reader of whether a box holds something says it does not.
    const store = await r.loadTs("lib/firestore/courseExercises.ts");
    assert.equal(store.boxIsWritten(row), false);
    assert.equal(store.boxIsWritten({ kind: "reflection", text: "Words." }), true);
    // Written again: the row holds words, its versions with it, and reads as written.
    setClock("2026-11-17T20:00:00Z");
    await r.writeBox("chloe", "k3-rp1", "w03", "Again.");
    const again = rowOf("chloe", "k3-rp1", "w03");
    assert.deepEqual([again.text, again.earlierVersions.length, again.emptiedAt], ["Again.", 1, undefined]);
    assert.equal(store.boxIsWritten(again), true);
  });

  test("once the programme closes, a reflection is refused with when it closed", async () => {
    setClock("2026-12-24T00:00:00Z");
    const answer = await r.writeBox("chloe", "k3-rp1", "w03", "Too late.");
    assert.deepEqual([answer.status, answer.body.error], [409, "The programme closed at the end of Wed 23 Dec, so this week can’t change now."]);
    setClock("2026-12-23T23:00:00Z");
    assert.equal((await r.writeBox("chloe", "k3-rp1", "w03", "In time.")).status, 200);
  });
});
