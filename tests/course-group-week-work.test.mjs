/**
 * WHO HAS DONE THE WEEK, AND REMIND, AS ARITHMETIC AND WORDS: the pure half
 * of a week's card on a group's page and of Remind by hand
 * (`src/lib/courses/groupWeekWork/model.ts` and `words.ts`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE PIECES of a week are asked of exactly the ids done asks about, so a
 *     person whose every piece is done is a person whose week is done.
 *  2. EACH PIECE stands done on time, done late (and how late), done with no
 *     time to tell it by, started or not started, against the session the
 *     person was due at; an answer with words not sent is started and says so.
 *  3. A PERSON'S WEEK reads the very words This week's work says
 *     (`personWeekWords`), its bucket from those words; somebody told their
 *     group after the session is never late, and a started week of theirs
 *     still says "Joined late".
 *  4. ONE COUNT: the bars, the chips and the filters count the same rows.
 *  5. WHO REMIND REACHES: never the presser, a facilitator of the group,
 *     somebody not told, somebody who joined late or has no group, somebody
 *     done, nor anybody once the programme has closed.
 *  6. LAST REMINDED: the latest of the automatic and the hand reminders, and
 *     "in the last day" for the warning.
 *  7. THE WORDS, as the design draws them, and none with a dash, a mark, a
 *     grade or a score.
 *  8. "WEEK N IS OPEN"'s two new lines.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";
import { remindWeek } from "./lib/remindWeek.mjs";

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const model = await loadTs("lib/courses/groupWeekWork/model.ts");
const words = await loadTs("lib/courses/groupWeekWork/words.ts");
const parse = await loadTs("lib/courses/groupWeekWork/parse.ts");
const weekWork = await loadTs("lib/courses/weekWork/model.ts");
const weekWorkWords = await loadTs("lib/courses/weekWork/words.ts");
const progress = await loadTs("lib/courses/weekBlocks/progress.ts");
const emails = await loadTs("lib/courses/weekEmails/model.ts");
const emailWords = await loadTs("lib/courses/weekEmails/words.ts");
const WeekEmail = (await loadTs("emails/WeekEmail.tsx")).default;
const NoticeMarker = (await loadTs("emails/NoticeMarker.tsx")).default;

const SESSION = new Date("2026-11-04T15:00:00Z");
const DUE = { at: SESSION, by: "session" };
const before = (h) => new Date(SESSION.getTime() - h * 3_600_000);
const after = (h) => new Date(SESSION.getTime() + h * 3_600_000);

/** What one person did of `remindWeek("q1")`, as the readers hand it over. */
function factsOf({ ticked = {}, written = {}, saved = {}, sent = {}, words = {}, touched = false } = {}) {
  return {
    state: {
      isTicked: (id) => id in ticked,
      isWritten: (id) => id in written,
      isSent: (id) => id in sent,
      packOf: () => null,
      isReady: () => false,
      answerOf: (id) => ({ words: words[id] ?? (id in sent ? 20 : 0), emptyBoxes: 0 }),
    },
    times: {
      tickedAt: (id) => ticked[id] ?? null,
      writtenAt: (id) => written[id] ?? null,
      sentAt: (id) => sent[id] ?? null,
      packOf: () => null,
    },
    touched: touched || Object.keys({ ...ticked, ...written, ...sent, ...words }).length > 0,
    savedAt: (id) => saved[id] ?? written[id] ?? null,
  };
}

const BLOCKS = remindWeek("q1");
const TASKS = progress.weekTaskNeeds(BLOCKS);
const ASKS = weekWork.weekWritingNeeds(BLOCKS);
const PIECES = model.weekPiecesOf(BLOCKS, TASKS, ASKS);

const stateOf = (facts, { due = DUE, submittedAt = null } = {}) =>
  model.personWeekStateOf({ tasks: TASKS, asks: ASKS, pieces: PIECES, facts, submittedAt, due });

const ALL_DONE = {
  ticked: { "q1-s1": before(30), "q1-s2": before(20) },
  written: { "q1-rp1": before(10) },
  sent: { "q1-wa": before(5) },
};

// ---------------------------------------------------------------------------

describe("1. the pieces of a week", () => {
  test("readings, the reflection and the written answer, each the ids done asks about", () => {
    assert.deepEqual(
      PIECES.map((piece) => [piece.key, piece.ids]),
      [
        ["readings", ["q1-s1", "q1-s2"]],
        ["reflection", ["q1-rp1"]],
        ["written", ["q1-wa"]],
      ],
    );
    const needs = weekWork.weekDoneNeeds(TASKS, ASKS);
    assert.deepEqual(needs.tickIds, ["q1-s1", "q1-s2"]);
    assert.deepEqual(needs.promptIds, ["q1-rp1"]);
    assert.deepEqual(needs.answerIds, ["q1-wa"]);
  });

  test("a step to tick is a piece of its own, never a reading", () => {
    const blocks = remindWeek("q2", { checklist: true });
    const pieces = model.weekPiecesOf(blocks, progress.weekTaskNeeds(blocks), weekWork.weekWritingNeeds(blocks));
    assert.deepEqual(
      pieces.map((piece) => [piece.key, piece.ids]),
      [
        ["readings", ["q2-s1", "q2-s2"]],
        ["steps", ["q2-c1"]],
        ["reflection", ["q2-rp1"]],
        ["written", ["q2-wa"]],
      ],
    );
  });

  test("every piece done is the week done, by the one meaning, and a week not done has a piece not done", () => {
    const cases = [
      ALL_DONE,
      { ...ALL_DONE, sent: {} },
      { ...ALL_DONE, written: {} },
      { ...ALL_DONE, ticked: { "q1-s1": before(30) } },
      {},
    ];
    for (const facts of cases) {
      const person = stateOf(factsOf(facts));
      const allPieces = person.pieces.every((piece) => model.isDoneBucket(piece.bucket));
      const done = weekWork.weekDone({ tasks: TASKS, state: factsOf(facts).state, submitted: false, asks: ASKS });
      assert.equal(allPieces, done, JSON.stringify(facts));
      assert.equal(model.isDoneBucket(person.bucket), done);
    }
  });
});

describe("2. each piece of one person's week", () => {
  test("not started, started, done on time", () => {
    const none = stateOf(factsOf());
    assert.deepEqual(none.pieces.map((piece) => piece.bucket), ["not-started", "not-started", "not-started"]);
    const some = stateOf(factsOf({ ticked: { "q1-s1": before(2) }, words: { "q1-wa": 12 } }));
    assert.deepEqual(some.pieces.map((piece) => [piece.key, piece.bucket, piece.done, piece.of]), [
      ["readings", "started", 1, 2],
      ["reflection", "not-started", 0, 1],
      ["written", "started", 0, 1],
    ]);
    assert.equal(some.pieces[2].unsent, true, "words in it, not sent");
    const done = stateOf(factsOf(ALL_DONE));
    assert.deepEqual(done.pieces.map((piece) => piece.bucket), ["done-on-time", "done-on-time", "done-on-time"]);
    assert.equal(done.pieces[0].doneAt.toISOString(), before(20).toISOString(), "the latest of its ticks");
  });

  test("done after the session is done late, with how late; a piece with no time to tell it by is just done", () => {
    const late = stateOf(factsOf({ ...ALL_DONE, sent: { "q1-wa": after(72) } }));
    const answer = late.pieces.find((piece) => piece.key === "written");
    assert.equal(answer.bucket, "done-late");
    assert.equal(answer.lateMs, 72 * 3_600_000);
    assert.equal(late.bucket, "done-late");
    assert.equal(late.lateMs, 72 * 3_600_000);
    assert.equal(late.text, "Done late");
    assert.equal(late.detail, "Late: 3 days after the session");
    const untimed = stateOf(factsOf({ ...ALL_DONE, ticked: { "q1-s1": null, "q1-s2": before(1) } }));
    assert.equal(untimed.pieces[0].bucket, "done");
  });
});

describe("3. one person's week says what This week's work says", () => {
  test("the bucket comes from the words, so the two never disagree", () => {
    for (const facts of [{}, { ticked: { "q1-s1": before(3) } }, ALL_DONE, { ...ALL_DONE, sent: { "q1-wa": after(1) } }]) {
      const person = stateOf(factsOf(facts));
      const line = { progress: person.progress, doneAt: person.progress.doneAt, due: DUE };
      assert.equal(person.text, weekWorkWords.personWeekWords(line).text);
    }
  });

  test("before the session nothing is late; with no session to be due at, done is just done", () => {
    const early = stateOf(factsOf(ALL_DONE));
    assert.equal(early.text, "Done on time");
    const noGroup = stateOf(factsOf(ALL_DONE), { due: { at: null, by: "no-group" } });
    assert.deepEqual([noGroup.text, noGroup.bucket, noGroup.lateMs], ["Done", "done", null]);
  });

  test("somebody told their group after the session: never late, and the row says Joined late whatever they started", () => {
    const joined = { at: null, by: "joined-late" };
    assert.deepEqual([stateOf(factsOf(), { due: joined }).text, stateOf(factsOf(), { due: joined }).bucket], ["Joined late", "joined-late"]);
    const started = stateOf(factsOf({ ticked: { "q1-s1": after(100) } }), { due: joined });
    assert.equal(started.bucket, "started");
    assert.equal(started.detail, "Joined late");
    const done = stateOf(factsOf({ ...ALL_DONE, sent: { "q1-wa": after(100) } }), { due: joined });
    assert.deepEqual([done.bucket, done.lateMs, done.detail], ["done", null, "Joined late"]);
  });

  test("the old Submit pressed makes the week done whatever its pieces say", () => {
    const pressed = stateOf(factsOf({ ticked: ALL_DONE.ticked }), { submittedAt: before(1) });
    assert.equal(model.isDoneBucket(pressed.bucket), true);
    assert.equal(pressed.pieces.find((piece) => piece.key === "written").bucket, "not-started");
  });
});

describe("4. one count", () => {
  test("bars, chips and filters count the same rows", () => {
    const rows = [
      { week: { bucket: "done-on-time" }, pieces: [{ key: "reflection", bucket: "done-on-time" }] },
      { week: { bucket: "done-late" }, pieces: [{ key: "reflection", bucket: "done-late" }] },
      { week: { bucket: "started" }, pieces: [{ key: "reflection", bucket: "not-started" }] },
      { week: { bucket: "not-started" }, pieces: [{ key: "reflection", bucket: "started" }] },
    ];
    const counts = model.countBuckets(rows.map((row) => row.week.bucket));
    assert.equal(model.doneCount(counts), 2);
    assert.equal(model.filterRows(rows, "everyone").length, 4);
    assert.equal(model.filterRows(rows, "week").length, 2);
    assert.equal(model.filterRows(rows, "reflection").length, 2);
    assert.equal(model.filterRows(rows, "late").length, 1);
    assert.equal(model.filterRows(rows, "written").length, 0, "a piece the week does not have filters nobody in");
  });
});

describe("5. who Remind reaches", () => {
  const base = { uid: "amara", presserUid: "rahul", facilitatorUids: ["rahul", "sofia"], told: true, weekDone: false, due: DUE, closed: false };
  test("somebody whose week isn't done is reminded", () => {
    assert.equal(model.notRemindedBecause(base), null);
  });
  test("never the presser, a facilitator of the group (a co-facilitator too), somebody not told, joined late, with no group, or done", () => {
    assert.equal(model.notRemindedBecause({ ...base, uid: "rahul" }), "presser");
    assert.equal(model.notRemindedBecause({ ...base, uid: "sofia" }), "facilitator");
    assert.equal(model.notRemindedBecause({ ...base, told: false }), "not-told");
    assert.equal(model.notRemindedBecause({ ...base, due: { at: null, by: "joined-late" } }), "joined-late");
    assert.equal(model.notRemindedBecause({ ...base, due: { at: null, by: "no-group" } }), "no-group");
    assert.equal(model.notRemindedBecause({ ...base, weekDone: true }), "done");
  });
  test("nobody once the programme has closed", () => {
    assert.equal(model.notRemindedBecause({ ...base, closed: true }), "closed");
  });
});

describe("6. last reminded", () => {
  test("the latest of the automatic and the hand reminders", () => {
    const auto = { at: "2026-11-03T09:00:00.000Z", how: "1-day", byName: null };
    const hand = { at: "2026-11-09T10:02:00.000Z", how: "hand", byName: "Rahul" };
    assert.deepEqual(model.latestReminder([auto, null, hand]), hand);
    assert.equal(model.latestReminder([]), null);
  });
  test("in the last day warns; a day and a minute ago does not", () => {
    const now = new Date("2026-11-10T10:00:00Z");
    assert.equal(model.remindedRecently({ at: "2026-11-09T10:01:00Z", how: "hand", byName: null }, now), true);
    assert.equal(model.remindedRecently({ at: "2026-11-09T09:59:00Z", how: "hand", byName: null }, now), false);
    assert.equal(model.remindedRecently(null, now), false);
  });
});

// ---------------------------------------------------------------------------

describe("7. the words", () => {
  test("the card", () => {
    assert.equal(words.haveDoneTitle(4, 6, 1), "4 of 6 have done week 1");
    assert.equal(words.haveDoneTitle(1, 1, 2), "1 of 1 has done week 2");
    assert.equal(words.doneMeansWords(PIECES), "Done means every reading ticked, the reflection written and the written answer sent.");
    assert.equal(words.remindAllWords(4), "Remind 4 people whose week isn’t done");
    assert.equal(words.remindOneWords("Daniel"), "Remind Daniel");
    assert.equal(words.filterLabel("reflection"), "Reflection not done");
    assert.equal(words.lateInWeekTitle(1), "Late in week 1");
  });

  test("each cell", () => {
    const cells = (facts) => stateOf(factsOf(facts)).pieces.map(words.pieceCellWords);
    assert.deepEqual(cells({}), ["0 of 2", "Not started", "Not started"]);
    assert.deepEqual(cells({ ticked: { "q1-s1": before(2) }, words: { "q1-wa": 9 } }), ["1 of 2", "Not started", "Started, not sent"]);
    // Tue 3 Nov, 3pm and 8:12pm in London.
    assert.deepEqual(
      cells({ ...ALL_DONE, written: { "q1-rp1": new Date("2026-11-03T15:00:00Z") }, sent: { "q1-wa": new Date("2026-11-03T20:12:00Z") } }),
      ["2 of 2", "Written Tue 3 Nov", "Sent Tue 3 Nov, 8:12pm"],
    );
  });

  test("late in week 1", () => {
    assert.equal(
      words.lateLineWords([{ key: "reflection", title: "" }, { key: "written", title: "" }], new Date("2026-11-07T18:20:00Z")),
      "Reflection and written answer done Sat 7 Nov, 6:20pm",
    );
    assert.equal(words.lateLineWords([{ key: "written", title: "" }], new Date("2026-11-07T18:20:00Z")), "Written answer sent Sat 7 Nov, 6:20pm");
    assert.equal(words.lateLineWords([{ key: "readings", title: "" }], new Date("2026-11-07T18:20:00Z")), "Readings ticked Sat 7 Nov, 6:20pm");
    assert.equal(
      words.ownWeekLine({ firstName: "Rahul", weekNumber: 1, text: "Done late", leadFirstName: "Claudia" }),
      "Rahul’s own week 1: done late. Claudia and admins only.",
    );
  });

  test("last reminded, in the table and in the panel", () => {
    const auto = { at: "2026-11-03T15:00:00.000Z", how: "1-day", byName: null };
    const hand = { at: "2026-11-09T10:02:00.000Z", how: "hand", byName: "Rahul" };
    assert.equal(words.lastRemindedCell(auto), "Tue 3 Nov, 3pm · 1-day, automatic");
    assert.equal(words.lastRemindedCell(hand), "Mon 9 Nov, 10:02am · by Rahul");
    assert.equal(words.lastRemindedLine(auto), "Last reminded Tue 3 Nov, 3pm: the 1-day reminder, automatic");
    assert.equal(words.lastRemindedLine(null), "Not reminded yet");
  });

  test("the panel", () => {
    assert.equal(words.remindPanelTitle({ count: 2, weekNumber: 1, onlyName: null }), "Remind 2 people whose week 1 isn’t done");
    assert.equal(words.remindPanelTitle({ count: 1, weekNumber: 1, onlyName: "Daniel" }), "Remind Daniel");
    assert.equal(words.remindLede({ weekNumber: 1, onlyName: null }), "Their week 1 isn’t done. Nobody else is emailed.");
    assert.equal(words.remindLede({ weekNumber: 1, onlyName: "Daniel" }), "Daniel’s week 1 isn’t done. Nobody else is emailed.");
    assert.equal(words.sendToWords(2), "Send to 2 people");
    assert.equal(words.sendToWords(1), "Send to 1 person");
    assert.equal(words.recentWarningWords(["Daniel"]), "Daniel was reminded in the last day. Sending now emails them again.");
    assert.equal(words.noticeFromWords(words.fromLineWords("Rahul", "AGI Strategy")), "Notice, from Rahul and the AGI Strategy team");
    assert.equal(words.remindCountChangedWords(3), "That changed while the panel was open: it would now email 3 people. Check the list and send again.");
    assert.equal(
      words.remindSentWords({ sent: 2, justReminded: 1, suppressed: 0, held: 0, failed: 0 }),
      "Emailed 2 people. 1 person was reminded a moment ago, so not emailed again.",
    );
  });

  test("still to do, from what the automatic reminders list", () => {
    const left = (facts) => emails.weekLeft({ blocks: BLOCKS, tasks: TASKS, state: factsOf(facts).state });
    assert.deepEqual(words.stillToDoItems(left({})), ["two readings", "your reflection", "your written answer"]);
    assert.deepEqual(words.stillToDoItems(left({ ticked: ALL_DONE.ticked, words: { "q1-wa": 12 } })), ["your reflection", "sending your written answer"]);
    assert.deepEqual(words.stillToDoItems(left({ ticked: { "q1-s1": before(1) }, written: ALL_DONE.written, words: { "q1-wa": 50 } })), [
      "one reading",
      "cutting your written answer to 40 words",
    ]);
  });

  test("the email, before the session and after it, as drawn", async () => {
    const facts = {
      weekNumber: 2,
      groupName: "Group C",
      presserFirstName: "Rahul",
      team: "AGI Strategy",
      form: "before",
      sessionAt: new Date("2026-11-11T15:00:00Z"),
      cancelled: false,
      stillToDo: ["one reading", "your written answer"],
      weekUrl: "https://naisi.invalid/learn/run/weeks/2",
    };
    const beforeEmail = words.handReminderEmailWords(facts, "Daniel");
    assert.equal(beforeEmail.subject, "Week 2 isn’t done yet");
    assert.equal(beforeEmail.greeting, "Hi Daniel,");
    assert.deepEqual(beforeEmail.paragraphs, [
      "Rahul asked us to remind you: your session is Wed 11 Nov, 3pm. Still to do: one reading and your written answer.",
    ]);
    assert.equal(beforeEmail.button, "Finish week 2");
    assert.deepEqual(beforeEmail.after, ["Rahul and the AGI Strategy team"]);

    const afterEmail = words.handReminderEmailWords(
      { ...facts, weekNumber: 1, form: "after", sessionAt: new Date("2026-11-04T15:00:00Z"), stillToDo: ["your reflection", "your written answer"] },
      "Daniel",
    );
    assert.equal(afterEmail.subject, "Week 1 isn’t done yet");
    assert.deepEqual(afterEmail.paragraphs, [
      "Group C met for week 1 on Wed 4 Nov, and week 1 is still open. Still to do: your reflection and your written answer.",
      "Anything you add now shows as late, with how late, to the people who read your work.",
    ]);

    const cancelled = words.handReminderEmailWords({ ...facts, form: "after", cancelled: true, sessionAt: new Date("2026-11-04T15:00:00Z") }, "");
    assert.match(cancelled.paragraphs[0], /^Group C’s week 2 session, Wed 4 Nov, 3pm, was cancelled, and week 2 is still open\./);
    assert.equal(cancelled.greeting, "");
    const undated = words.handReminderEmailWords({ ...facts, sessionAt: null, presserFirstName: "" }, "Daniel");
    assert.equal(undated.paragraphs[0], "The people running your group asked us to remind you about week 2. Still to do: one reading and your written answer.");

    const text = (await render(WeekEmail({ words: afterEmail, notice: NoticeMarker({ surface: "course-week-reminder" }) }), { plainText: true })).replace(/\s+/g, " ");
    assert.match(text, /our records show this week’s work isn’t finished/);
    assert.match(text, /Hi Daniel, .*Group C met for week 1 on Wed 4 Nov/);
    assert.doesNotMatch(text, /unsubscribe/i);
  });

  test("no word of the card, the panel or the email has a dash, a mark, a grade or a score", () => {
    const said = [
      ...Object.values(words.BUCKET_LABEL),
      ...["readings", "steps", "reflection", "boxes", "written"].map((key) => words.pieceLabel(key)),
      words.automaticRemindersWords({ kind: "off" }),
      words.automaticRemindersWords({ kind: "stopped" }),
      words.automaticRemindersWords({ kind: "undated" }),
      words.automaticRemindersWords({ kind: "on", threeDay: { at: "2026-11-08T09:00:00Z", went: 5 }, oneDay: { at: "2026-11-10T09:00:00Z", went: 0 } }),
      ...Object.values(words.REMIND_REFUSAL),
      words.OWN_WORK_APART,
      words.OWN_WORK_TITLE,
      words.ADDED_NOW_SHOWS_LATE,
      words.nobodyToRemindWords(1),
      words.remindCountChangedWords(0),
      emailWords.WEEK_OPEN_ROOM_TO_BE_CONFIRMED,
      emailWords.earlierNotDoneWords([1, 2]),
    ];
    for (const line of said) {
      assert.doesNotMatch(line, /[\u2013\u2014]/, line);
      assert.doesNotMatch(line, /\b(mark|marks|grade|graded|score|scored)\b/i, line);
    }
    assert.equal(
      words.automaticRemindersWords({ kind: "on", threeDay: { at: "2026-11-08T09:00:00Z", went: 5 }, oneDay: { at: "2026-11-10T09:00:00Z", went: 0 } }),
      "Automatic reminders: the 3-day reminder went on Sun 8 Nov, 9am to 5 people, and the 1-day reminder goes on Tue 10 Nov, 9am to anybody not done.",
    );
  });
});

describe("the press's body, before anything is read", () => {
  test("a week, one person or everybody, a preview or a press with its count", () => {
    assert.deepEqual(parse.parseRemindPress({ week: 1, preview: true }), { ok: true, value: { weekNumber: 1, onlyUid: null, preview: true, count: null } });
    assert.deepEqual(parse.parseRemindPress({ week: 2, uid: "amara", count: 1 }), { ok: true, value: { weekNumber: 2, onlyUid: "amara", preview: false, count: 1 } });
    for (const bad of [null, [], {}, { week: 0 }, { week: 1.5 }, { week: "1" }, { week: 1, uid: "a/b", preview: true }, { week: 1 }, { week: 1, count: -1 }]) {
      assert.equal(parse.parseRemindPress(bad).ok, false, JSON.stringify(bad));
    }
  });
});

describe("8. Week N is open's two new lines", () => {
  const OPEN = {
    courseTitle: "AGI Strategy",
    weekNumber: 3,
    weekTitle: "Power and incentives",
    sessionAt: new Date("2026-11-17T17:30:00Z"),
    where: "",
    first: false,
    cancelled: false,
    change: "",
    asks: [{ kind: "readings", count: 2 }],
    weekUrl: "https://naisi.invalid/learn/run/weeks/3",
    feedbackUrl: "",
    staysOpen: true,
  };

  test("a room not booked yet: the line, and nothing held for it", () => {
    const email = emailWords.weekOpenEmailWords({ ...OPEN, roomToBeConfirmed: true }, "Priya");
    assert.deepEqual(email.paragraphs, [
      "Week 3 of AGI Strategy is open: Power and incentives. Your next session is Tue 17 Nov at 5:30pm.",
      "Room to be confirmed: we’ll email you as soon as it’s booked, and it’ll be on your programme page.",
    ]);
    assert.deepEqual(emailWords.missingWeekOpenValues({ ...OPEN, roomToBeConfirmed: true }), [], "a room not booked yet holds nothing");
    assert.equal(emailWords.weekOpenEmailWords({ ...OPEN, where: "Online" }, "").paragraphs.length, 1, "an online session needs no room");
    assert.equal(emailWords.weekOpenEmailWords({ ...OPEN, roomToBeConfirmed: true, cancelled: true }, "").paragraphs.some((line) => line.startsWith("Room to be")), false);
  });

  test("an earlier week not done: one line, and the plural for several", () => {
    assert.equal(emailWords.earlierNotDoneWords([1]), "Week 1 isn’t done yet either: it’s still open on your programme page.");
    assert.equal(emailWords.earlierNotDoneWords([2, 1]), "Weeks 1 and 2 aren’t done yet either: they’re still open on your programme page.");
    assert.equal(emailWords.earlierNotDoneWords([]), "");
    const email = emailWords.weekOpenEmailWords({ ...OPEN, where: "Portland A21" }, "Priya", { earlierNotDone: [1] });
    assert.equal(email.paragraphs.at(-1), "Week 1 isn’t done yet either: it’s still open on your programme page.");
    assert.equal(emailWords.weekOpenEmailWords({ ...OPEN, where: "Portland A21" }, "Priya").paragraphs.length, 1, "nothing for nobody's earlier weeks");
  });
});
