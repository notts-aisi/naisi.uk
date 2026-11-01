/**
 * THE WEEK'S EMAILS: "Week N is open" 6 days before each of a group's
 * sessions, to everybody holding a place in it, and the reminders 3 days and
 * 1 day before, to the people whose week is not done. All three at 9am in
 * London, all three notices, every word fixed in one file.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## Why this file exists
 *
 * It replaces the suite of the weekly nudge, which these emails replaced: an
 * admin-edited template, its renderer, and a run-wide catch-up send keyed on a
 * marker of its own. Each property that suite held is held here of what took
 * its place:
 *
 *  1. WHEN. 9am in London on the civil date 6, 3 or 1 days before the
 *     session, either side of the clocks going back; never for a session that
 *     cannot be dated; the group's first session included.
 *  2. THE WORDS, run: the email as drawn for a week with three readings, a
 *     reflection and a written answer; each of its facts missing in turn; a
 *     cancelled evening and a session covering two weeks; a reminder at 3 days,
 *     at 1 day and about two weeks. Then EVERY combination of the facts that
 *     can be missing, rendered, with no brace, no "undefined", no gap, no
 *     dangling "in", no dead link, a one-line subject, no mark, grade or score,
 *     and no dash.
 *  3. WHAT IS TYPED STAYS TEXT. A week's title, a room and a reason are
 *     typed by people; rendered, they are text, never markup, and a line break
 *     never reaches a subject.
 *  4. WHAT A WEEK ASKS FOR, and WHAT IS LEFT, in the scope the check before
 *     Submit reads.
 *  5. WHOLE OR NOT AT ALL on the schedule: which facts hold the email.
 *  6. THE PIECES THAT OUTLIVED THE NUDGE: the group's claim, where a session
 *     is (never its video link) and the week's page.
 *  7. THE SEND, read from the source: one claim, taken before the first
 *     message and never for an audience nobody can be sent; a resend recorded
 *     on it; the notice audience and the notice door, with no unsubscribe;
 *     two senders of the template and nobody else.
 *  8. THE NUDGE IS GONE, and so is its template, its editor's tokens and its
 *     page, so nothing is left that could send it.
 *
 * The send itself, against a store, is `tests/course-register-ends.test.mjs`
 * ("Week N is open") and `tests/course-week-reminders.test.mjs` (the
 * reminders).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const codeOf = (path) => stripSource(readFileSync(join(REPO_ROOT, path), "utf8"), { keepStrings: true });

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const model = await loadTs("lib/courses/weekEmails/model.ts");
const words = await loadTs("lib/courses/weekEmails/words.ts");
const chase = await loadTs("lib/courses/registerChase.ts");
const parts = await loadTs("lib/email/courseNudgeEmail.ts");
const progress = await loadTs("lib/courses/weekBlocks/progress.ts");
const WeekEmail = (await loadTs("emails/WeekEmail.tsx")).default;
const NoticeMarker = (await loadTs("emails/NoticeMarker.tsx")).default;
const courseEmails = await loadTs("lib/firestore/courseEmails.ts");

/** An email as its reader sees it. */
async function textOf(element) {
  return (await render(element, { plainText: true })).replace(/\s+/g, " ").trim();
}

/** One session as `resolveSessions` gives it, at `time` London on `dateKey`. */
function session(n, dateKey, { time = "18:00", cancelled = false } = {}) {
  return {
    weekNumber: n,
    weekId: `w0${n}`,
    occurrence: 1,
    sessionKey: `w0${n}`,
    slotStartKey: dateKey,
    dateKey,
    session: { weekday: 3, startTimeLocal: time, durationMinutes: 90, location: "Portland A21", meetingUrl: null, notes: "" },
    cancelled,
  };
}

// ===========================================================================
// 1. When
// ===========================================================================

describe("1. when the week's emails go", () => {
  test("9am in London on the civil date 6, 3 and 1 days before, either side of the clocks going back", () => {
    // Wed 18 Nov 2026 is GMT: Thu 12 Nov, Sun 15 Nov and Tue 17 Nov at 9am.
    assert.equal(model.weekEmailSendAt("2026-11-18", 6).toISOString(), "2026-11-12T09:00:00.000Z");
    assert.equal(model.weekEmailSendAt("2026-11-18", 3).toISOString(), "2026-11-15T09:00:00.000Z");
    assert.equal(model.weekEmailSendAt("2026-11-18", 1).toISOString(), "2026-11-17T09:00:00.000Z");
    // Wed 28 Oct is GMT, and six days before it, Thu 22 Oct, is still BST: 8am UTC.
    assert.equal(model.weekEmailSendAt("2026-10-28", 6).toISOString(), "2026-10-22T08:00:00.000Z");
    // The clocks go back on Sun 25 Oct: 9am that day is GMT.
    assert.equal(model.weekEmailSendAt("2026-10-28", 3).toISOString(), "2026-10-25T09:00:00.000Z");
    assert.equal(model.weekEmailSendAt("2026-10-26", 1).toISOString(), "2026-10-25T09:00:00.000Z");
  });

  test("the three are set in one place: 6 days, then 3 and 1, at 9am", () => {
    assert.equal(model.WEEK_OPEN_DAYS_BEFORE, 6);
    assert.deepEqual([...model.WEEK_REMINDER_DAYS], [3, 1]);
    assert.equal(model.WEEK_EMAIL_CLOCK, "09:00");
  });

  test("never for a session that cannot be dated", () => {
    assert.equal(model.weekEmailSendAt("", 6), null);
    assert.equal(model.weekEmailSendAt("2026-13-40", 6), null);
    assert.equal(model.weekEmailSendAt("2026-11-18", -1), null);
    assert.equal(chase.nextWeekEmailSendAt({ dateKey: "2026-11-18", session: { startTimeLocal: "" } }), null);
    const undated = [{ ...session(1, ""), dateKey: "" }];
    assert.deepEqual(chase.nextWeekEmailTiming(undated, 0, new Date("2026-11-12T09:00:00Z")), { state: "undated" });
  });

  test("Week N is open is due from 9am six days before until the session starts, the group's first session included", () => {
    const sessions = [session(1, "2026-11-18", { time: "15:00" }), session(2, "2026-11-25", { time: "15:00" })];
    const sendAt = new Date("2026-11-12T09:00:00Z");
    const startsAt = new Date("2026-11-18T15:00:00Z");
    assert.equal(chase.nextWeekEmailTiming(sessions, 0, new Date(sendAt.getTime() - 1)).state, "waiting");
    assert.deepEqual(chase.nextWeekEmailTiming(sessions, 0, sendAt), { state: "due", sendAt, startsAt });
    assert.equal(chase.nextWeekEmailTiming(sessions, 0, new Date(startsAt.getTime() - 1)).state, "due");
    assert.equal(chase.nextWeekEmailTiming(sessions, 0, startsAt).state, "past");
    // No state says "first session" any more: week 1 is timed like every other.
    assert.equal(chase.nextWeekEmailTiming(sessions, 1, new Date("2026-11-19T09:00:00Z")).state, "due");
  });
});

// ===========================================================================
// 2. The words
// ===========================================================================

/** "Week 3 is open", for Priya, as the email is drawn. */
const OPEN = {
  courseTitle: "AGI Strategy",
  weekNumber: 3,
  weekTitle: "Power and incentives",
  sessionAt: new Date("2026-11-18T15:00:00Z"),
  where: "Portland A21",
  first: false,
  cancelled: false,
  change: "",
  asks: [
    { kind: "readings", count: 3 },
    { kind: "reflections", count: 1 },
    { kind: "answers", count: 1 },
  ],
  weekUrl: "https://naisi.uk/learn/agi-strategy-autumn-2026/weeks/3",
  feedbackUrl: "",
  locks: true,
};

describe("2. Week N is open, word for word", () => {
  test("the email as drawn: subject, greeting, the week and the session, what it asks for, the button and the lock", async () => {
    const email = words.weekOpenEmailWords(OPEN, "Priya");
    assert.equal(email.subject, "Week 3 is open: Power and incentives");
    assert.equal(email.greeting, "Hi Priya,");
    assert.deepEqual(email.paragraphs, [
      "Week 3 of AGI Strategy is open: Power and incentives. Your next session is Wed 18 Nov at 3pm in Portland A21.",
    ]);
    assert.deepEqual(email.lists, [{ lead: "", items: ["3 readings", "A short reflection", "A written answer"] }]);
    assert.equal(email.button, "Open week 3");
    assert.equal(email.link, OPEN.weekUrl);
    assert.deepEqual(email.after, ["Your work saves as you go and locks when your session starts."]);
    assert.equal(email.feedback, null, "no weekly form is set");
    assert.equal(email.preheader, email.paragraphs[0]);

    const text = await textOf(WeekEmail({ words: email, notice: NoticeMarker({ surface: "course-week" }) }));
    assert.match(text, /Sent as an important notice You are getting this because you are in this course group, so it reaches you whatever your notification settings say, and it is never marketing\./);
    assert.match(text, /Hi Priya, .*Week 3 of AGI Strategy is open: Power and incentives\. Your next session is Wed 18 Nov at 3pm in Portland A21\. .*3 readings .*A short reflection .*A written answer .*Open week 3 .*Your work saves as you go and locks when your session starts\./);
    assert.doesNotMatch(text, /unsubscribe/i, "a notice offers no unsubscribe");
  });

  test("the first session, an online one, one with no room, and a weekly form from the second session on", () => {
    const first = words.weekOpenEmailWords({ ...OPEN, weekNumber: 1, first: true, feedbackUrl: "https://forms.example/weekly" }, "Priya");
    assert.match(first.paragraphs[0], /Your first session is Wed 18 Nov at 3pm in Portland A21\.$/);
    assert.equal(first.feedback, null, "nobody is asked about a session before the first");
    const later = words.weekOpenEmailWords({ ...OPEN, feedbackUrl: "https://forms.example/weekly" }, "Priya");
    assert.deepEqual(later.feedback, { words: "Tell us how the last session went", url: "https://forms.example/weekly" });
    assert.match(words.weekOpenEmailWords({ ...OPEN, where: "Online" }, "").paragraphs[0], /Your next session is Wed 18 Nov at 3pm, online\.$/);
    assert.match(words.weekOpenEmailWords({ ...OPEN, where: "" }, "").paragraphs[0], /Your next session is Wed 18 Nov at 3pm\.$/);
  });

  test("a week with no title, a person with no name, and a group with no time say less, never something broken", () => {
    const bare = words.weekOpenEmailWords({ ...OPEN, weekTitle: "", sessionAt: null }, "");
    assert.equal(bare.subject, "Week 3 is open");
    assert.equal(bare.greeting, "", "no name, no greeting: never Hi NAISI");
    assert.deepEqual(bare.paragraphs, ["Week 3 of AGI Strategy is open."]);
  });

  test("a cancelled evening says it is off, why and when they meet next, in place of the session", () => {
    const change = "Wed 18 Nov is cancelled. Rahul and Sofia are both away. Do week 3’s reading anyway. On Wed 25 Nov you’ll talk about weeks 3 and 4 together.";
    const off = words.weekOpenEmailWords({ ...OPEN, cancelled: true, change }, "Priya");
    assert.deepEqual(off.paragraphs, ["Week 3 of AGI Strategy is open: Power and incentives.", change]);
    assert.deepEqual(off.after, ["Your work saves as you go and locks when your next session starts."]);
    // The session after it covers both weeks, and says so beside the session.
    const covers = words.weekOpenEmailWords({ ...OPEN, weekNumber: 4, change: "On Wed 25 Nov you’ll talk about weeks 3 and 4 together." }, "");
    assert.equal(covers.paragraphs.length, 2);
    assert.match(covers.paragraphs[0], /Your next session is Wed 18 Nov at 3pm in Portland A21\.$/);
  });

  test("a week written before blocks: what it asks for in its own words, and no lock it does not have", () => {
    const legacy = words.weekOpenEmailWords(
      { ...OPEN, locks: false, asks: model.legacyWeekAsks({ materials: [{}, {}, { optional: true }], exercises: [{ required: true }, {}] }) },
      "",
    );
    assert.deepEqual(legacy.lists[0].items, ["2 things to read or watch", "An exercise to write up"]);
    assert.deepEqual(legacy.after, []);
  });

  test("every kind of thing a week can ask for has its line", () => {
    const lines = [
      { kind: "readings", count: 1 },
      { kind: "readings", count: 4 },
      { kind: "steps", count: 1 },
      { kind: "steps", count: 2 },
      { kind: "pack", name: "pathway" },
      { kind: "reflections", count: 2 },
      { kind: "boxes", title: "My action plan" },
      { kind: "answers", count: 2 },
      { kind: "talks", count: 1 },
      { kind: "materials", count: 1 },
      { kind: "exercises", count: 3 },
    ].map(words.weekAskWords);
    assert.deepEqual(lines, [
      "A reading",
      "4 readings",
      "A step to tick",
      "2 steps to tick",
      "Your pathway’s reading",
      "2 short reflections",
      "Your action plan",
      "2 written answers",
      "Getting ready for your talk",
      "Something to read or watch",
      "3 exercises to write up",
    ]);
  });
});

describe("2. the reminders, word for word", () => {
  const SESSION = new Date("2026-11-18T15:00:00Z");
  const reading = { kind: "readings", titles: ["Compute as a lever for governance"] };

  test("the day before, as drawn: what is left, the button, and what stops them", async () => {
    const email = words.weekReminderEmailWords(
      {
        courseTitle: "AGI Strategy",
        daysBefore: 1,
        sessionAt: SESSION,
        where: "Portland A21",
        weeks: [{ weekNumber: 3, left: { items: [reading], notSubmitted: true }, writes: true }],
        weekUrl: "https://naisi.uk/learn/agi/weeks/3",
      },
      "Priya",
    );
    assert.equal(email.subject, "Week 3: your session is tomorrow");
    assert.deepEqual(email.paragraphs, ["Your AGI Strategy session is tomorrow, Wed 18 Nov at 3pm in Portland A21."]);
    assert.deepEqual(email.lists, [
      {
        lead: "Week 3 isn’t finished yet:",
        items: ["One reading isn’t ticked: “Compute as a lever for governance”.", "Week 3 isn’t submitted."],
      },
    ]);
    assert.equal(email.button, "Finish week 3");
    assert.deepEqual(email.after, [
      "Submitting it, with every reading ticked, stops these reminders. Your work locks when the session starts.",
    ]);
    const text = await textOf(WeekEmail({ words: email, notice: NoticeMarker({ surface: "course-week-reminder" }) }));
    assert.match(text, /You are getting this because our records show this week’s work isn’t finished, so it reaches you whatever your notification settings say/);
    assert.match(text, /Week 3 isn’t finished yet: .*One reading isn’t ticked: “Compute as a lever for governance”\. .*Week 3 isn’t submitted\. .*Finish week 3/);
    assert.doesNotMatch(text, /unsubscribe/i);
  });

  test("three days before names the day; a session covering two weeks lists each; a week with nothing to write says what stops them", () => {
    const three = words.weekReminderEmailWords(
      {
        courseTitle: "AGI Strategy",
        daysBefore: 3,
        sessionAt: SESSION,
        where: "",
        weeks: [
          { weekNumber: 3, left: { items: [], notSubmitted: true }, writes: true },
          { weekNumber: 4, left: { items: [{ kind: "reflection", partNumber: 2, empty: true }], notSubmitted: true }, writes: true },
        ],
        weekUrl: "https://naisi.uk/learn/agi/weeks/3",
      },
      "",
    );
    assert.equal(three.subject, "Weeks 3 and 4: your session is on Wed 18 Nov");
    assert.equal(three.greeting, "");
    assert.deepEqual(three.paragraphs, ["Your AGI Strategy session is on Wed 18 Nov at 3pm."]);
    assert.deepEqual(three.lists.map((list) => list.lead), ["Week 3 isn’t finished yet:", "Week 4 isn’t finished yet:"]);
    assert.deepEqual(three.lists[1].items, ["Your part 2 reflection is empty.", "Week 4 isn’t submitted."]);
    assert.equal(three.button, "Finish week 3");
    assert.match(three.after[0], /^Submitting each week, with every reading ticked, stops these reminders\./);

    const ticks = words.weekReminderEmailWords(
      {
        courseTitle: "AGI Strategy",
        daysBefore: 1,
        sessionAt: SESSION,
        where: "Online",
        weeks: [{ weekNumber: 5, left: { items: [{ kind: "steps", count: 2 }], notSubmitted: false }, writes: false }],
        weekUrl: "",
      },
      "Priya",
    );
    assert.deepEqual(ticks.paragraphs, ["Your AGI Strategy session is tomorrow, Wed 18 Nov at 3pm, online."]);
    assert.deepEqual(ticks.lists[0].items, ["Two steps aren’t ticked."]);
    assert.deepEqual(ticks.after, ["Ticking everything it asks for stops these reminders. Your work locks when the session starts."]);
  });
});

// ===========================================================================
// 2b. Every combination
// ===========================================================================

describe("2b. no combination of missing facts sends a broken email", () => {
  const FLAGS = ["title", "time", "room", "online", "cancelled", "change", "asks", "feedback", "first", "name", "link", "locks"];

  function factsFor(mask) {
    const on = (flag) => (mask & (1 << FLAGS.indexOf(flag))) !== 0;
    return {
      facts: {
        ...OPEN,
        weekTitle: on("title") ? OPEN.weekTitle : "",
        sessionAt: on("time") ? OPEN.sessionAt : null,
        where: on("online") ? "Online" : on("room") ? OPEN.where : "",
        cancelled: on("cancelled"),
        change: on("change") ? "Wed 18 Nov is cancelled. Do week 3’s reading anyway." : "",
        asks: on("asks") ? OPEN.asks : [],
        feedbackUrl: on("feedback") ? "https://forms.example/weekly" : "",
        first: on("first"),
        weekUrl: on("link") ? OPEN.weekUrl : "",
        locks: on("locks"),
      },
      name: on("name") ? "Priya" : "",
    };
  }

  test(`all ${2 ** FLAGS.length} of them read whole`, async () => {
    for (let mask = 0; mask < 2 ** FLAGS.length; mask += 1) {
      const { facts, name } = factsFor(mask);
      const email = words.weekOpenEmailWords(facts, name);
      const label = `combination ${mask.toString(2).padStart(FLAGS.length, "0")}`;
      assert.ok(email.subject.length > 0 && !/[\r\n]/.test(email.subject), `${label}: subject`);
      const all = [email.subject, email.greeting, ...email.paragraphs, ...email.lists.flatMap((l) => [l.lead, ...l.items]), email.button, ...email.after];
      for (const line of all) {
        assert.doesNotMatch(line, /undefined|null|NaN|[{}]|\s[,.]|\s{2}|\bin\s*\.|\bin\s*$|,\s*\.|\.\./, `${label}: "${line}"`);
        assert.doesNotMatch(line, /\b(mark|marks|grade|graded|score|scored)\b/i, `${label}: "${line}"`);
        assert.doesNotMatch(line, /[–—]/, `${label}: a dash in "${line}"`);
      }
      for (const list of email.lists) for (const item of list.items) assert.ok(item.trim().length > 0, `${label}: an empty line in a list`);
      if (!facts.weekUrl) assert.equal(email.link, "", `${label}: a button with nowhere to go`);
      // Rendered only one in 64, to keep the suite quick: the template is one shape.
      if (mask % 64 === 0) {
        const html = await render(WeekEmail({ words: email, notice: null }));
        assert.doesNotMatch(html, /href=""/, `${label}: a dead link`);
        if (!facts.weekUrl) assert.doesNotMatch(html, new RegExp(`Open week ${facts.weekNumber}`), `${label}: a button with no link`);
      }
    }
  });
});

// ===========================================================================
// 3. What is typed stays text
// ===========================================================================

describe("3. what people type reaches an inbox as text", () => {
  test("a week's title, a room and a reason are text in the email, never markup", async () => {
    const email = words.weekOpenEmailWords(
      {
        ...OPEN,
        weekTitle: "Power & <b>incentives</b>",
        where: `Room "B" <script>alert(1)</script>`,
        change: "Off because <i>reasons</i> & more.",
      },
      "Priya",
    );
    const html = await render(WeekEmail({ words: email, notice: null }));
    assert.ok(!html.includes("<b>incentives</b>") && !html.includes("<script>") && !html.includes("<i>reasons</i>"));
    assert.ok(html.includes("&lt;b&gt;incentives&lt;/b&gt;"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  test("a line break typed into a title, a course or a room never reaches a subject or a sentence", () => {
    const email = words.weekOpenEmailWords(
      { ...OPEN, weekTitle: "Power\nand  incentives", courseTitle: "AGI\r\nStrategy", where: "Portland\nA21" },
      "Pri\nya",
    );
    assert.equal(email.subject, "Week 3 is open: Power and incentives");
    assert.equal(email.paragraphs[0], "Week 3 of AGI Strategy is open: Power and incentives. Your next session is Wed 18 Nov at 3pm in Portland A21.");
    assert.equal(email.greeting, "Hi Pri ya,");
  });
});

// ===========================================================================
// 4. What a week asks for, and what is left
// ===========================================================================

/** A week written as blocks: two readings and a reflection in part 1, a written answer in part 2, a pathway in part 3. */
function blockWeek() {
  const source = (id, title) => ({ id, type: "source", kind: "read", lead: "", title, url: "https://example.com", by: "", date: "", time: "", compute: "", note: [] });
  return [
    {
      id: "tw",
      type: "thisWeek",
      rows: [
        { type: "task", what: "Part 1", time: "", when: "before", whenText: "", covers: ["p1"] },
        { type: "task", what: "Part 2", time: "", when: "dayBefore", whenText: "", covers: ["p2"] },
        { type: "optional", what: "Hands-on", time: "", note: "" },
      ],
      total: "",
      note: [],
    },
    {
      id: "p1",
      type: "part",
      title: "One",
      time: "",
      framing: [],
      blocks: [
        source("s1", "Compute as a lever for governance"),
        source("s2", "A second reading"),
        { id: "c1", type: "checklist", items: [{ id: "i1", text: "Note one claim" }, { id: "i2", text: "Note another" }] },
        { id: "r1", type: "reflection", prompts: [{ id: "q1", text: "What changed?" }] },
      ],
    },
    {
      id: "p2",
      type: "part",
      title: "Two",
      time: "",
      framing: [],
      blocks: [{ id: "wa", type: "writtenAnswer", prompt: [], boxes: [], guidance: [], words: { min: 10, max: 40 }, due: "dayBefore" }],
    },
    // A part no task covers: its reading is not on the path, so it is neither asked for nor left.
    { id: "p3", type: "part", title: "Further", time: "", framing: [], blocks: [source("s3", "Only if you have time")] },
  ];
}

describe("4. what a week asks for, and what is left of one person's", () => {
  test("in the check's scope: the readings and steps the tasks count, and every reflection and written answer", () => {
    const blocks = blockWeek();
    const asks = model.blockWeekAsks(blocks, progress.weekTaskNeeds(blocks));
    assert.deepEqual(asks, [
      { kind: "readings", count: 2 },
      { kind: "steps", count: 2 },
      { kind: "reflections", count: 1 },
      { kind: "answers", count: 1 },
    ]);
    assert.deepEqual(model.blockWeekAsks([], []), [], "a week that asks for nothing lists nothing");
  });

  test("what is left: the check's lines, and that a week with something to write is not submitted", () => {
    const blocks = blockWeek();
    const tasks = progress.weekTaskNeeds(blocks);
    const state = {
      isTicked: (id) => id === "s2" || id === "i1" || id === "i2",
      isWritten: () => false,
      isSent: () => false,
      packOf: () => null,
      isReady: () => false,
      answerOf: () => ({ words: 12, emptyBoxes: 0 }),
    };
    const left = model.weekLeft({ blocks, tasks, state, writes: true, submitted: false });
    assert.deepEqual(words.weekLeftWords(3, left), [
      "One reading isn’t ticked: “Compute as a lever for governance”.",
      "Your part 1 reflection is empty.",
      "Week 3 isn’t submitted.",
    ]);
    assert.equal(model.weekLeft({ blocks, tasks, state, writes: true, submitted: true }).notSubmitted, false);
    assert.equal(model.weekLeft({ blocks, tasks, state, writes: false, submitted: false }).notSubmitted, false);
  });
});

// ===========================================================================
// 5. Whole or not at all
// ===========================================================================

describe("5. on the schedule, a fact the email carries that is empty holds it whole", () => {
  test("a whole week holds for nothing, a weekly form or a name it may go without", () => {
    assert.deepEqual(words.missingWeekOpenValues({ ...OPEN, feedbackUrl: "" }), []);
  });

  test("the group's day and time, its room, the week's title and what the week asks for each hold it", () => {
    assert.deepEqual(words.missingWeekOpenValues({ ...OPEN, sessionAt: null }), ["sessionWhen"]);
    assert.deepEqual(words.missingWeekOpenValues({ ...OPEN, where: " " }), ["sessionWhere"]);
    assert.deepEqual(words.missingWeekOpenValues({ ...OPEN, weekTitle: "" }), ["weekTitle"]);
    assert.deepEqual(words.missingWeekOpenValues({ ...OPEN, asks: [] }), ["weekAsks"]);
    assert.deepEqual(
      words.missingWeekOpenWords(["sessionWhen", "sessionWhere", "weekTitle", "weekAsks"], 4),
      ["the group’s day and time", "the group’s room", "week 4’s title", "what week 4 asks for"],
    );
  });

  test("a cancelled evening goes without its day and room, which it says are off", () => {
    assert.deepEqual(words.missingWeekOpenValues({ ...OPEN, cancelled: true, sessionAt: null, where: "" }), []);
  });

  test("an online week says Online, which is a place", () => {
    assert.deepEqual(words.missingWeekOpenValues({ ...OPEN, where: "Online" }), []);
  });
});

// ===========================================================================
// 6. What outlived the nudge
// ===========================================================================

describe("6. the group's claim, where a session is, and the week's page", () => {
  test("the claim is byte for byte the nudge's for a week's first session, so a group mailed is never mailed again", () => {
    assert.equal(parts.groupNudgeMarkerId("run1", "g1", "2026-11-12"), "gnudge__run1__g1__2026-11-12");
    assert.equal(parts.groupNudgeMarkerId("run1", "g1", "2026-11-12", 1), "gnudge__run1__g1__2026-11-12");
    assert.equal(parts.groupNudgeMarkerId("run1", "g1", "2026-11-12", 2), "gnudge__run1__g1__2026-11-12-2");
    assert.equal(parts.groupNudgeMarkerId("run1", "g1", "2026-11-12", 1.5), "gnudge__run1__g1__2026-11-12");
    // Clear of the send throttle in the same collection.
    assert.ok(!parts.groupNudgeMarkerId("run1", "g1", "k").startsWith("emailrate__"));
  });

  test("where a session is: the room, Online, or nothing, and never the group's video link", () => {
    const slot = { weekday: 3, startTimeLocal: "15:00", durationMinutes: 90, location: "Portland A21", meetingUrl: "https://meet.example.com/abc", notes: "" };
    assert.equal(parts.courseNudgeSessionWhere(slot, null), "Portland A21");
    assert.equal(parts.courseNudgeSessionWhere(slot, "virtual"), "Online");
    assert.equal(parts.courseNudgeSessionWhere({ ...slot, location: "" }, null), "Online");
    assert.equal(parts.courseNudgeSessionWhere({ ...slot, location: "" }, "in-person"), "");
    assert.equal(parts.courseNudgeSessionWhere({ ...slot, location: "https://zoom.example.com/j/1" }, null), "");
    for (const mode of [null, "virtual", "in-person"]) {
      assert.doesNotMatch(parts.courseNudgeSessionWhere(slot, mode), /meet\.example/);
    }
  });

  test("the week's page, and no half-formed link", () => {
    assert.equal(parts.courseWeekUrl("https://naisi.uk/", "run 1", 3), "https://naisi.uk/learn/run%201/weeks/3");
    assert.equal(parts.courseWeekUrl("", "run1", 3), "");
    assert.equal(parts.courseWeekUrl("https://naisi.uk", "", 3), "");
    assert.equal(parts.courseWeekUrl("https://naisi.uk", "run1", 0), "");
  });
});

// ===========================================================================
// 7. The send, read from the source
// ===========================================================================

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}

describe("7. the send", () => {
  const send = codeOf("src/lib/courses/nextWeekEmail.ts");
  const job = codeOf("src/lib/scheduler/jobs/weekReminders.ts");

  test("the group's claim is created before the first message, and never for an audience nobody can be sent", () => {
    const claim = send.indexOf("await markerRef.create({");
    const dispatch = send.indexOf("await dispatchSends(recipients,");
    assert.ok(claim > 0 && dispatch > claim, "the claim is taken after the send starts");
    const nobody = send.indexOf('heldOutcome(\n        "nobody"');
    const prepared = send.indexOf("return { ready: true, markerId, reading, members: audience.members");
    assert.ok(nobody > 0 && prepared > nobody, "an empty audience is decided after the claim could be taken");
    assert.ok(send.indexOf("async function prepareNextWeekEmail") < claim, "the decision is made before the claim");
  });

  test("a resend goes over the claim and records itself on it, and only a person may force one", () => {
    assert.match(send, /if \(!args\.force \|\| args\.by\.kind !== "push"\) \{/);
    assert.match(send, /forceCount: FieldValue\.increment\(1\),/);
    assert.match(send, /lastForcedByUid: args\.by\.uid,/);
  });

  test("both emails are read off the places, through the notice door, with no unsubscribe anywhere", () => {
    assert.match(send, /resolveNoticeAudience\(db, run\.id, LANE, \{ groupId: group\.id \}\)/);
    assert.match(send, /surface: "course-week",/);
    assert.match(job, /resolveNoticeAudience\(db, runState\.run\.id, LANE, \{ groupId: group\.id \}\)/);
    assert.match(job, /surface: "course-week-reminder",/);
    for (const [name, code] of [["the week's email", send], ["the reminders", job]]) {
      assert.doesNotMatch(code, /resolveCohortAudience|listUnsubscribe|unsubscribe|signToken/, `${name} reads the cohort list or offers to unsubscribe`);
      assert.doesNotMatch(code, /sendEmail\(|sendNoticePush\(/, `${name} sends some other way than the notice door, or pushes`);
    }
  });

  test("the template has two senders, and nothing else in src renders it", () => {
    const senders = [];
    for (const file of walk(SRC)) {
      const path = relative(REPO_ROOT, file).split(sep).join("/");
      // The template's own declaration is not a sender.
      if (path === "src/emails/WeekEmail.tsx") continue;
      const code = stripSource(readFileSync(file, "utf8"));
      if (/\bWeekEmail\(/.test(code)) senders.push(path);
    }
    assert.deepEqual(senders.sort(), ["src/lib/courses/nextWeekEmail.ts", "src/lib/scheduler/jobs/weekReminders.ts"]);
  });

  test("every word of both emails is written in one file", () => {
    for (const code of [send, job, codeOf("src/emails/WeekEmail.tsx")]) {
      assert.doesNotMatch(code, /isn’t finished yet|is open:|Your next session|stops these reminders/, "a word of the week's emails written outside words.ts");
    }
  });
});

// ===========================================================================
// 8. The nudge is gone
// ===========================================================================

describe("8. the weekly nudge, its template and its page are gone", () => {
  test("no route, page or panel is left that could send it", () => {
    for (const path of [
      "src/app/api/courses/runs/[runId]/nudge/route.ts",
      "src/app/(app)/learn/[runId]/nudge/page.tsx",
      "src/features/courses/NudgePanel.tsx",
      "src/emails/CourseNudgeEmail.tsx",
    ]) {
      assert.ok(!existsSync(join(REPO_ROOT, path)), `${path} is back`);
    }
    for (const file of walk(SRC)) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /\/nudge[`"']/, `${relative(REPO_ROOT, file)} links to the nudge`);
    }
  });

  test("the Weekly reminder is no template an admin can edit, preview or test", () => {
    assert.ok(!courseEmails.COURSE_TEMPLATE_IDS.includes("course-week-nudge"));
    assert.equal(courseEmails.courseTemplateDefaults["course-week-nudge"], undefined);
    for (const path of [
      "src/features/admin/emailDesigns/CourseEmailDesignEditor.tsx",
      "src/features/admin/emailDesigns/courseEmailSamples.ts",
      "src/app/api/admin/course-emails/preview/route.ts",
      "src/app/api/admin/course-emails/[templateId]/send-test/route.ts",
    ]) {
      assert.doesNotMatch(codeOf(path), /course-week-nudge|renderCourseNudge|WEEK_TOKENS|WeekTokens|COURSE_NUDGE/, `${path} still offers the weekly reminder`);
    }
  });

  test("its last line said nobody was keeping score, which privacy v15 took back, and no week's email says it", () => {
    assert.doesNotMatch(codeOf("src/lib/courses/weekEmails/words.ts"), /keeping score/i);
  });
});
