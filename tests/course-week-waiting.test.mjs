/**
 * WAITING ON THE FACILITATOR'S SLIP: a part of a week the facilitator gives
 * out (a pathway, plan or pack; a case) that a person has not been given yet
 * reads as Waiting, is left out of "N of M done", and is never reminded,
 * while the rule that says a week is done stays exactly as strict as it was.
 *
 *  1. THE ONE DECISION (`src/lib/courses/weekWork/waiting.ts`) over built
 *     weeks: the synthetic week (a pack given out, a case study given out, a
 *     Choose one each person picks, a pitch with no cases), week 1 (nothing
 *     given out), and a person with neither, the pack, the case, or both.
 *  2. DONE IS UNCHANGED: `weekDone` answers as it did for every state, and
 *     what is derived from it (`personWeekProgress` for a week that gives
 *     nothing out or where everybody has theirs) is the very shape it was.
 *  3. EACH READER, before and after, for a pathway not given, a case not
 *     given, both, neither: the count, the reminders' list and whether they
 *     go, Remind's words and who it reaches, a staff page's words and
 *     buckets, the Coursework tab's cell, the programme page's list of weeks.
 *  4. THE GUARD: every reader of a week's progress asks the one decision and
 *     decides nothing for itself.
 *  5. THE MEMBER'S WEEK PAGE in each state the design draws (before the
 *     session that hands the slips out, after it, given), every word
 *     character for character, through the real overview route and page on
 *     AGI Strategy's run (`tests/lib/packsAndCasesWorld.mjs`), and the
 *     group page's count of who is waiting.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { walkSource } from "./lib/functionScan.mjs";
import { B, NOW, RUN, W3, makePacksAndCasesWorld, packsSeed, weekBlocksFor } from "./lib/packsAndCasesWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

const w = await makePacksAndCasesWorld("__weekWaiting");
const waiting = await w.loadTs(join("lib", "courses", "weekWork", "waiting.ts"));
const waitingWords = await w.loadTs(join("lib", "courses", "weekWork", "waitingWords.ts"));
const model = await w.loadTs(join("lib", "courses", "weekWork", "model.ts"));
const staffWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));
const progress = await w.loadTs(join("lib", "courses", "weekBlocks", "progress.ts"));
const emails = await w.loadTs(join("lib", "courses", "weekEmails", "model.ts"));
const emailWords = await w.loadTs(join("lib", "courses", "weekEmails", "words.ts"));
const groupModel = await w.loadTs(join("lib", "courses", "groupWeekWork", "model.ts"));
const groupWords = await w.loadTs(join("lib", "courses", "groupWeekWork", "words.ts"));
const coursework = await w.loadTs(join("lib", "courses", "coursework", "model.ts"));
const reminders = await w.loadTs(join("lib", "scheduler", "jobs", "weekReminders.ts"));
const weekRows = await w.loadTs(join("features", "courses", "weekly", "weekRows.ts"));
const handOut = await w.loadTs(join("lib", "courses", "weekWork", "handOut.ts"));
const { resolveSessions } = await w.loadTs(join("lib", "courses", "sessions.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());

// ---------------------------------------------------------------------------
// The built week, and the people in it
// ---------------------------------------------------------------------------

const BLOCKS = weekBlocksFor("w3");
const TASKS = progress.weekTaskNeeds(BLOCKS);
const ASKS = model.weekWritingNeeds(BLOCKS);
const WEEK_ONE = weekOneBlocks("k1");

/** Every id of a kind the week's tasks need, each once. */
const all = (kind) => [...new Set(TASKS.flatMap((needs) => needs[kind]))];

/**
 * One person's state: everything they can do is done (every tick, every box
 * written, every answer sent, every talk they can be ready for), with the
 * pack and the case as given. `pack` is ticked when given.
 */
function person({ pack = null, caseId = null, ready = true, ticked = true } = {}) {
  const ticks = new Set(ticked ? [...all("tickIds"), ...(pack ? [pack] : [])] : []);
  return {
    isTicked: (id) => ticks.has(id),
    isWritten: () => ticked,
    isSent: () => ticked,
    packOf: (id) => (id === W3.given ? pack : id === W3.picked ? W3.atWork : null),
    isReady: (id) => ready && (id !== W3.caseStudy || caseId !== null),
    caseOf: (id) => (id === W3.caseStudy ? caseId : null),
    answerOf: () => ({ words: ticked ? 250 : 0, emptyBoxes: 0 }),
  };
}

const NEITHER = person();
const PACK_ONLY = person({ pack: W3.elections });
const CASE_ONLY = person({ caseId: W3.surprise });
const BOTH = person({ pack: W3.elections, caseId: W3.surprise });

// ---------------------------------------------------------------------------
// 1. The one decision
// ---------------------------------------------------------------------------

describe("1. the one decision", () => {
  test("what a facilitator gives out: the pack given out and the case study, never a Choose one each person picks or a pitch with no cases", () => {
    assert.deepEqual(waiting.givenOutOf(BLOCKS), { packs: [{ id: W3.given, word: "pack" }], cases: [W3.caseStudy] });
    assert.deepEqual(waiting.givenOutOf(WEEK_ONE), { packs: [], cases: [] });
  });

  test("neither, the pack, the case, both: the parts that wait, packs first", () => {
    const given = waiting.givenOutOf(BLOCKS);
    assert.deepEqual(waiting.waitingParts(given, NEITHER), [
      { kind: "pack", id: W3.given, word: "pack" },
      { kind: "case", id: W3.caseStudy },
    ]);
    assert.deepEqual(waiting.waitingParts(given, CASE_ONLY), [{ kind: "pack", id: W3.given, word: "pack" }]);
    assert.deepEqual(waiting.waitingParts(given, PACK_ONLY), [{ kind: "case", id: W3.caseStudy }]);
    assert.deepEqual(waiting.waitingParts(given, BOTH), []);
    // A page that cannot know the case never says a talk waits.
    assert.deepEqual(waiting.waitingParts(given, { packOf: () => null }), [{ kind: "pack", id: W3.given, word: "pack" }]);
    // A week that gives nothing out never waits on anybody.
    assert.deepEqual(waiting.waitingOf(WEEK_ONE, NEITHER), []);
  });

  test("the word is the Choose one's own: pathway, plan, pack", () => {
    assert.equal(waiting.packWordOf("Pathway"), "pathway");
    assert.equal(waiting.packWordOf("Plan"), "plan");
    assert.equal(waiting.packWordOf(""), "pack");
  });

  test("a task waits only when the slip is the one thing left in it", () => {
    const parts = waiting.waitingOf(BLOCKS, NEITHER);
    // Everything else done: the pack's task and the case's task wait.
    assert.deepEqual(TASKS.map((needs) => waiting.taskWaitsOn(needs, parts, NEITHER)?.kind ?? null), ["pack", null, "case"]);
    // Nothing done: "Parts 1 to 3" still holds readings and boxes to do, so it is open, as it always was.
    // The case study holds nothing else, so it waits from the start.
    const idle = person({ ticked: false, ready: false });
    assert.deepEqual(TASKS.map((needs) => waiting.taskWaitsOn(needs, waiting.waitingOf(BLOCKS, idle), idle)?.kind ?? null), [null, null, "case"]);
    // What a task holds that waits, whatever else is done: what the overview hands the page, every part of it.
    assert.deepEqual(TASKS.map((needs) => waiting.waitingPartsIn(needs, parts).map((part) => part.kind)), [["pack"], [], ["case"]]);
  });

  test("a task holding both a pathway and a case: the week page and the programme page draw the same row", () => {
    const both = { tickIds: [], promptIds: [], answerIds: [], chooseOneIds: [W3.given], talkIds: [W3.caseStudy], fillInIds: [], unseenIds: [] };
    const parts = waiting.waitingOf(BLOCKS, NEITHER);
    assert.equal(waiting.taskWaitsOn(both, parts, NEITHER)?.kind, "pack");
    const handed = { needs: both, written: [], sent: [], packs: {}, ready: [], waiting: waiting.waitingPartsIn(both, parts) };
    assert.equal(waiting.handedTaskWaitsOn(handed, () => false)?.kind, "pack", "the overview hands every part, so the programme page agrees");
    assert.equal(waiting.handedTaskWaitsOn({ ...handed, waiting: undefined }, () => false), null);
  });

  test("no count leaves a waiting task out: the waiting rule has no count of its own", () => {
    assert.equal(waiting.countTasks, undefined);
    assert.equal(waiting.countHandedTasks, undefined);
  });

  test("the reminders' tasks lose only the ids that wait", () => {
    const parts = waiting.waitingOf(BLOCKS, NEITHER);
    const without = waiting.withoutWaiting(TASKS, parts);
    assert.deepEqual(without.map((needs) => needs.chooseOneIds), [[], [], []]);
    assert.deepEqual(without.map((needs) => needs.talkIds), [[], [], []]);
    assert.deepEqual(without.map((needs) => needs.tickIds), TASKS.map((needs) => needs.tickIds));
    assert.deepEqual(waiting.withoutWaiting(TASKS, []), TASKS);
  });
});

// ---------------------------------------------------------------------------
// 2. Done is unchanged
// ---------------------------------------------------------------------------

describe("2. done is as strict as it was", () => {
  test("nobody waiting on a pack is done, and a case never decided done", () => {
    const done = (state) => model.weekDone({ tasks: TASKS, state, submitted: false, asks: ASKS });
    assert.equal(done(NEITHER), false, "the pack is not given");
    assert.equal(done(CASE_ONLY), false, "the pack is not given");
    assert.equal(done(PACK_ONLY), true, "a case never counted towards done");
    assert.equal(done(BOTH), true);
    // All that is left waits on the slip: only where done is false and would be true once given.
    const only = (state) => model.onlyWaitingLeft({ tasks: TASKS, state, submitted: false, asks: ASKS, parts: waiting.waitingOf(BLOCKS, state) });
    assert.equal(only(NEITHER), true);
    assert.equal(only(CASE_ONLY), true);
    assert.equal(only(PACK_ONLY), false, "done already");
    assert.equal(only(BOTH), false);
    // Something they can do is left too: not only waiting.
    assert.equal(only(person({ ticked: false })), false);
    // The pack given and its reading not ticked: theirs to do.
    assert.equal(only({ ...PACK_ONLY, isTicked: (id) => id !== W3.elections && PACK_ONLY.isTicked(id) }), false);
  });

  test("what a staff page reads for a week that gives nothing out, or where everybody has theirs, is the shape it always was", () => {
    const weekOneTasks = progress.weekTaskNeeds(WEEK_ONE);
    const plain = model.personWeekProgress({ tasks: weekOneTasks, state: NEITHER, submittedAt: null, touched: true, waiting: [] });
    assert.deepEqual(Object.keys(plain).sort(), ["done", "doneAt", "of", "started", "weekDone"]);
    const both = model.personWeekProgress({ tasks: TASKS, state: BOTH, submittedAt: null, touched: true, waiting: waiting.waitingOf(BLOCKS, BOTH) });
    assert.deepEqual(both, { done: 3, of: 3, weekDone: true, doneAt: null, started: true });
    // And for somebody waiting: the parts, and whether they are all that is left.
    const neither = model.personWeekProgress({ tasks: TASKS, state: NEITHER, submittedAt: null, touched: true, waiting: waiting.waitingOf(BLOCKS, NEITHER) });
    // A staff page counts every task, so it never says "1 of 1 done" of a week that is not done.
    assert.deepEqual(neither, {
      done: 1,
      of: 3,
      weekDone: false,
      doneAt: null,
      started: true,
      waiting: { parts: waiting.waitingOf(BLOCKS, NEITHER), only: true },
    });
  });

  test("weekDone's own text is untouched by this piece", () => {
    const source = read("lib", "courses", "weekWork", "model.ts");
    const body = source.slice(source.indexOf("export function weekDone("), source.indexOf("/**", source.indexOf("export function weekDone(")));
    assert.doesNotMatch(body, /waiting|Waiting|asIfGiven/);
  });
});

// ---------------------------------------------------------------------------
// 3. Each reader
// ---------------------------------------------------------------------------

describe("3. each reader, for a pathway not given, a case not given, both, neither", () => {
  const states = { neither: NEITHER, packOnly: PACK_ONLY, caseOnly: CASE_ONLY, both: BOTH };

  test("the reminders' list never names a pack or a case not given", () => {
    const left = (state) => emailWords.weekLeftWords(emails.weekLeft({ blocks: BLOCKS, tasks: TASKS, state }));
    // Everything else done: nothing is left to list for anybody.
    for (const [name, state] of Object.entries(states)) assert.deepEqual(left(state), [], name);
    // Nothing done: every other line, and never the pack or the talk while they wait.
    const idle = person({ ticked: false, ready: false });
    const lines = left(idle);
    assert.ok(lines.length > 0);
    assert.ok(!lines.some((line) => /been given your|ready for your talk/.test(line)), lines.join(" | "));
    // Given, the pack's reading and the talk are theirs again.
    const given = left({ ...person({ ticked: false, ready: false, pack: W3.elections, caseId: W3.surprise }) });
    assert.ok(given.includes("Your pack’s reading isn’t ticked."), given.join(" | "));
    assert.ok(given.includes("You haven’t said you’re ready for your talk yet."), given.join(" | "));
  });

  test("the reminder before a session: a week where waiting is all that is left has no list, and somebody not coming is not sent one", () => {
    const weekStates = {
      stateOf: () => ({ kind: "open", due: { at: new Date("2026-11-17T18:00:00Z"), by: "session" }, closesAt: null, submittedAt: null }),
    };
    const verdict = (state, notComing) =>
      reminders.sessionReminderVerdict({
        uid: "kofi",
        covered: [3],
        belongs: () => true,
        weeks: [{ weekNumber: 3, blocks: BLOCKS, tasks: TASKS, writes: true, asks: ASKS, facts: new Map([["kofi", { state }]]) }],
        weekStates,
        notComing,
      });
    for (const state of [NEITHER, CASE_ONLY, PACK_ONLY, BOTH]) {
      assert.deepEqual(verdict(state, false), { send: "session", weeks: [3], left: [] });
      assert.deepEqual(verdict(state, true), { send: false, why: "excused" });
    }
    // Something they can do is left: listed, without the pack.
    const idle = person({ ticked: false, ready: false });
    const listed = verdict(idle, true);
    assert.equal(listed.send, "left");
    assert.ok(!listed.weeks[0].left.items.some((item) => item.kind === "pack" || item.kind === "talk"));
  });

  test("Remind's words never ask for a pack or a case not given", () => {
    const idle = person({ ticked: false, ready: false });
    const items = groupWords.stillToDoItems(emails.weekLeft({ blocks: BLOCKS, tasks: TASKS, state: idle }));
    assert.ok(!items.some((item) => /ready for your talk|pack’s reading/.test(item)), items.join(" | "));
    const given = groupWords.stillToDoItems(emails.weekLeft({ blocks: BLOCKS, tasks: TASKS, state: person({ ticked: false, ready: false, pack: W3.elections, caseId: W3.surprise }) }));
    assert.ok(given.includes("getting ready for your talk"));
    assert.ok(given.includes("your pack’s reading"));
  });

  test("who Remind reaches: never somebody with a slip waiting and nothing else on their list, for the button and the press alike", () => {
    const base = { uid: "kofi", presserUid: "rahul", facilitatorUids: ["rahul"], told: true, due: { at: null, by: "session" }, closed: false };
    assert.equal(groupModel.notRemindedBecause({ ...base, weekDone: false, nothingLeftButSlips: true }), "waiting");
    assert.equal(groupModel.notRemindedBecause({ ...base, weekDone: false, nothingLeftButSlips: false }), null);
    assert.equal(groupModel.notRemindedBecause({ ...base, weekDone: true, nothingLeftButSlips: false }), "done");
    // Decided from the list itself: the pathway waits, the case is given and not marked ready, so the talk is on the list.
    const readyLeft = person({ caseId: W3.surprise, ready: false });
    const left = emails.weekLeft({ blocks: BLOCKS, tasks: TASKS, state: readyLeft });
    assert.deepEqual(left.items, [{ kind: "talk" }]);
    assert.equal(emails.nothingLeftButSlips(left, waiting.waitingOf(BLOCKS, readyLeft)), false);
    assert.equal(emails.nothingLeftButSlips(emails.weekLeft({ blocks: BLOCKS, tasks: TASKS, state: NEITHER }), waiting.waitingOf(BLOCKS, NEITHER)), true);
    assert.equal(emails.nothingLeftButSlips({ items: [], notSent: false }, []), false, "nothing waits: not this rule's to hold back");
    // `remindableOf` (`groupWeekWork/load.ts`) is the one rule the button's count and the press's audience ask.
    const load = read("lib", "courses", "groupWeekWork", "load.ts");
    assert.match(load, /nothingLeftButSlips: nothingLeftButSlipsOf\(read, person\.uid\)/);
    assert.match(load, /remind: read\.closed \? null : \{ count: rows\.filter\(\(row\) => row\.remindable\)\.length \}/);
    assert.match(load, /if \(!remindableOf\(read, \{ uid: member\.uid, told: true, presserUid \}\)\) continue;/);
  });

  test("a staff page: Waiting where all that is left waits, neither done nor not done; done stays done", () => {
    const due = { at: new Date("2026-11-17T18:00:00Z"), by: "session" };
    const facts = (state) => ({ state, times: { tickedAt: () => null, writtenAt: () => null, sentAt: () => null }, touched: true, savedAt: () => null });
    const pieces = groupModel.weekPiecesOf(BLOCKS, TASKS, ASKS);
    const of = (state) =>
      groupModel.personWeekStateOf({ tasks: TASKS, asks: ASKS, pieces, facts: facts(state), submittedAt: null, due, waiting: waiting.waitingOf(BLOCKS, state) });
    assert.deepEqual([of(NEITHER).text, of(NEITHER).bucket], ["Waiting", "waiting"]);
    assert.deepEqual([of(CASE_ONLY).text, of(CASE_ONLY).bucket], ["Waiting", "waiting"]);
    assert.equal(of(PACK_ONLY).bucket, "done");
    assert.equal(of(BOTH).bucket, "done");
    // The readings piece: the pack is out of its numbers, and the piece waits.
    const readings = of(NEITHER).pieces.find((piece) => piece.key === "readings");
    assert.equal(readings.bucket, "waiting");
    assert.equal(groupWords.pieceCellWords(readings), "Waiting");
    // Neither in "Week not done" nor done.
    const rows = [{ week: { bucket: "waiting" }, pieces: [{ key: "readings", bucket: "waiting" }] }];
    assert.deepEqual(groupModel.filterRows(rows, "week"), []);
    assert.deepEqual(groupModel.filterRows(rows, "readings"), []);
    assert.equal(groupModel.doneCount(groupModel.countBuckets(["waiting", "done"])), 1);
    assert.equal(groupWords.BUCKET_LABEL.waiting, "Waiting");
    // Somebody with something of their own left reads as before.
    assert.notEqual(of(person({ ticked: false })).text, "Waiting");
  });

  test("the group page's count of who is waiting, to their facilitator and to anybody else", () => {
    const parts = waiting.waitingOf(BLOCKS, NEITHER);
    const caseOnly = waiting.waitingOf(BLOCKS, PACK_ONLY);
    assert.equal(waitingWords.waitingCountWords([caseOnly, caseOnly, []], true), "2 are waiting for a case from you.");
    assert.equal(waitingWords.waitingCountWords([caseOnly], false), "1 is waiting for a case.");
    assert.equal(waitingWords.waitingCountWords([parts, caseOnly], true), "1 is waiting for a pack and a case from you. 1 is waiting for a case from you.");
    assert.equal(
      waitingWords.waitingCountWords([[{ kind: "pack", id: "x", word: "pathway" }], [{ kind: "pack", id: "x", word: "pathway" }]], true),
      "2 are waiting for a pathway from you.",
    );
    assert.equal(waitingWords.waitingCountWords([[], []], true), "");
  });

  test("the Coursework tab and a person's page: Waiting, not in Week not done", () => {
    const week = coursework.courseworkWeekOf({ weekNumber: 3, title: "How sure are you, again?", blocks: BLOCKS, summary: "", materials: [], exercises: [], checklist: [] });
    assert.deepEqual(week.givenOut, waiting.givenOutOf(BLOCKS));
    assert.equal(coursework.courseworkWeekOf({ weekNumber: 1, title: "", blocks: WEEK_ONE, summary: "", materials: [], exercises: [], checklist: [] }).givenOut, undefined);
    const everything = (packs) => ({
      reflections: new Set(TASKS.flatMap((needs) => needs.promptIds).map((id) => coursework.workKey(3, id))),
      boxes: new Set(TASKS.flatMap((needs) => needs.fillInIds).map((id) => coursework.workKey(3, id))),
      answers: new Map(),
      ticked: new Set([...all("tickIds"), ...packs.values()]),
      sentAt: new Map(TASKS.flatMap((needs) => needs.answerIds).map((id) => [coursework.workKey(3, id), NOW])),
      packs,
    });
    const standing = { reached: true, opensOn: null, due: { at: new Date("2026-11-17T18:00:00Z"), by: "session" }, submittedAt: null };
    const waitingCell = coursework.cellOf(week, 3, everything(new Map([[W3.picked, W3.atWork]])), { person: "/p" }, standing);
    assert.equal(waitingCell.onlyWaiting, true);
    assert.equal(waitingCell.done, false);
    assert.equal(coursework.cellStateOf(waitingCell, NOW), "waiting-slip");
    const given = coursework.cellOf(week, 3, everything(new Map([[W3.picked, W3.atWork], [W3.given, W3.elections]])), { person: "/p" }, standing);
    assert.equal(given.onlyWaiting, undefined);
    assert.equal(given.done, true);
  });

  test("the programme page's list of weeks: a week whose session is over with only a slip left says Waiting, never Done", () => {
    const schedule = { weekNumber: 3, slotStartKey: "2026-11-12", dateKey: "2026-11-10", startTimeLocal: "18:00", durationMinutes: 120, over: true, open: true, cancelled: false };
    const task = (over) => ({ type: "task", needs: { tickIds: ["t1"], promptIds: [], answerIds: [], chooseOneIds: [], talkIds: [], fillInIds: [], unseenIds: [] }, written: [], sent: [], ...over });
    const payload = (rows) => ({
      weekSchedule: [schedule],
      weeks: [{ id: "w03", weekNumber: 3, title: "Week 3", published: true, countableIds: [], thisWeek: { rows } }],
      currentWeek: null,
    });
    const rowOf = (rows) => weekRows.weekRowsOf(payload(rows), null, (ids) => ids.filter((id) => id === "t1").length, NOW, { takesPart: true })[0];
    const waitingTask = task({ needs: { ...task().needs, tickIds: [], chooseOneIds: ["co"] }, waiting: [{ kind: "pack", id: "co", word: "pathway" }] });
    assert.equal(rowOf([task(), waitingTask]).state, "waiting");
    assert.match(rowOf([task(), waitingTask]).when, /Waiting$/);
    // The count beside it is every task, as it always was.
    assert.deepEqual(rowOf([task(), waitingTask]).of, { done: 1, of: 2 });
    assert.equal(rowOf([task()]).state, "done");
    // A session called off says what it always said: "Cancelled", Not done, every task counted.
    const calledOff = weekRows.weekRowsOf(
      { ...payload([task(), waitingTask]), weekSchedule: [{ ...schedule, cancelled: true }] },
      null,
      (ids) => ids.filter((id) => id === "t1").length,
      NOW,
      { takesPart: true },
    )[0];
    assert.deepEqual([calledOff.state, calledOff.when, calledOff.of], ["notDone", "Tue 10 Nov · Cancelled", { done: 1, of: 2 }]);
    // A week not over yet says no Waiting beside its count, so it counts every task, as it always did.
    const ahead = weekRows.weekRowsOf(
      { ...payload([task(), waitingTask]), weekSchedule: [{ ...schedule, over: false, dateKey: "2026-11-24" }] },
      null,
      (ids) => ids.filter((id) => id === "t1").length,
      NOW,
      { takesPart: true },
    )[0];
    assert.deepEqual(ahead.of, { done: 1, of: 2 });
    // A task with a reading still to tick beside the pack is open, counted, and the week is Not done.
    const mixed = task({ needs: { ...task().needs, tickIds: ["t2"], chooseOneIds: ["co"] }, waiting: [{ kind: "pack", id: "co", word: "pathway" }] });
    assert.equal(rowOf([task(), mixed]).state, "notDone");
    assert.deepEqual(rowOf([task(), mixed]).of, { done: 1, of: 2 });
    assert.equal(waiting.handedTaskWaitsOn(mixed, (id) => id === "t1"), null);
    assert.equal(waiting.handedTaskWaitsOn(mixed, (id) => id === "t1" || id === "t2")?.kind, "pack");
    // Every page counts every task, a waiting one as not done, exactly as before.
    assert.deepEqual(progress.handedTasksDone([task(), waitingTask], (id) => id === "t1"), { done: 1, of: 2 });
  });
});

// ---------------------------------------------------------------------------
// 4. The guard
// ---------------------------------------------------------------------------

describe("4. the guard: every reader of a week's progress asks the one decision", () => {
  test("the decision is written once", () => {
    const written = [];
    for (const file of walkSource(SRC)) {
      if (/export function waitingParts\b|export function givenOutOf\b/.test(readFileSync(file, "utf8"))) written.push(file.slice(SRC.length + 1));
    }
    assert.deepEqual(written, [join("lib", "courses", "weekWork", "waiting.ts")]);
  });

  test("every file that counts or judges a person's week from their state asks it", () => {
    // A reader of a week's progress: it asks done, the count, the staff state or what is left, of somebody's own state.
    const READERS = /\b(personWeekProgress|personWeekStateOf|weekLeft|onlyWaitingLeft)\(|\bweekDone\(\{/;
    // How each one is tied to the one decision: it asks it, or is handed its answer by a caller that does.
    const TIED = /\bwaitingOf\(|\bwaitingParts\(|\bwaitingOfPerson\(|\bisOnlyWaiting\(|\bwithoutWaiting\(|\bwaiting: readonly WaitingPart\[\]/;
    /** Files that ask done and nothing else, for a reason that is not about what is left, each with why. */
    const DONE_ONLY = new Map([
      [join("lib", "courses", "weekWork", "model.ts"), "where done and onlyWaitingLeft are written"],
      [join("lib", "courses", "weekWork", "pageFacts.ts"), "the line under Send: what makes the week done, which a slip still waiting keeps not done"],
      [join("features", "courses", "weekBlocks", "BlockWeek.tsx"), "asks waitingOf directly; done there is the box at the top's own word"],
    ]);
    const unexplained = [];
    for (const file of walkSource(SRC)) {
      const rel = file.slice(SRC.length + 1);
      const text = readFileSync(file, "utf8");
      if (!READERS.test(text) || TIED.test(text)) continue;
      if (DONE_ONLY.has(rel)) continue;
      unexplained.push(rel);
    }
    assert.deepEqual(unexplained, [], "a reader of a week's progress that decides waiting for itself, or not at all");
    // Every entry of the list is still a reader, so none is stale.
    for (const rel of DONE_ONLY.keys()) assert.match(read(rel), READERS, rel);
  });

  test("every member page counts every task, through the base's own count, and only a task's row or a week's state word says Waiting", () => {
    // The count line of each member surface, exactly as before this piece.
    assert.match(read("features", "courses", "weekBlocks", "BlockWeek.tsx"), /const counts = tasksDone\(taskNeedsList, state\);/);
    assert.match(read("features", "courses", "weekly", "ThisWeekCard.tsx"), /const byTasks = thisWeek \? handedTasksDone\(tasks, ticks\.isDone\) : null;/);
    assert.match(read("features", "courses", "weekly", "weekRows.ts"), /const byTasks = doc\?\.thisWeek \? handedTasksDone\(tasks, isTicked\) : null;/);
    for (const rel of [join("app", "(app)", "dashboard", "HomeProgramme.tsx"), join("app", "(app)", "learn", "[runId]", "progress", "ProgressBody.tsx")]) {
      assert.match(read(rel), /handedTasksDone\(/, rel);
      assert.doesNotMatch(read(rel), /taskWaitsOn|weekWork\/waiting/, rel);
    }
    assert.match(read("lib", "courses", "weekBlocks", "progress.ts"), /const counted = tasks\.filter\(\(task\) => isCounted\(task\.needs\)\);/);
    // A task's row asks the one rule; the overview hands every waiting part of a task.
    assert.match(read("features", "courses", "weekBlocks", "BlockWeek.tsx"), /taskWaitsOn\(needs, waiting, state\)/);
    assert.match(read("features", "courses", "weekly", "ThisWeekCard.tsx"), /handedTaskWaitsOn\(task, ticks\.isDone\)/);
    assert.match(read("app", "api", "courses", "runs", "[runId]", "overview", "route.ts"), /waitingPartsIn\(needs, waiting\)/);
    // No file in the tree names a count that leaves a waiting task out.
    for (const file of walkSource(SRC)) assert.doesNotMatch(readFileSync(file, "utf8"), /\bcount(Handed)?Tasks\(/, file);
  });
});

// ---------------------------------------------------------------------------
// 5. The member's week page, and the group page
// ---------------------------------------------------------------------------

/** Group B with Rahul as its one facilitator, so the design's sentences name him. */
const ONE_FACILITATOR = (seed) => ({ ...seed, [`courseGroups/${B}`]: { ...seed[`courseGroups/${B}`], facilitatorUids: ["rahul"] } });

describe("5. the member's week page, in each state the design draws", () => {
  beforeEach(() => w.reset(ONE_FACILITATOR(packsSeed())));

  test("the words, character for character", () => {
    assert.equal(waitingWords.WAITING, "Waiting");
    assert.equal(waitingWords.waitingForWords({ kind: "pack", word: "pathway" }), "Waiting for your pathway");
    assert.equal(waitingWords.waitingForWords({ kind: "case" }), "Waiting for your case");
    assert.equal(waitingWords.handsOutWords("Rahul", 2), "Rahul gives these out at the end of week 2’s session.");
    assert.equal(
      waitingWords.notCopiedInWords("Rahul"),
      "Rahul hasn’t copied in your slip yet. There’s nothing you need to do, and nobody will remind you about this part until it’s here.",
    );
    // No words where the design has none: two facilitators, nobody named, no date.
    assert.equal(waitingWords.waitingLineWords({ kind: "session", weekNumber: 2, ended: false }, ["Rahul", "Sofia"]), null);
    assert.equal(waitingWords.waitingLineWords({ kind: "session", weekNumber: 2, ended: false }, []), null);
    assert.equal(waitingWords.waitingLineWords({ kind: "undated" }, ["Rahul"]), null);
    assert.equal(waitingWords.waitingLineWords({ kind: "none" }, ["Rahul"]), waitingWords.notCopiedInWords("Rahul"));
    assert.equal(w.lib.words.givenPacksLineWords(3, "Pathway", [], 1), "Given out at the end of session 1. Only your pathway counts.");
    assert.equal(w.lib.words.givenPacksLineWords(3, "Pathway", [], null), "Only your pathway counts.");
    assert.equal(w.lib.words.givenCaseLineWords(3, ["Rahul"], 2), "Given out at the end of session 2. To swap, ask Rahul.");
    // Today's wording, where the page cannot say: the week before.
    assert.equal(w.lib.words.givenCaseLineWords(3, []), "Given out at the end of session 2.");
  });

  test("before the session that hands them out: who gives them out, at which session", async () => {
    w.at(new Date("2026-11-10T12:00:00Z"));
    const { text } = await w.weekPage("kofi", 3);
    assert.ok(text.includes("Your pack Not given yet Rahul gives these out at the end of week 2’s session."), text);
    assert.ok(text.includes("Your case Not given yet Ready for my talk"), "the line is said once, under the pack");
    // Kofi has done nothing: "Parts 1 to 3" still holds readings to tick, so it is open, as it always was; the case study waits.
    assert.ok(text.includes("Not done yet: Parts 1 to 3"), text);
    assert.doesNotMatch(text, /Waiting for your pack/);
    assert.ok(text.includes("Waiting for your case Waiting"));
    assert.ok(text.includes("This week 0 of 3 done"), "every task counted, as it always was");
    assert.doesNotMatch(text, /hasn’t copied in/);
  });

  test("after that session, before the slip is copied in: nothing to do, and nobody will chase it", async () => {
    const { text } = await w.weekPage("kofi", 3);
    assert.ok(
      text.includes("Your pack Not given yet Rahul hasn’t copied in your slip yet. There’s nothing you need to do, and nobody will remind you about this part until it’s here."),
      text,
    );
    assert.doesNotMatch(text, /gives these out/);
    // The pack given and the case not: the line is under the case.
    w.seedDraw("kofi", "w3", { pack: W3.elections });
    const caseOnly = (await w.weekPage("kofi", 3)).text;
    assert.ok(caseOnly.includes("Your pack Elections"));
    assert.ok(caseOnly.includes("Your case Not given yet Rahul hasn’t copied in your slip yet."), caseOnly);
  });

  test("given: the pack and the case, with the session that really handed them out", async () => {
    w.seedDraw("kofi", "w3", { pack: W3.elections, caseId: W3.surprise });
    const { text } = await w.weekPage("kofi", 3);
    assert.ok(text.includes("Your pack Elections"));
    assert.ok(text.includes("Given out at the end of session 2. To swap, ask Rahul."), text);
    assert.doesNotMatch(text, /Waiting|Not given yet|hasn’t copied in|gives these out/);
  });

  test("a hand-out session called off: the session before it is named", async () => {
    w.world.db.poke(`courseGroups/${B}`, { sessionChanges: { w02: { kind: "cancelled", reason: "Room closed", dateKey: "2026-11-10" } } });
    w.at(new Date("2026-11-03T12:00:00Z"));
    const before = (await w.weekPage("kofi", 3)).text;
    assert.ok(before.includes("Rahul gives these out at the end of week 1’s session."), before);
    assert.ok(before.includes("Given out at the end of session 1."), before);
  });

  test("two facilitators: the design has no words, so the page says what it said before", async () => {
    w.world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia"] });
    const { text } = await w.weekPage("kofi", 3);
    assert.doesNotMatch(text, /hasn’t copied in|gives these out/);
    assert.ok(text.includes("Your case Not given yet Given out at the end of session 2."), text);
  });

  test("THE GUARD: every member surface shows the count it always showed, with the pathway given and the case not, and with only the waiting task left", async () => {
    w.seedDraw("kofi", "w3", { pack: W3.elections });
    const blocks = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`).blocks;
    const tasks = progress.weekTaskNeeds(blocks);
    /** Each count a member reads, by surface, from the real pages. */
    async function surfaces(ticked) {
      const week = (await w.weekPage("kofi", 3, ticked)).text;
      const programme = (await w.programmeHome("kofi", ticked)).text;
      const home = (await w.homeCard("kofi", ticked)).text;
      const overview = (await w.overview("kofi")).body.weeks.find((each) => each.weekNumber === 3);
      const handed = overview.thisWeek.rows.filter((row) => row.type === "task");
      const counted = (pattern, text) => pattern.exec(text)?.[1] ?? null;
      return {
        week,
        programme,
        counts: {
          weekTop: counted(/(\d+ of \d+) done Saved as you go/, week),
          weekBox: counted(/This week (\d+ of \d+) done Not done yet|This week (\d+ of \d+) done/, week) ?? counted(/This week (\d+ of \d+) done/, week),
          weekRail: counted(/On this page This week (\d+ of \d+)/, week),
          programmeCard: counted(/Add to calendar This week (\d+ of \d+) done/, programme),
          programmeList: counted(/Week 3 How sure are you, again\? Tonight (\d+ of \d+)/, programme),
          home: counted(/Before tonight (\d+ of \d+) done/, home),
          // The progress page counts by `handedTasksDone` over the overview's tasks (its own suite renders it).
          progress: (({ done, of }) => `${done} of ${of}`)(progress.handedTasksDone(handed, (id) => ticked.includes(id))),
        },
      };
    }
    const everywhere = (value) => ({ weekTop: value, weekBox: value, weekRail: value, programmeCard: value, programmeList: value, home: value, progress: value });

    // The pathway given and the case not, nothing done: every task counted, as it always was.
    const given = await surfaces([]);
    assert.deepEqual(given.counts, everywhere("0 of 3"));
    assert.ok(given.week.includes("Waiting for your case Waiting"));
    assert.ok(given.programme.includes("Waiting for your case Waiting"));

    // Only the waiting task left: the pathway's reading ticked, every box written, the answer sent.
    for (const promptId of [...new Set(tasks.flatMap((needs) => needs.promptIds))]) {
      const wrote = await w.call("kofi", (await w.courseRoute("runs", "[runId]", "reflections", "[promptId]")).PUT, { runId: RUN.agi, promptId }, { course: true, body: { weekId: "w03", text: "Written." } });
      assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    }
    const answerId = tasks.flatMap((needs) => needs.answerIds)[0];
    const text = Array.from({ length: 220 }, () => "lamps").join(" ");
    const saved = await w.call("kofi", (await w.courseRoute("runs", "[runId]", "written-answers", "[answerId]")).PUT, { runId: RUN.agi, answerId }, { course: true, body: { weekId: "w03", text } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const sent = await w.call("kofi", (await w.courseRoute("runs", "[runId]", "written-answers", "[answerId]", "send")).POST, { runId: RUN.agi, answerId }, { course: true, body: { weekId: "w03" } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const ticked = [...new Set(tasks.flatMap((needs) => needs.tickIds)), W3.elections];
    const only = await surfaces(ticked);
    assert.deepEqual(only.counts, everywhere("2 of 3"), "never 2 of 2: the waiting task is counted, not done");
    assert.ok(only.week.includes("Waiting for your case Waiting"));
    assert.ok(only.programme.includes("Waiting for your case Waiting"));

    // The case arrives: nothing goes back. The same count, and the talk's row is open.
    w.seedDraw("kofi", "w3", { pack: W3.elections, caseId: W3.surprise });
    const arrived = await surfaces(ticked);
    assert.deepEqual(arrived.counts, everywhere("2 of 3"));
    assert.doesNotMatch(arrived.week, /Waiting for your case/);
  });

  test("the group page says how many are waiting, to the group's facilitator", async () => {
    const { text } = await w.groupPage("rahul");
    assert.ok(text.includes("0 of 3 have done week 3 3 are waiting for a pack and a case from you."), text);
    // Given to one of them: two are still waiting, and nothing else changes.
    w.seedDraw("kofi", "w3", { pack: W3.elections, caseId: W3.surprise });
    assert.ok((await w.groupPage("rahul")).text.includes("0 of 3 have done week 3 2 are waiting for a pack and a case from you."));
    // To an admin who is not the group's facilitator, the plain form.
    assert.ok((await w.groupPage("zach")).text.includes("2 are waiting for a pack and a case."));
  });

  test("when the slips go out, from the draw's rule over a real group's sessions", async () => {
    const run = normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
    const group = normalizeCourseGroup(B, w.world.db.read(`courseGroups/${B}`));
    const sessions = resolveSessions(run, group);
    // Week 3's slips go out at week 2's session, over by now (Tue 17 Nov, noon).
    assert.deepEqual(handOut.handOutOf(sessions, 3, NOW), { kind: "session", weekNumber: 2, ended: true });
    assert.deepEqual(handOut.handOutOf(sessions, 3, new Date("2026-11-10T19:00:00Z")), { kind: "session", weekNumber: 2, ended: false });
    assert.deepEqual(handOut.handOutOf(sessions, 1, NOW), { kind: "none" });
    assert.equal(staffWords.WAITING ?? waitingWords.WAITING, "Waiting");
  });
});
