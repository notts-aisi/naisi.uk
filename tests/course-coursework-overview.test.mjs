/**
 * The Coursework overview redrawn (Fri 13 Nov 2026): a programme's Coursework
 * tab as a table with words in every cell, the reader's flags beside each
 * week, the filters one at a time with their counts, the one list of what
 * waits for the reader's feedback, and Feedback to write on a group's page
 * learning "Changed since feedback".
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE RULES, as pure functions: what a cell says in every state; the
 *     three flags, each only where true and independent of each other; what
 *     counts as "Not read yet" (an answer saved before the day read times
 *     were kept, with no time stored, is in no count; with no such day known,
 *     nothing is); "Changed since feedback" decided by the newest piece of
 *     feedback alone; the filters, their counts, and the waiting list's order,
 *     which holds an answer with no feedback and one changed since, never one
 *     with feedback about its current words and never a reflection.
 *  2. THE LOADER AS EACH PERSON: who opens the tab, and what each is SENT:
 *     never anybody's words, never who read anything, the reader's own row
 *     with no flag and none of their own answers on their list, a
 *     facilitator's own work on an admin's and the lead's list, and to the
 *     lead no placement Publish has not told.
 *  3. FEEDBACK TO WRITE: an answer changed since its newest feedback is on a
 *     facilitator's card inside seven days of the change and gone after; a
 *     co-facilitator's own answer never; Home's line and the lead's line per
 *     group count what the card counts.
 *  4. THE MEMBER'S SIDE: nothing the person's own routes and week page are
 *     sent names the list or a flag of the tab.
 *
 * Real: the tab page, its loader, the group page, the Attendance tab, the
 * summary route and every library under them. Faked: see
 * `tests/lib/facilitatorWeekWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { C, find } from "./lib/facilitatorPagesWorld.mjs";
import { A, AGI, B, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, makeFacilitatorWeekWorld } from "./lib/facilitatorWeekWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const w = await makeFacilitatorWeekWorld("__courseworkOverviewSuite");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const tabPage = (await w.loadTs(join(PROGRAMME, "(tabs)", "coursework", "page.tsx"))).default;
const model = await w.loadTs(join("lib", "courses", "coursework", "model.ts"));
const overview = await w.loadTs(join("lib", "courses", "coursework", "overview.ts"));
const words = await w.loadTs(join("lib", "courses", "coursework", "words.ts"));
const feedbackModel = await w.loadTs(join("lib", "courses", "feedback", "model.ts"));
const weekPlan = await w.loadTs(join("lib", "courses", "weekPlan.ts"));

const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
const GROUP_PATH = `/learn/${RUN.agi}/group/${B}`;

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** Week 3 as the coursework suites write it: week 1's shape, a written answer and two boxes in a fourth part. */
function weekThree() {
  return {
    weekNumber: 3,
    title: "The lamp makers",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks: [
      ...weekOneBlocks("k3"),
      {
        id: "k3-p4",
        type: "part",
        title: "Your keeper's plan",
        time: "About 30 minutes",
        framing: [],
        blocks: [
          { id: "k3-wa", type: "writtenAnswer", prompt: [p(run("Who should keep the lamps lit, and why?"))], boxes: [], guidance: [], words: { min: 1, max: 200 }, due: "dayBefore" },
          {
            id: "k3-fi",
            type: "fillIn",
            title: "My keeper's plan",
            groups: [{ heading: "My next step", boxes: [{ id: "k3-fb1", label: "" }, { id: "k3-fb2", label: "And after that" }] }],
          },
        ],
      },
    ],
  };
}

const SENT = new Date("2026-11-16T09:00:00Z");
const T1 = SENT;
const T2 = new Date("2026-11-18T09:00:00Z");
const AFTER_THE_SESSION = "2026-11-18T10:00:00Z";

/** A written answer as its routes store one. */
function answer(uid, text, { sent = SENT, saved = SENT, earlier = [] } = {}) {
  return {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "k3-wa",
    responseType: "text",
    text,
    words: text.split(/\s+/).length,
    submittedAt: sent,
    firstSentAt: sent,
    sentAt: sent,
    updatedAt: saved,
    reviewStatus: "unreviewed",
    ...(earlier.length > 0 ? { earlierVersions: earlier } : {}),
  };
}

/** A piece of feedback on a written answer, as its route stores one. */
function piece(uid, { by, role = "facilitator", about, at }) {
  return {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    on: { kind: "writtenAnswer", itemId: "k3-wa" },
    text: `${by} wrote about ${uid}'s answer.`,
    aboutSavedAt: about,
    byUid: by,
    byRole: role,
    createdAt: at,
    editedAt: null,
    emailedAt: null,
    emailedByUid: "",
    emailDelivery: null,
    emailClaimedAt: null,
    sendId: "",
  };
}

/** An answer changed after feedback on its sent words: sent at T1, changed at T2, the sent version kept. */
function changedAnswer(uid, before, after) {
  return answer(uid, after, { sent: T1, saved: T2, earlier: [{ text: before, words: before.split(/\s+/).length, savedAt: T1, replacedAt: T2, sentAt: T1, reasons: ["reviewed"] }] });
}

const ANSWERS = {
  chloe: "Keepers should, because they know the lamps.",
  rahul: "The town, through the harbour board.",
  farah: "Split the bill by tonnage.",
  farahLater: "Split the bill by tonnage, and the town pays the rest.",
  una: "The lighthouse board, as it always has.",
};
const ALL_WORDS = [...Object.values(SAID).flatMap((said) => Object.values(said)), ...Object.values(ANSWERS)];

/** The one document saying when the site began keeping read times: here, the start of Fri 13 Nov. */
const KEPT_DOC = "config/firstReadTimes";
const KEPT_SINCE = new Date("2026-11-13T00:00:00Z");

function seed(over = {}) {
  return facilitatorWeekSeed({
    [KEPT_DOC]: { keptSince: KEPT_SINCE },
    [`courseRuns/${RUN.agi}/weeks/w03`]: weekThree(),
    [`courseRuns/${RUN.agi}/weeks/w01`]: { ...weekThree(), weekNumber: 1, title: "The first lamps", blocks: weekOneBlocks("k1") },
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: answer("chloe", ANSWERS.chloe),
    [`courseExerciseResponses/${RUN.agi}__rahul__w03__k3-wa`]: answer("rahul", ANSWERS.rahul, { sent: new Date("2026-11-15T20:00:00Z"), saved: new Date("2026-11-15T20:00:00Z") }),
    ...over,
  });
}

beforeEach(() => w.reset(seed()));

const tab = (who, query = {}) => w.draw(tabPage, who, { roundId: ROUND, programmeId: AGI }, query);
const tableOf = (drawn) => find(drawn.element, "CourseworkTable")[0]?.props.view ?? null;
const rowsOf = (view) => view.sections.flatMap((section) => section.rows);
const rowOf = (view, uid) => rowsOf(view).find((row) => row.uid === uid) ?? null;
const cellOf = (view, uid, weekNumber = 3) => rowOf(view, uid)?.cells.find((cell) => cell.weekNumber === weekNumber) ?? null;
const listOf = (view) => view.waiting.rows.map((row) => [row.uid, row.weekNumber, row.kind]);
const NO_FLAGS = { unread: false, noFeedback: false, changed: false };

// ---------------------------------------------------------------------------
// 1. The rules
// ---------------------------------------------------------------------------

describe("1. the rules, as pure functions", () => {
  const KEPT = new Date("2026-11-13T00:00:00Z");
  const BEFORE = new Date("2026-11-10T09:00:00Z");
  const AFTER = new Date("2026-11-15T09:00:00Z");
  /** A week of one part with two prompts, one box and a written answer. */
  const week = {
    weekNumber: 3,
    title: "",
    parts: [{ number: 1, title: "", prompts: [{ id: "rp1", text: "" }, { id: "rp2", text: "" }] }],
    sources: [{ id: "s1", title: "", kindLabel: "", partNumber: 1 }],
    answer: { id: "wa", prompt: "", boxes: [] },
    boxes: [{ id: "fb1", heading: "", label: "" }],
    tasks: [],
    writes: true,
  };
  const facts = (over = {}) => ({ readable: true, savedAt: AFTER, readableSince: AFTER, firstSentAt: AFTER, sentLateMs: null, sessionStart: AFTER, pieces: 0, changed: false, ...over });
  const work = (over = {}) => ({ ...model.NO_WORK, savedAt: new Map(), answerFacts: new Map(), ...over });
  const reading = (over = {}) => ({ boxes: true, firstReads: new Map(), keptFrom: KEPT, ...over });
  const flags = (w0, r0) => overview.flagsOf(week, 3, w0, r0).flags;

  test("what a cell says first, in every state, and in words", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const cell = (over) => ({ counted: true, done: false, doneAt: null, doneLateMs: null, due: { at: null, by: "session" }, reached: true, started: false, ...over });
    const seen = [
      cell({ counted: false }),
      cell({ done: true }),
      cell({ done: true, doneAt: "2026-11-15T09:00:00.000Z", due: { at: "2026-11-17T18:00:00.000Z", by: "session" } }),
      cell({ done: true, doneAt: "2026-11-18T09:00:00.000Z", doneLateMs: 3600000, due: { at: "2026-11-17T18:00:00.000Z", by: "session" } }),
      cell({ due: { at: null, by: "joined-late" }, started: true }),
      cell({ reached: false, started: true }),
      cell({ started: true }),
      cell({}),
    ].map((each) => model.cellStateOf(each, now));
    assert.deepEqual(seen, ["no-coursework", "done", "done-on-time", "done-late", "joined-late", "opens", "started", "not-started"]);
    // Done before its session: plain Done, since on time cannot be said yet.
    assert.equal(model.cellStateOf(cell({ done: true, doneAt: "2026-11-15T09:00:00.000Z", due: { at: "2026-11-21T18:00:00.000Z", by: "session" } }), now), "done");
    assert.deepEqual(
      seen.map((state) => words.cellStateWords(state, "2026-11-12")),
      ["No coursework", "Done", "Done on time", "Done late", "Joined late", "Opens Thu 12 Nov", "Started", "Not started"],
    );
    assert.equal(words.cellStateWords("opens", null), "Not open yet");
    // The day a week opens is the first day of its slot: the day `currentWeekFor` first anchors to it.
    const plan = [
      { kind: "week", weekNumber: 1, weekId: "w01" },
      { kind: "break", label: "Reading week" },
      { kind: "week", weekNumber: 2, weekId: "w02" },
    ];
    assert.equal(weekPlan.weekOpensOn({ startDate: "2026-10-29", weekPlan: plan }, 2), "2026-11-12");
    assert.equal(weekPlan.currentWeekFor({ startDate: "2026-10-29", weekPlan: plan }, new Date("2026-11-11T12:00:00Z")).anchorWeekNumber, 1);
    assert.equal(weekPlan.currentWeekFor({ startDate: "2026-10-29", weekPlan: plan }, new Date("2026-11-12T12:00:00Z")).anchorWeekNumber, 2);
    assert.equal(weekPlan.weekOpensOn({ startDate: "2026-10-29", weekPlan: plan }, 9), null);
    assert.equal(weekPlan.weekOpensOn({ startDate: "", weekPlan: plan }, 1), null);
  });

  test("Not read yet: a reflection, a box or the answer its readers may read in full, saved since read times were kept, with no time stored", () => {
    const reflection = work({ reflections: new Set(["3 rp1"]), savedAt: new Map([["3 rp1", AFTER]]) });
    assert.deepEqual(flags(reflection, reading()), { unread: true, noFeedback: false, changed: false });
    // A time stored: read.
    assert.equal(flags(reflection, reading({ firstReads: new Map([["rp1", AFTER]]) })).unread, false);
    // Saved before the site began keeping read times, with no time stored: neither read nor unread, in no count.
    assert.equal(flags(work({ reflections: new Set(["3 rp1"]), savedAt: new Map([["3 rp1", BEFORE]]) }), reading()).unread, false);
    assert.equal(flags(work({ reflections: new Set(["3 rp1"]), savedAt: new Map([["3 rp1", null]]) }), reading()).unread, false);
    // No day known: nothing is unread.
    assert.equal(flags(reflection, reading({ keptFrom: null })).unread, false);
    // A box counts only for a reader the boxes' gate admits.
    const box = work({ boxes: new Set(["3 fb1"]), savedAt: new Map([["3 fb1", AFTER]]) });
    assert.equal(flags(box, reading()).unread, true);
    assert.equal(flags(box, reading({ boxes: false })).unread, false);
    // The written answer: unread until read, and an answer with feedback counts as read.
    assert.equal(flags(work({ answerFacts: new Map([["3 wa", facts()]]) }), reading()).unread, true);
    assert.equal(flags(work({ answerFacts: new Map([["3 wa", facts({ pieces: 1 })]]) }), reading()).unread, false);
    // Told by when it became readable in the words shown, not by its last save alone: readable since before the day, no state.
    assert.equal(flags(work({ answerFacts: new Map([["3 wa", facts({ readableSince: BEFORE })]]) }), reading()).unread, false);
    // Still hidden before the session: no state at all.
    assert.deepEqual(overview.flagsOf(week, 3, work({ answerFacts: new Map([["3 wa", facts({ readable: false, savedAt: null, readableSince: null })]]) }), reading()), {
      flags: NO_FLAGS,
      waiting: null,
    });
    assert.deepEqual(overview.flagsOf(null, 3, reflection, reading()), { flags: NO_FLAGS, waiting: null });
  });

  test("the two states are independent: unread with feedback, read with none, and each flag only where true", () => {
    const readNone = work({ answerFacts: new Map([["3 wa", facts()]]) });
    assert.deepEqual(flags(readNone, reading({ firstReads: new Map([["wa", AFTER]]) })), { unread: false, noFeedback: true, changed: false });
    const unreadGiven = work({ reflections: new Set(["3 rp2"]), savedAt: new Map([["3 rp2", AFTER]]), answerFacts: new Map([["3 wa", facts({ pieces: 1 })]]) });
    assert.deepEqual(flags(unreadGiven, reading()), { unread: true, noFeedback: false, changed: false });
    const changed = work({ answerFacts: new Map([["3 wa", facts({ pieces: 2, changed: true, savedAt: AFTER })]]) });
    assert.deepEqual(flags(changed, reading()), { unread: false, noFeedback: false, changed: true });
    // Changed since feedback is not "no feedback yet".
    assert.equal(flags(changed, reading()).noFeedback, false);
  });

  test("changed since feedback: decided by the newest piece alone, never its words", () => {
    const v1 = "2026-11-16T09:00:00.000Z";
    const v2 = "2026-11-18T09:00:00.000Z";
    const card = (id, at, about, aboutGone = false) => ({ id, at, about: about === null ? null : { savedAt: about }, aboutGone });
    // No feedback: nothing to have changed since.
    assert.equal(feedbackModel.changedSinceFeedback([], v2), false);
    // Feedback A on v1, then changed to v2: changed.
    assert.equal(feedbackModel.changedSinceFeedback([card("a", "2026-11-17T09:00:00.000Z", v1)], v2), true);
    // Then feedback B on v2, the words read now: NOT changed, whatever A was about.
    assert.equal(feedbackModel.changedSinceFeedback([card("a", "2026-11-17T09:00:00.000Z", v1), card("b", "2026-11-18T10:00:00.000Z", null)], v2), false);
    // In any order handed.
    assert.equal(feedbackModel.changedSinceFeedback([card("b", "2026-11-18T10:00:00.000Z", null), card("a", "2026-11-17T09:00:00.000Z", v1)], v2), false);
    // Before the session, a piece about the very words read (as last sent) is about no change.
    assert.equal(feedbackModel.changedSinceFeedback([card("a", "2026-11-17T09:00:00.000Z", v1)], v1), false);
    // The newest about a version no longer kept: changed.
    assert.equal(feedbackModel.changedSinceFeedback([card("a", "2026-11-17T09:00:00.000Z", null, true)], v2), true);
    // Feedback from before pieces existed counts as about the words it was given on.
    assert.equal(feedbackModel.changedSinceFeedback([card("legacy:wa", "2026-11-17T09:00:00.000Z", null)], v2), false);
    // What the rule is handed of the stored pieces: when, and which version, never the words.
    const stored = {
      text: "Now the town pays.",
      boxes: null,
      words: 4,
      savedAt: new Date(v2),
      firstSentAt: new Date(v1),
      sentAt: new Date(v1),
      earlierVersions: [{ text: "Keepers pay.", boxes: null, words: 2, savedAt: new Date(v1), replacedAt: new Date(v2), sentAt: new Date(v1), reasons: ["reviewed"] }],
    };
    const versions = feedbackModel.feedbackVersionsOf(
      "wa",
      [
        { id: "a", on: { kind: "writtenAnswer", itemId: "wa" }, aboutSavedAt: new Date(v1), createdAt: new Date("2026-11-17T09:00:00Z") },
        { id: "other", on: { kind: "writtenAnswer", itemId: "another" }, aboutSavedAt: new Date(v1), createdAt: new Date("2026-11-17T09:00:00Z") },
        { id: "week", on: { kind: "week" }, aboutSavedAt: null, createdAt: new Date("2026-11-17T09:00:00Z") },
      ],
      { sentAt: new Date("2026-11-16T20:00:00Z") },
      stored,
    );
    assert.deepEqual(versions, [
      { id: "legacy:wa", at: "2026-11-16T20:00:00.000Z", about: null, aboutGone: false },
      { id: "a", at: "2026-11-17T09:00:00.000Z", about: { savedAt: v1 }, aboutGone: false },
    ]);
    assert.ok(!JSON.stringify(versions).includes("Keepers pay."), "the rule is handed the words of a version");
    assert.equal(feedbackModel.changedSinceFeedback(versions, v2), true);
  });

  test("the filters keep one thing each, with counts of the chosen group's people", () => {
    const row = (uid, groupId, over = {}) => ({ uid, groupId, notDone: false, late: false, unread: false, noFeedback: false, changed: false, ...over });
    const rows = [
      row("a", "g1", { notDone: true, unread: true }),
      row("b", "g1", { noFeedback: true }),
      row("c", "g2", { late: true, changed: true, unread: true }),
      row("d", null, { notDone: true }),
    ];
    assert.deepEqual(model.showCounts(rows), { everyone: 4, notDone: 2, late: 1, unread: 2, noFeedback: 1, changed: 1 });
    assert.deepEqual(model.showCounts(model.rowsInGroup(rows, "g1", ["g1", "g2"])), { everyone: 2, notDone: 1, late: 0, unread: 1, noFeedback: 1, changed: 0 });
    assert.deepEqual(model.rowsInGroup(rows, "none", ["g1", "g2"]).map((each) => each.uid), ["d"]);
    assert.deepEqual(model.rowsInGroup(rows, "all", ["g1", "g2"]).map((each) => each.uid), ["a", "b", "c", "d"]);
    for (const show of model.COURSEWORK_SHOWS) {
      const kept = rows.filter((each) => model.showKeeps(show, each)).map((each) => each.uid);
      assert.equal(kept.length, model.showCounts(rows)[show], show);
    }
    // Each filter's address, and today's two kept.
    assert.deepEqual(
      model.COURSEWORK_SHOWS.map((show) => model.filterHref("/c", { group: "all", show })),
      ["/c", "/c?notdone=1", "/c?late=1", "/c?unread=1", "/c?waiting=1", "/c?changed=1"],
    );
    for (const show of model.COURSEWORK_SHOWS) {
      const query = Object.fromEntries(new URLSearchParams(model.filterHref("/c", { group: "g1", show }).split("?")[1] ?? ""));
      assert.deepEqual(model.readFilter(query, ["g1"]), { group: "g1", show }, show);
    }
    assert.deepEqual(model.COURSEWORK_SHOWS.map((show) => words.SHOW_WORDS[show]), ["Everyone", "Week not done", "Late", "Not read yet", "No feedback yet", "Changed since feedback"]);
  });

  test("waiting for feedback, oldest first: an answer with none and one changed since, never one with current feedback, never a reflection", () => {
    const cell = (weekNumber, waiting, uid = "z") => ({ weekNumber, href: `/${uid}?week=${weekNumber}`, waiting });
    const waits = (kind, at, over = {}) => ({ kind, at, notSent: false, late: false, unread: false, ...over });
    const rows = [
      { uid: "z", name: "Zed", href: "/z", cells: [cell(1, waits("none", "2026-11-05T09:00:00.000Z")), cell(2, null)] },
      { uid: "a", name: "Ana", href: "/a", cells: [cell(1, waits("changed", "2026-11-07T09:00:00.000Z")), cell(2, waits("none", null))] },
      { uid: "b", name: "Bo", href: "/b", cells: [cell(1, waits("none", "2026-11-06T18:00:00.000Z", { notSent: true }))] },
      // A reflection or a box never makes a cell wait; nor does an answer with feedback about its current words.
      { uid: "c", name: "Cy", href: "/c", cells: [cell(1, null), cell(2, null)] },
    ];
    const list = overview.waitingList(rows);
    assert.deepEqual(
      list.map((row) => [row.uid, row.weekNumber, row.kind]),
      [
        ["z", 1, "none"],
        ["b", 1, "none"],
        ["a", 1, "changed"],
        ["a", 2, "none"],
      ],
    );
    assert.equal(list[0].readHref, "/z?week=1#reading-answer");
    assert.equal(list[0].personHref, "/z");
    // A cell waits only by the flags' rules: no feedback, or changed since.
    const unreadNoFeedback = overview.flagsOf(week, 3, work({ answerFacts: new Map([["3 wa", facts({ firstSentAt: null, sessionStart: BEFORE })]]) }), reading());
    assert.deepEqual(unreadNoFeedback.waiting, { kind: "none", at: BEFORE.toISOString(), notSent: true, late: false, unread: true });
    const late = overview.flagsOf(week, 3, work({ answerFacts: new Map([["3 wa", facts({ sentLateMs: 3600000 })]]) }), reading());
    assert.deepEqual(late.waiting, { kind: "none", at: AFTER.toISOString(), notSent: false, late: true, unread: true });
    const given = overview.flagsOf(week, 3, work({ answerFacts: new Map([["3 wa", facts({ pieces: 1 })]]) }), reading());
    assert.equal(given.waiting, null);
    const changedLater = new Date("2026-11-18T09:00:00Z");
    const changed = overview.flagsOf(week, 3, work({ answerFacts: new Map([["3 wa", facts({ pieces: 1, changed: true, savedAt: changedLater })]]) }), reading());
    assert.deepEqual(changed.waiting, { kind: "changed", at: changedLater.toISOString(), notSent: false, late: false, unread: false });
    const onlyReflections = overview.flagsOf(week, 3, work({ reflections: new Set(["3 rp1"]), savedAt: new Map([["3 rp1", AFTER]]) }), reading());
    assert.equal(onlyReflections.waiting, null);
    // The list's words.
    assert.equal(words.waitingSentWords(new Date("2026-11-05T09:00:00Z"), false), "Sent Thu 5 Nov");
    assert.equal(words.waitingSentWords(new Date("2026-11-05T09:00:00Z"), true), "Sent Thu 5 Nov · late");
    assert.equal(words.waitingChangedWords(new Date("2026-11-07T09:00:00Z")), "Changed since feedback, Sat 7 Nov");
    assert.equal(words.waitingNotSentWords(new Date("2026-11-05T18:00:00Z")), "Not sent, read since the session, Thu 5 Nov");
    assert.equal(words.writtenAnswerOfWeekWords(1), "week 1 written answer");
    assert.equal(words.showAllWords(14), "Show all 14");
    assert.equal(words.changedOnWords(new Date("2026-11-18T15:00:00Z")), "Changed since feedback, Wed 18 Nov, 3pm");
  });

  test("the week the tab is on: the address's when a column, else the newest begun for anybody of the group, else the first", () => {
    const columns = [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }];
    const rows = [{ cells: [{ weekNumber: 1, reached: true }, { weekNumber: 2, reached: true }, { weekNumber: 3, reached: false }] }];
    assert.deepEqual(overview.tabWeekOf({ week: "3" }, columns, rows), { weekNumber: 3, asked: true });
    assert.deepEqual(overview.tabWeekOf({ week: "7" }, columns, rows), { weekNumber: 2, asked: false });
    assert.deepEqual(overview.tabWeekOf({}, columns, [{ cells: [] }]), { weekNumber: 1, asked: false });
    assert.equal(overview.tabWeekOf({}, [], rows), null);
  });
});

// ---------------------------------------------------------------------------
// 2. The loader, as each person
// ---------------------------------------------------------------------------

describe("2. the tab as each person, and what each is sent", () => {
  test("an admin and the lead are drawn it; a reviewer is told whose it is; everybody else is sent away; nothing writes", async () => {
    const seen = {};
    for (const who of ["zach", "claudia", "lloyd", "rahul", "yusuf", "chloe", null]) {
      const drawn = await tab(who);
      assert.equal(drawn.wrote, false, `${who}'s tab wrote something`);
      seen[who ?? "signed out"] = drawn.to ?? (tableOf(drawn) ? "drawn" : /Only the programme’s lead and admins can open Coursework/.test(drawn.text) ? "not yours" : drawn.text.slice(0, 60));
    }
    assert.deepEqual(seen, {
      zach: "drawn",
      claudia: "drawn",
      // A reviewer on the form: told it is the lead's and admins'.
      lloyd: "not yours",
      // A facilitator, the run's track lead with no other role, a member, and nobody signed in.
      rahul: "/dashboard",
      yusuf: "/dashboard",
      chloe: "/dashboard",
      "signed out": "/dashboard",
    });
  });

  test("the filters Not read yet and No feedback yet each keep the right people, and their counts follow the group", async () => {
    const names = async (query, who = "zach") => rowsOf(tableOf(await tab(who, query))).map((row) => row.name);
    // Reflections saved since read times were kept, opened by nobody: Chloe, Farah, Rahul, Sofia (Group B) and Amara (Group A).
    assert.deepEqual(await names({ unread: "1" }), ["Chloe Nguyen", "Farah Hussain", "Rahul Mehta", "Sofia Rossi", "Amara Okafor"]);
    // Sent written answers with no feedback: Chloe's, and Rahul's own, which the lead and admins review.
    assert.deepEqual(await names({ waiting: "1" }), ["Chloe Nguyen", "Rahul Mehta"]);
    assert.deepEqual(await names({ waiting: "1" }, "claudia"), ["Chloe Nguyen", "Rahul Mehta"]);
    const view = tableOf(await tab("zach", { group: A }));
    // Group A: Amara, Bea, Dev and Tariq, of whom Amara alone has something not read yet.
    assert.deepEqual(view.showCounts, { everyone: 4, notDone: 4, late: 0, unread: 1, noFeedback: 0, changed: 0 });
    // Chloe's week read in full: her flag goes, and Not read yet keeps her no longer.
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      firstReadAt: { "k3-rp1": NOW, "k3-rp2": NOW, "k3-rp3": NOW, "k3-wa": NOW },
    });
    const after = tableOf(await tab("zach"));
    assert.deepEqual(cellOf(after, "chloe").flags, { unread: false, noFeedback: true, changed: false });
    assert.ok(!(await names({ unread: "1" })).includes("Chloe Nguyen"));
    assert.ok((await names({ waiting: "1" })).includes("Chloe Nguyen"), "read and with no feedback: still waiting for it");
    // The list says it is read now too.
    assert.deepEqual(after.waiting.rows.find((row) => row.uid === "chloe").unread, false);
  });

  test("on a database where the site has not begun keeping read times, nothing is said to be not read yet", async () => {
    const without = seed();
    delete without[KEPT_DOC];
    w.reset(without);
    const view = tableOf(await tab("zach"));
    assert.deepEqual(
      rowsOf(view)
        .filter((row) => row.cells.some((cell) => cell.flags.unread))
        .map((row) => row.name),
      [],
    );
    assert.equal(view.showCounts.unread, 0);
    assert.deepEqual(rowsOf(tableOf(await tab("zach", { unread: "1" }))), []);
    assert.ok(view.waiting.rows.every((row) => row.unread === false));
    // Feedback never leaned on read times: the same two answers wait for it.
    assert.deepEqual(rowsOf(tableOf(await tab("zach", { waiting: "1" }))).map((row) => row.name), ["Chloe Nguyen", "Rahul Mehta"]);
  });

  test("an answer changed since its newest feedback goes back on the list; feedback on the new words takes it off", async () => {
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__farah__w03__k3-wa`, changedAnswer("farah", ANSWERS.farah, ANSWERS.farahLater));
    w.world.db.seed("courseFeedback/piece-a", piece("farah", { by: "rahul", about: T1, at: new Date("2026-11-17T09:00:00Z") }));
    w.at(AFTER_THE_SESSION);
    let view = tableOf(await tab("claudia"));
    // Her reflections are still opened by nobody; her answer is read (feedback was written on it) and changed since.
    assert.deepEqual(cellOf(view, "farah").flags, { unread: true, noFeedback: false, changed: true });
    assert.deepEqual(
      view.waiting.rows.find((row) => row.uid === "farah"),
      {
        kind: "changed",
        at: T2.toISOString(),
        notSent: false,
        late: false,
        unread: false,
        uid: "farah",
        name: "Farah Hussain",
        personHref: `${PROGRAMME_PATH}/coursework/farah`,
        weekNumber: 3,
        readHref: `${PROGRAMME_PATH}/coursework/farah?week=3#reading-answer`,
      },
    );
    assert.deepEqual(rowsOf(tableOf(await tab("claudia", { changed: "1" }))).map((row) => row.uid), ["farah"]);
    assert.match((await tab("claudia")).text, /Farah Hussain · week 3 written answer Changed since feedback, Wed 18 Nov Read/);
    // Feedback B on the words read now: not changed, and gone from the list.
    w.world.db.seed("courseFeedback/piece-b", piece("farah", { by: "claudia", role: "lead", about: T2, at: new Date("2026-11-18T09:30:00Z") }));
    view = tableOf(await tab("claudia"));
    assert.deepEqual(cellOf(view, "farah").flags, { unread: true, noFeedback: false, changed: false });
    assert.ok(!view.waiting.rows.some((row) => row.uid === "farah"), "an answer with feedback on its current words waits");
    assert.deepEqual(rowsOf(tableOf(await tab("claudia", { changed: "1" }))), []);
  });

  test("the reader's own row: no flag, none of their own answers on their list; an admin's list holds that facilitator's own work", async () => {
    // Claudia, the lead, also facilitates Group C, and has written and sent her own week 3.
    w.world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "claudia"] });
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__claudia__w03__k3-wa`, answer("claudia", "The board, and the town.", { sent: new Date("2026-11-14T09:00:00Z"), saved: new Date("2026-11-14T09:00:00Z") }));
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__claudia__w03__k3-rp1`, {
      runId: RUN.agi,
      uid: "claudia",
      weekId: "w03",
      weekNumber: 3,
      exerciseId: "k3-rp1",
      kind: "reflection",
      responseType: "text",
      text: "Thirty or so.",
      submittedAt: null,
      reviewStatus: "unreviewed",
      updatedAt: new Date("2026-11-15T09:00:00Z"),
    });
    const asLead = tableOf(await tab("claudia"));
    const own = rowOf(asLead, "claudia");
    assert.ok(own, "the lead's own row is not drawn");
    assert.ok(own.facilitating);
    for (const cell of own.cells) {
      assert.deepEqual(cell.flags, NO_FLAGS, "the lead's own row carries a flag");
      assert.equal(cell.waiting, null);
    }
    assert.deepEqual([own.unread, own.noFeedback, own.changed], [false, false, false]);
    assert.ok(!asLead.waiting.rows.some((row) => row.uid === "claudia"), "the lead's own answer is on the lead's list");
    // A facilitator's own work is on the lead's list: Rahul's.
    assert.ok(asLead.waiting.rows.some((row) => row.uid === "rahul"));
    // To an admin, Claudia's is a facilitator's own work like any other: flagged, and on the list, oldest first.
    const asAdmin = tableOf(await tab("zach"));
    assert.deepEqual(cellOf(asAdmin, "claudia").flags, { unread: true, noFeedback: true, changed: false });
    assert.deepEqual(listOf(asAdmin), [
      ["claudia", 3, "none"],
      ["rahul", 3, "none"],
      ["chloe", 3, "none"],
    ]);
  });

  test("to the lead, a placement Publish has not told is no group and no flag; to an admin it is both", async () => {
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__una__w03__k3-wa`, answer("una", ANSWERS.una));
    const asLead = tableOf(await tab("claudia"));
    const una = rowOf(asLead, "una");
    assert.equal(una.groupId, null);
    assert.equal(una.notToldYet, false);
    assert.deepEqual(cellOf(asLead, "una").flags, NO_FLAGS);
    assert.ok(!asLead.waiting.rows.some((row) => row.uid === "una"), "the lead is sent a placement not told yet on the list");
    assert.ok(!JSON.stringify(rowOf(asLead, "una")).includes(C), "the lead is sent Una's group");
    const asAdmin = tableOf(await tab("zach"));
    assert.deepEqual([rowOf(asAdmin, "una").groupId, rowOf(asAdmin, "una").notToldYet], [C, true]);
    assert.deepEqual(cellOf(asAdmin, "una").flags, { unread: true, noFeedback: true, changed: false });
    assert.ok(asAdmin.waiting.rows.some((row) => row.uid === "una"));
  });

  test("no cell or row carries anybody's words, and nothing names who read anything or when", async () => {
    const STAMP = new Date("2026-11-17T11:11:11.111Z");
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-rp1": STAMP, "k3-wa": STAMP } });
    for (const who of ["zach", "claudia"]) {
      const drawn = await tab(who);
      const said = JSON.stringify(tableOf(drawn));
      for (const text of ALL_WORDS) assert.ok(!said.includes(text) && !drawn.html.includes(text), `${who}'s tab holds "${text}"`);
      for (const mark of [STAMP.toISOString(), String(STAMP.getTime()), "11:11", "firstRead", "readSince", "read by", "Read by"]) {
        assert.ok(!said.includes(mark) && !drawn.html.includes(mark), `${who}'s tab names ${mark}`);
      }
    }
  });

  test("the list draws ten, with Show all as a plain link, and all of them when asked; Read one question opens the chosen group's", async () => {
    const people = ["freya", "yasmin", "grace", "kofi", "sofia", "hamza", "tom", "una", "amara", "bea", "dev"];
    people.forEach((uid, index) => {
      const at = new Date(Date.UTC(2026, 10, 14, 9, index));
      w.world.db.seed(`courseExerciseResponses/${RUN.agi}__${uid}__w03__k3-wa`, answer(uid, `An answer of ${uid}'s.`, { sent: at, saved: at }));
    });
    const view = tableOf(await tab("zach"));
    assert.equal(view.waiting.total, 13);
    assert.equal(view.waiting.rows.length, 10);
    // Oldest first: the eleven sent on Sat 14 Nov in turn, then Rahul's and Chloe's.
    assert.deepEqual(view.waiting.rows.map((row) => row.uid), people.slice(0, 10));
    assert.equal(view.waiting.allHref, `${PROGRAMME_PATH}/coursework?list=all`);
    const drawn = await tab("zach");
    assert.match(drawn.html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework\\?list=all" class="showAll">Show all 13</a>`));
    const all = tableOf(await tab("zach", { list: "all" }));
    assert.deepEqual(all.waiting.rows.map((row) => row.uid), [...people, "rahul", "chloe"]);
    assert.equal(all.waiting.allHref, null);
    // Within the chosen group, and the filter and week kept by Show all.
    const groupB = tableOf(await tab("zach", { group: B, week: "3", unread: "1" }));
    assert.deepEqual(groupB.waiting.rows.map((row) => row.uid), ["kofi", "sofia", "rahul", "chloe"]);
    assert.equal(groupB.waiting.allHref, null);
    // Read one question: the chosen group, else the first, on the week the tab is on.
    assert.equal(groupB.questionHref, `${PROGRAMME_PATH}/question?group=${encodeURIComponent(B)}&week=3`);
    assert.equal(tableOf(await tab("zach", { group: "none", week: "1" })).questionHref, `${PROGRAMME_PATH}/question?group=${encodeURIComponent(view.groups[0].id)}&week=1`);
    // Nothing waiting: one quiet sentence.
    const bare = seed();
    delete bare[`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`];
    delete bare[`courseExerciseResponses/${RUN.agi}__rahul__w03__k3-wa`];
    w.reset(bare);
    const none = await tab("claudia");
    assert.deepEqual(tableOf(none).waiting, { rows: [], total: 0, allHref: null });
    assert.match(none.text, /Waiting for feedback, oldest first Opens the reading view at that answer\. Nothing is waiting for feedback\./);
  });

  test("at phone width: one week at a time, its people with their state and flags, and the week before and after", async () => {
    const drawn = await tab("claudia", { group: B });
    const view = tableOf(drawn);
    assert.deepEqual(view.week, { weekNumber: 3, asked: false });
    assert.match(drawn.html, /<section class="card narrow" aria-labelledby="coursework-week"><div class="weekHead"><h2 id="coursework-week" class="phoneWeekTitle">Week 3<\/h2>/);
    assert.match(drawn.html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework\\?group=${B}&amp;week=1" class="step">Previous week: week 1</a>`));
    assert.match(
      drawn.html,
      new RegExp(
        `<a href="${PROGRAMME_PATH}/coursework/chloe\\?week=3" class="personLink" aria-label="Chloe Nguyen, week 3: Started, Not read yet, No feedback yet"><span class="personName">Chloe Nguyen</span>`,
      ),
    );
    // A row's label stands in for what the link holds, so it says the row's mark too: Rahul facilitates Group B.
    assert.match(drawn.html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework/rahul\\?week=3" class="personLink" aria-label="Rahul Mehta, week 3: Facilitator, Started, Not read yet, No feedback yet"><span class="personName">Rahul Mehta</span>`));
    // On week 1, the way on to week 3, and the filters keep the week chosen.
    const one = await tab("claudia", { group: B, week: "1" });
    assert.match(one.html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework\\?group=${B}&amp;week=3" class="step">Next week: week 3</a>`));
    assert.match(one.html, new RegExp(`<a href="${PROGRAMME_PATH}/coursework\\?group=${B}&amp;unread=1&amp;week=1" class="show">Not read yet`));
  });
});

// ---------------------------------------------------------------------------
// 3. Feedback to write
// ---------------------------------------------------------------------------

describe("3. Feedback to write learns Changed since feedback", () => {
  beforeEach(() => {
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__farah__w03__k3-wa`, changedAnswer("farah", ANSWERS.farah, ANSWERS.farahLater));
    w.world.db.seed("courseFeedback/piece-a", piece("farah", { by: "rahul", about: T1, at: new Date("2026-11-17T09:00:00Z") }));
    // Sofia's own answer, which the lead gave feedback on, changed since: a co-facilitator's own work.
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__sofia__w03__k3-wa`, changedAnswer("sofia", "Twenty lamps.", "Twenty lamps, or so."));
    w.world.db.seed("courseFeedback/piece-s", piece("sofia", { by: "claudia", role: "lead", about: T1, at: new Date("2026-11-17T09:00:00Z") }));
  });
  const cardOf = async (who) => find((await w.groupPage(who)).element, "ReviewQueueCard")[0]?.props ?? null;

  test("an answer changed since its feedback is on the card inside seven days of the change, and gone after", async () => {
    w.at(AFTER_THE_SESSION);
    const card = await cardOf("rahul");
    const farah = card.rows.find((row) => row.uid === "farah");
    assert.deepEqual([farah.weekNumber, farah.changed, farah.changedAt], [3, true, T2.toISOString()]);
    // Its row opens the reading view at that answer, where both versions are drawn.
    assert.equal(card.hrefFor(farah), `${GROUP_PATH}/coursework/farah?week=3#reading-answer`);
    assert.equal(card.readHrefFor(farah), `${GROUP_PATH}/coursework/farah?week=3#reading-answer`);
    assert.match((await w.groupPage("rahul")).text, /Farah Hussain Changed since feedback, Wed 18 Nov, 9am Write feedback/);
    // An answer with no feedback keeps its own way, to the review page.
    const chloe = card.rows.find((row) => row.uid === "chloe");
    assert.deepEqual([chloe.changed, chloe.changedAt], [false, null]);
    assert.equal(card.hrefFor(chloe), `${GROUP_PATH}/written?week=3&person=chloe`);
    // Oldest first, a changed answer by when it was changed.
    assert.deepEqual(card.rows.map((row) => row.uid), ["chloe", "farah"]);
    // Seven days from the change, and a moment more: gone.
    w.at(new Date(T2.getTime() + 7 * 24 * 3600 * 1000 + 60_000).toISOString());
    assert.ok(!((await cardOf("rahul"))?.rows ?? []).some((row) => row.uid === "farah"), "a change more than seven days old still waits");
  });

  test("feedback on the new words takes it off the card; a co-facilitator's own answer is never on it", async () => {
    w.at(AFTER_THE_SESSION);
    let card = await cardOf("rahul");
    assert.ok(!card.rows.some((row) => row.uid === "sofia"), "a co-facilitator's own answer is on the card");
    assert.ok(!card.rows.some((row) => row.uid === "rahul"), "a facilitator's own answer is on their card");
    w.world.db.seed("courseFeedback/piece-b", piece("farah", { by: "rahul", about: T2, at: new Date("2026-11-18T09:45:00Z") }));
    card = await cardOf("rahul");
    assert.ok(!card.rows.some((row) => row.uid === "farah"), "an answer with feedback on its current words waits");
  });

  test("Home's line and the lead's line per group count what the card counts", async () => {
    w.at(AFTER_THE_SESSION);
    const card = await cardOf("rahul");
    const home = await w.summary("rahul");
    assert.equal(home.status, 200);
    assert.equal(home.body.writtenToGive, card.rows.length);
    assert.deepEqual(home.body.writtenWeeks, card.rows.map((row) => row.weekNumber));
    assert.deepEqual(home.body.writtenNext, { weekNumber: card.rows[0].weekNumber, uid: card.rows[0].uid });
    // The lead's line for Group B: Chloe's and Farah's, and Sofia's own, which a facilitator never reviews; and Rahul's own.
    const lead = find((await w.attendanceTab("claudia")).element, "LeadWrittenAnswersCard")[0].props.groups.find((group) => group.id === B);
    assert.deepEqual(lead.weeks, [3, 3, 3, 3]);
    const adminCard = await cardOf("zach");
    assert.deepEqual(adminCard.rows.map((row) => [row.uid, row.changed]).sort(), [["chloe", false], ["farah", true], ["rahul", false], ["sofia", true]]);
  });
});

// ---------------------------------------------------------------------------
// 4. The member's side
// ---------------------------------------------------------------------------

describe("4. the member's side: nothing of the tab's flags or list", () => {
  test("Chloe's own routes and week page, with her answer waiting and her week read, name neither", async () => {
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-wa": NOW } });
    const said = JSON.stringify((await w.call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true })).body);
    const week = await w.draw((await w.loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx"))).default, "chloe", { runId: RUN.agi, n: "3" });
    for (const mark of [words.WAITING_TITLE, words.NOT_READ_YET, words.READ_ONE_QUESTION, words.WAITING_LINE, "reading-answer", NOW.toISOString()]) {
      assert.ok(!said.includes(mark), `her overview names ${mark}`);
      assert.ok(!week.html.includes(mark), `her week page names ${mark}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The words the browser spec reads
// ---------------------------------------------------------------------------

describe("5. the words the browser spec reads, as the product says them", () => {
  test("each string tests/e2e/course-hub-coursework.spec.mjs matches on the tab, Feedback to write and the week page is the product's own", async () => {
    const answerWords = await w.loadTs(join("lib", "courses", "writtenAnswerWords.ts"));
    const weekWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));
    assert.deepEqual(
      [words.STARTED, words.NOT_STARTED, words.NOT_READ_YET, words.WAITING_FOR_FEEDBACK, words.CHANGED_SINCE_FEEDBACK, words.WEEK_NOT_DONE, words.EVERYONE],
      ["Started", "Not started", "Not read yet", "No feedback yet", "Changed since feedback", "Week not done", "Everyone"],
    );
    assert.deepEqual(
      [words.READ_ONE_QUESTION, words.WAITING_TITLE, words.READ, words.writtenAnswerOfWeekWords(3), words.NOTHING_WAITING, words.SHOW],
      ["Read one question", "Waiting for feedback, oldest first", "Read", "week 3 written answer", "Nothing is waiting for feedback.", "Show"],
    );
    assert.deepEqual([answerWords.WRITTEN_ANSWER, answerWords.YOUR_ANSWER, weekWords.CHANGE_MY_ANSWER], ["Written answer", "Your answer", "Change my answer"]);
    assert.equal(weekWords.answerChangedSinceWords("Ada"), "Ada’s answer has changed since this feedback was written.");
    assert.equal(words.courseworkSummaryWords(4, 1, 2), "4 holding a place · 1 facilitating · 2 with no feedback yet");
    assert.equal(words.cellLabelWords("Ada", 3, ["Started", "Not read yet", "No feedback yet"]), "Ada, week 3: Started, Not read yet, No feedback yet");
    assert.equal(words.readAnswerLabelWords("Ada", 3), "Read Ada’s week 3 written answer");
    assert.match(words.changedOnWords(new Date("2026-11-18T15:00:00Z")), /^Changed since feedback, /);
    assert.match(words.waitingChangedWords(new Date("2026-11-18T15:00:00Z")), /^Changed since feedback, [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/);
    assert.match(words.waitingSentWords(new Date("2026-11-18T15:00:00Z"), false), /^Sent [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/);
    // The section and filter heads the spec reads by their ids and names.
    const table = readFileSync(join(SRC, "features", "courses", "coursework", "CourseworkTable.tsx"), "utf8");
    assert.match(table, /aria-labelledby="coursework-waiting"/);
    assert.match(table, /<nav aria-label=\{SHOW\}/);
    for (const line of [words.WAITING_TITLE, words.WAITING_LINE, words.NOTHING_WAITING, words.READ_ONE_QUESTION, words.opensWords("2026-11-12"), words.KEY, words.ALL_GROUPS]) {
      assert.doesNotMatch(line, /[–—]/, line);
    }
  });
});
