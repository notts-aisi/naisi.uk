/**
 * THE REMINDERS BEFORE A SESSION (`courses-week-reminders`): 3 days and 1 day
 * before each of a group's sessions, at 9am in London, one email to each
 * person due at it, with that week's day, time and place, how to say they
 * can't make it, what a certificate needs where the run has a rule, and what
 * is left of their week if anything is. The real job, run against one course
 * run.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO IS DUE, AND WHEN. Every session that meets has two reminders, each
 *     due from 9am on its day until twelve hours later and never once the
 *     session has started; either side of the clocks going back.
 *  2. EVERYBODY DUE AT THE SESSION, AND WHAT IS LEFT ONLY WHEN THE WEEK IS
 *     NOT DONE. "Done" is the one meaning (`weekDone`): it stops the list,
 *     never the email. A week submitted with a reading left unticked still
 *     takes work, so the reading is listed.
 *  3. ONE MARKER EACH. A claim per person per reminder, stamped with why
 *     nobody was mailed when nobody was; two ticks at once send once; a
 *     reminder too late to be worth sending is stamped stale, once.
 *  4. THE SESSION THAT MEETS. A cancelled evening has no reminders; the
 *     session after it covers both weeks, each with its own list. A moved
 *     session is reminded about on its new date, in its new room.
 *  5. A NOTICE. Everybody holding a place, whatever they unsubscribed from;
 *     a suppressed address is the one thing that stops it; the line saying
 *     why above the words; no unsubscribe; nobody else (not a facilitator
 *     holding no place, not somebody nobody has told their group).
 *  6. ONLY SESSIONS OF WEEKS WRITTEN AS BLOCKS, AND PUBLISHED, are reminded
 *     about.
 *  7. IT SHIPS SWITCHED OFF, and the tick runs it only when it is on.
 *  8. SOMEBODY MOVED FROM A WEEK is reminded by the session they are due at
 *     that week.
 *  9. THE PLACE IS THAT WEEK'S: a week with its own room, a week whose room
 *     is to be confirmed on a group with a usual room, a week held online, a
 *     campus or none, a group's standing link with no room, the facilitators
 *     who stand, an incubator. Never a meeting link.
 * 10. THE CERTIFICATE SENTENCE is what the programme page says to that
 *     person, and only where the run has a rule: never a count.
 * 11. NOBODY IS TOLD TO COME TO A SESSION THEY WILL NOT BE AT: said they
 *     can't make it, or an excusal approved. With work left, the reminder
 *     about what is left in its own words; with none, nothing.
 * 12. JOINED LATE: a covered week whose session was before they were told
 *     their group is not theirs.
 *
 * Built on `tests/lib/registerWorld.mjs`: the run starts on Thursday 15
 * October 2026; Group B meets on Tuesdays from 6pm to 8pm in Room C20 (Rahul
 * and Sofia facilitate; Amara, Chloe and Farah are in it), Group A on Mondays
 * (Amelia; Ana). Here weeks 2 and 3 are written as blocks: two readings in
 * part 1 and a written answer in part 2.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "@react-email/render";
import { AGI, GROUP, ROUND, RUN, jobContext, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";
import { pressedBefore } from "./lib/saidBefore.mjs";

const made = makeWorld("__weekReminders");
const { world, reset, call, courseRoute, lib, loadTs } = made;

const { weekRemindersJob, dueReminders, sessionReminderVerdict, programmePageShowsSession } = await lib("scheduler", "jobs", "weekReminders.ts");
const { weekTaskNeeds } = await lib("courses", "weekBlocks", "progress.ts");
const { weekAsksForWriting, weekWritingNeeds } = await lib("courses", "weekWork", "model.ts");
const { JOBS, SCHEDULER_JOB_IDS, jobDefaultEnabled } = await lib("scheduler", "registry.ts");
const { resolveSessions } = await lib("courses", "sessions.ts");
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const tickRoute = await courseRoute("runs", "[runId]", "ticks", "[itemId]");
const writeRoute = await courseRoute("runs", "[runId]", "written-answers", "[answerId]");
const submitRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "submit");
const change = await courseRoute("groups", "[groupId]", "session", "change");
const cantMakeIt = await courseRoute("groups", "[groupId]", "cant-make-it");
const overview = await courseRoute("runs", "[runId]", "overview");
const tick = await loadTs("app/api/scheduler/tick/route.ts");

/** Wednesday 21 October, 10am BST: well before any reminder of week 2. */
const START = new Date("2026-10-21T09:00:00Z");
mock.timers.enable({ apis: ["Date"], now: START });
const at = (instant) => mock.timers.setTime(new Date(instant).getTime());

/**
 * When each reminder is due. Group B's week 2 meets on Tuesday 27 October
 * (GMT, after the clocks go back on Sunday 25 October): its 3-day reminder is
 * Saturday 24 October at 9am BST, its 1-day reminder Monday 26 October at 9am
 * GMT. Week 3 meets on Tuesday 3 November: Saturday 31 October and Monday 2
 * November, both GMT.
 */
const DUE = {
  b2three: new Date("2026-10-24T08:00:00Z"),
  b2one: new Date("2026-10-26T09:00:00Z"),
  b3one: new Date("2026-11-02T09:00:00Z"),
};
const HOUR = 3_600_000;

const MEMBERS_B = ["amara", "chloe", "farah"];
const address = (uid) => `${uid}@example.com`;
const mailTo = (uid) => world.mail.filter((message) => message.to === address(uid));
const read = (path) => world.db.read(path);
const marker = (uid, days, sessionKey = "w02", groupId = GROUP.b) =>
  read(`schedulerMarkers/weekremind__${groupId}__${sessionKey}__${uid}__${days}`);

/**
 * The notice's line above the reminder of a session: its own reason, naming
 * the programme (AGI Strategy names this run), from
 * `sessionReminderReason` in src/emails/NoticeMarker.tsx.
 */
const NOTICE_LINE =
  "Sent as an important notice You are getting this because you have a session coming up on AGI Strategy, so it reaches you whatever your notification settings say, and it is never marketing.";
/** The notice's line above the reminder about what is left, exactly as the reminders have always had it. */
const LEFT_NOTICE_LINE =
  "Sent as an important notice You are getting this because our records show this week’s work isn’t finished, so it reaches you whatever your notification settings say, and it is never marketing.";
/** The reminder of a session's button, to the run's own page. */
const BUTTON = "Open your programme page https://naisi\\.invalid/learn/[^ /]+(?: |$)";
/** The second paragraph of the reminder of a session, the same for everybody. */
const CANT_MAKE_IT = "Can’t make it? Tell us on your programme page as early as you can: press Can’t make it on this session’s card.";
/** Group B's week 2 session as the reminder says it, with the place in the middle. */
const B2 = (place = ", in Room C20", after = "") => `Group B’s week 2 session is on Tue 27 Oct, 6pm to 8pm${place}, with Rahul and Sofia.${after}`;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A message as its reader sees it: the real template, rendered to text. */
async function textOf(message) {
  return (await render(message.react, { plainText: true })).replace(/\s+/g, " ");
}

/** One run of the job, as the tick hands it over, at `instant`. */
async function runJob(instant, options) {
  at(instant);
  return weekRemindersJob.handler(jobContext(weekRemindersJob, new Date(instant), options).ctx);
}

const run = (text) => ({ text });
const p = (...runs) => ({ type: "p", runs });
const source = (id, title) => ({
  id,
  type: "source",
  kind: "read",
  lead: "",
  title,
  url: `https://reading.example.com/${id}`,
  by: "Ada Example",
  date: "2024",
  time: "20 minutes",
  compute: "",
  note: [],
});

/** Week `n` written as blocks: two readings in part 1, a written answer in part 2. */
function blockWeek(n) {
  const k = `n${n}`;
  const parts = [
    {
      id: `${k}-p1`,
      type: "part",
      title: "Two readings",
      time: "About 40 minutes",
      framing: [p(run("Read both."))],
      blocks: [source(`${k}-s1`, "Compute as a lever for governance"), source(`${k}-s2`, "Who keeps the lamps")],
    },
    {
      id: `${k}-p2`,
      type: "part",
      title: "Your written answer",
      time: "5 to 200 words",
      framing: [p(run("Write it."))],
      blocks: [
        {
          id: `${k}-wa`,
          type: "writtenAnswer",
          prompt: [p(run("Who should keep the lamps lit?"))],
          boxes: [],
          guidance: [p(run("Say why."))],
          words: { min: 5, max: 200 },
          due: "dayBefore",
        },
      ],
    },
  ];
  return {
    weekNumber: n,
    title: `Week ${n} theme`,
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks: [
      {
        id: `${k}-tw`,
        type: "thisWeek",
        rows: parts.map((part) => ({ type: "task", what: part.title, time: "About 20 minutes", when: "before", whenText: "", covers: [part.id] })),
        total: "About 40 minutes",
        note: [],
      },
      ...parts,
    ],
  };
}

function seedBlocks(over = {}) {
  return seedWorld({
    over: {
      [`courseRuns/${RUN}/weeks/w02`]: blockWeek(2),
      [`courseRuns/${RUN}/weeks/w03`]: blockWeek(3),
      ...over,
    },
  });
}

/** `uid` ticks week `n`'s readings, writes its answer and submits it, through the routes a week page uses. */
async function finishWeek(uid, n, { tickBoth = true, submit = true } = {}) {
  const weekId = `w0${n}`;
  const items = tickBoth ? [`n${n}-s1`, `n${n}-s2`] : [`n${n}-s1`];
  for (const itemId of items) {
    const ticked = await call(uid, tickRoute.PUT, { runId: RUN, itemId }, { body: { weekId, completed: true } });
    assert.equal(ticked.status, 200, JSON.stringify(ticked.body));
  }
  if (!submit) return;
  const wrote = await call(uid, writeRoute.PUT, { runId: RUN, answerId: `n${n}-wa` }, {
    body: { weekId, text: "The town should keep them, because it uses them." },
  });
  assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
  const sent = await call(uid, submitRoute.POST, { runId: RUN, weekId }, { body: { submit: true } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
}

beforeEach(() => {
  at(START);
  reset(seedBlocks());
});

// ===========================================================================
// 1. Who is due, and when
// ===========================================================================

describe("1. who is due, and when", () => {
  test("each session that meets has two reminders, 3 days and 1 day before at 9am, either side of the clocks going back", () => {
    const runDoc = normalizeCourseRun(RUN, read(`courseRuns/${RUN}`));
    const groupB = normalizeCourseGroup(GROUP.b, read(`courseGroups/${GROUP.b}`));
    const sessions = resolveSessions(runDoc, groupB);
    const due = (instant) =>
      dueReminders(sessions, new Date(instant), weekRemindersJob.maxLateHours).map(
        (r) => `${r.session.sessionKey} ${r.daysBefore}${r.stale ? " stale" : ""}`,
      );
    assert.deepEqual(due(DUE.b2three.getTime() - 1), [], "not a minute early");
    assert.deepEqual(due(DUE.b2three), ["w02 3"], "Saturday at 9am BST");
    assert.deepEqual(due("2026-10-25T12:00:00Z"), ["w02 3 stale"], "a day late, the 3-day one is stale");
    assert.deepEqual(due(DUE.b2one), ["w02 1"], "Monday at 9am GMT; the 3-day one, two days late, is let go");
    assert.deepEqual(due(DUE.b2three.getTime() + 13 * HOUR), ["w02 3 stale"], "more than twelve hours late is stale");
    assert.deepEqual(due(DUE.b2three.getTime() + 37 * HOUR), [], "a day after that, it is let go");
    assert.deepEqual(due("2026-10-27T18:00:00Z"), [], "never once the session has started");
  });

  test("the 3-day reminder goes to everybody in Group B whose week is not done, on the minute, and once", async () => {
    await runJob(DUE.b2three.getTime() - 60_000);
    assert.deepEqual(world.mail, []);
    await runJob(DUE.b2three);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, uid);
    await runJob(DUE.b2three.getTime() + 15 * 60_000);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, `${uid}, once`);
    assert.ok(marker("amara", 3).sentAt instanceof Date);
    assert.equal(mailTo("amara")[0].subject, "Week 2: your session is on Tue 27 Oct");
  });

  test("the 1-day reminder, after the clocks go back, at 9am GMT", async () => {
    await runJob(DUE.b2one.getTime() - 60_000);
    // The 3-day reminder was two days ago, while no tick ran: far too late to
    // send, and past the day it is stamped stale in, so nobody is mailed it.
    assert.equal(marker("amara", 3), undefined);
    assert.equal(mailTo("amara").length, 0);
    await runJob(DUE.b2one);
    assert.equal(mailTo("amara").length, 1);
    assert.equal(mailTo("amara")[0].subject, "Week 2: your session is tomorrow");
  });
});

// ===========================================================================
// 2. Everybody due at the session; what is left only when the week is not done
// ===========================================================================

describe("2. everybody due at the session, and what is left only when the week is not done", () => {
  test("a week submitted with every reading ticked is done: the reminder of the session goes, with no list", async () => {
    await finishWeek("amara", 2);
    await runJob(DUE.b2three);
    const [message] = mailTo("amara");
    assert.ok(message, "done no longer stops the reminder");
    assert.ok(marker("amara", 3).sentAt instanceof Date);
    assert.equal(marker("amara", 3).skippedReason ?? null, null);
    assert.equal(message.subject, "Week 2: your session is on Tue 27 Oct");
    const text = await textOf(message);
    assert.match(text, new RegExp(`Hi Amara, ${escape(NOTICE_LINE)} ${escape(B2())} ${escape(CANT_MAKE_IT)} ${BUTTON}`));
    assert.doesNotMatch(text, /isn’t finished yet|isn’t ticked|is empty|stops these reminders/);
    assert.equal(mailTo("chloe").length, 1);
  });

  test("finishing the week after the 3-day reminder takes the list off the 1-day one, and never the reminder", async () => {
    await runJob(DUE.b2three);
    assert.equal(mailTo("chloe").length, 1);
    assert.match(await textOf(mailTo("chloe")[0]), /Week 2 isn’t finished yet:/);
    at("2026-10-25T12:00:00Z");
    await finishWeek("chloe", 2);
    await runJob(DUE.b2one);
    assert.equal(mailTo("chloe").length, 2, "the 1-day reminder goes");
    assert.equal(mailTo("chloe")[1].subject, "Week 2: your session is tomorrow");
    assert.ok(marker("chloe", 1).sentAt instanceof Date);
    const text = await textOf(mailTo("chloe")[1]);
    assert.ok(text.includes(B2()), "the same sentence 1 day before as 3 days before");
    assert.doesNotMatch(text, /isn’t finished yet/);
    assert.equal(mailTo("farah").length, 2, "and the others get theirs, with their lists");
    assert.match(await textOf(mailTo("farah")[1]), /Week 2 isn’t finished yet:/);
  });

  test("a week submitted with a reading left unticked still takes work: the reminder names the reading, never that it is not submitted", async () => {
    await finishWeek("farah", 2, { tickBoth: false });
    await runJob(DUE.b2three);
    const [message] = mailTo("farah");
    assert.ok(message, "the week stays open, and is not done");
    assert.ok(marker("farah", 3).sentAt, "the marker says it was sent");
    const text = await textOf(message);
    assert.match(text, /Week 2 isn’t finished yet: \* One reading isn’t ticked: “Who keeps the lamps”\./);
    assert.doesNotMatch(text, /Your written answer isn’t sent yet\./, "the old Submit was pressed, which sent it");
  });

  test("every word, in order: the notice line, the session, Can't make it, what is left under the reminder's own lead-in, and the button", async () => {
    // Chloe ticked one of the two readings and has written nothing yet.
    await finishWeek("chloe", 2, { tickBoth: false, submit: false });
    await runJob(DUE.b2one);
    const [message] = mailTo("chloe");
    assert.equal(message.kind, "notice");
    assert.equal(message.surface, "course-week-reminder");
    assert.equal(message.listUnsubscribe, undefined, "a notice offers no unsubscribe");
    assert.equal(message.subject, "Week 2: your session is tomorrow");
    const text = await textOf(message);
    assert.match(
      text,
      new RegExp(
        `Hi Chloe, ${escape(NOTICE_LINE)} ${escape(B2())} ${escape(CANT_MAKE_IT)} ` +
          "Week 2 isn’t finished yet: \\* One reading isn’t ticked: “Who keeps the lamps”\\. \\* Your written answer is empty\\. " +
          BUTTON,
      ),
    );
    // No certificate rule on this run: no certificate sentence.
    assert.doesNotMatch(text, /certificate/);
    // The lines that said finishing stops these reminders are gone: it doesn't.
    assert.doesNotMatch(text, /stops these reminders|keep adding to your work after the session/);
    assert.doesNotMatch(text, /unsubscribe|\b(mark|grade|score)\b|\block|submit/i);
  });

  test("a written answer with words in it and not sent yet is named: sending it is part of finishing the week", async () => {
    await finishWeek("chloe", 2, { tickBoth: true, submit: false });
    const wrote = await call("chloe", writeRoute.PUT, { runId: RUN, answerId: "n2-wa" }, { body: { weekId: "w02", text: "The town should keep them." } });
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    await runJob(DUE.b2one);
    const [message] = mailTo("chloe");
    assert.ok(message, "a week with an answer written and not sent is not done");
    const text = await textOf(message);
    assert.match(text, /Week 2 isn’t finished yet: \* Your written answer isn’t sent yet\. Open your programme page/);
  });

  test("done is never a reason not to mail: every person due at the session is sent each reminder, once", async () => {
    for (const uid of MEMBERS_B) await finishWeek(uid, 2);
    await runJob(DUE.b2three);
    await runJob(DUE.b2three.getTime() + 15 * 60_000);
    await runJob(DUE.b2one);
    await runJob(DUE.b2one.getTime() + 15 * 60_000);
    for (const uid of MEMBERS_B) {
      assert.equal(mailTo(uid).length, 2, `${uid}: one 3-day and one 1-day, never twice`);
      for (const days of [3, 1]) {
        assert.ok(marker(uid, days).sentAt instanceof Date, `${uid} ${days}`);
        assert.notEqual(marker(uid, days).skippedReason, "done");
      }
    }
  });
});

// ===========================================================================
// 3. One marker each
// ===========================================================================

describe("3. one marker each", () => {
  test("two ticks at once send each reminder once", async () => {
    at(DUE.b2three);
    const ctx = () => jobContext(weekRemindersJob, DUE.b2three).ctx;
    await Promise.all([weekRemindersJob.handler(ctx()), weekRemindersJob.handler(ctx())]);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, `${uid} once`);
  });

  test("a reminder too late to be worth sending is stamped stale, once, and nobody is mailed", async () => {
    await runJob(DUE.b2three.getTime() + 13 * HOUR);
    assert.deepEqual(world.mail, []);
    for (const uid of MEMBERS_B) assert.equal(marker(uid, 3).skippedReason, "stale", uid);
    const markers = () => world.db.paths().filter((path) => path.startsWith("schedulerMarkers/weekremind__")).length;
    const before = markers();
    await runJob(DUE.b2three.getTime() + 14 * HOUR);
    assert.equal(markers(), before, "nothing new on a second look");
  });

  test("a transport failure leaves the marker to be tried again, and nobody is mailed twice", async () => {
    world.mailFails = (message) => message.to === address("farah");
    await runJob(DUE.b2three);
    assert.equal(mailTo("farah").length, 0);
    assert.equal(marker("farah", 3).sentAt, null);
    assert.ok(marker("farah", 3).lastError);
    world.mailFails = null;
    await runJob(DUE.b2three.getTime() + 30 * 60_000);
    assert.equal(mailTo("farah").length, 1, "the re-claim rule sent it");
    for (const uid of ["amara", "chloe"]) assert.equal(mailTo(uid).length, 1, `${uid} once`);
  });
});

// ===========================================================================
// 4. The session that meets
// ===========================================================================

describe("4. the session that actually meets", () => {
  test("a cancelled evening has no reminders; the session after it covers both weeks, each with its own list", async () => {
    at("2026-10-21T12:00:00Z");
    const cancelled = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: { week: 2, dateKey: "2026-10-27", kind: "cancel", reason: "Rahul and Sofia are both away.", tell: false },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    await runJob(DUE.b2three);
    await runJob(DUE.b2one);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 0, `${uid} was reminded about an evening nobody meets`);
    await runJob(DUE.b3one);
    assert.equal(mailTo("amara").length, 1);
    const [message] = mailTo("amara");
    assert.equal(message.subject, "Weeks 2 and 3: your session is tomorrow");
    const text = await textOf(message);
    assert.ok(text.includes("Group B’s week 3 session is on Tue 3 Nov, 6pm to 8pm, in Room C20, with Rahul and Sofia."), text);
    assert.match(text, /Week 2 isn’t finished yet: .* Your written answer is empty\. Week 3 isn’t finished yet: .* Your written answer is empty\./);
    assert.match(text, new RegExp(BUTTON));
    assert.doesNotMatch(text, /Finish week|\/weeks\//);
    assert.ok(marker("amara", 1, "w03"), "claimed on the session that meets");
  });

  test("a session covering two weeks, one of them done: both in the subject, only the other listed", async () => {
    at("2026-10-21T12:00:00Z");
    const cancelled = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: { week: 2, dateKey: "2026-10-27", kind: "cancel", reason: "Rahul and Sofia are both away.", tell: false },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    await finishWeek("amara", 2);
    await runJob(DUE.b3one);
    const [message] = mailTo("amara");
    assert.equal(message.subject, "Weeks 2 and 3: your session is tomorrow");
    const text = await textOf(message);
    assert.doesNotMatch(text, /Week 2 isn’t finished yet/);
    assert.match(text, /Week 3 isn’t finished yet: .* Open your programme page/);
  });

  test("a moved session is reminded about on its new date, not its old one", async () => {
    at("2026-10-21T12:00:00Z");
    const moved = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: { week: 2, dateKey: "2026-10-27", kind: "move", move: { dateKey: "2026-10-28", time: "7pm", room: "Room D1" }, reason: "Room C20 is booked.", tell: false },
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    await runJob(DUE.b2one);
    assert.equal(mailTo("amara").length, 0, "not the day before the old evening");
    await runJob("2026-10-27T09:00:00Z");
    assert.equal(mailTo("amara").length, 1);
    assert.ok((await textOf(mailTo("amara")[0])).includes("Group B’s week 2 session is on Wed 28 Oct, 7pm to 9pm, in Room D1, with Rahul and Sofia."));
    assert.equal(mailTo("amara")[0].subject, "Week 2: your session is tomorrow");
  });
});

// ===========================================================================
// 5. A notice
// ===========================================================================

describe("5. a notice: everybody holding a place, and nobody else", () => {
  test("a switched-off course row and an unsubscribe from the run's list stop nothing; a suppressed address is stamped", async () => {
    world.db.poke("users/amara", { "profile.notifications": { categories: { courses: false } } });
    world.db.poke(`subscriptions/sub_chloe__cohort-${RUN}`, { subscribed: false });
    world.db.seed("suppressedEmails/farah@example.com", { email: "farah@example.com" });
    await runJob(DUE.b2three);
    assert.equal(mailTo("amara").length, 1);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(mailTo("farah").length, 0);
    assert.equal(marker("farah", 3).skippedReason, "suppressed");
  });

  test("nobody else: no facilitator holding no place, nobody on another run, nobody untold", async () => {
    world.db.seed(`courseEnrolments/${RUN}__nell`, {
      ...read(`courseEnrolments/${RUN}__amara`),
      uid: "nell",
      allocatedEmailAt: null,
    });
    await runJob(DUE.b2three);
    for (const uid of ["rahul", "sofia", "amelia", "claudia", "zach", "nell", "pia", "dev"]) {
      assert.equal(mailTo(uid).length, 0, uid);
    }
    assert.equal(marker("nell", 3), undefined, "somebody not told their group is not even considered");
  });
});

// ===========================================================================
// 6. Only weeks written as blocks, and published
// ===========================================================================

describe("6. only sessions of weeks written as blocks, and published", () => {
  test("a week written before blocks has no Submit and no lock, and nobody is reminded about it", async () => {
    // The other run's weeks are written as before; its group meets on Tuesdays too.
    await runJob(DUE.b2three);
    assert.equal(mailTo("dev").length, 0);
    assert.equal(
      world.db.paths().filter((path) => path.startsWith(`schedulerMarkers/weekremind__${GROUP.other}`)).length,
      0,
    );
  });

  test("an unpublished week is reminded about by nobody", async () => {
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { published: false });
    await runJob(DUE.b2three);
    assert.deepEqual(world.mail, []);
    assert.equal(marker("amara", 3), undefined);
  });
});

// ===========================================================================
// 7. It ships switched off
// ===========================================================================

describe("7. it ships switched off, and the tick runs it only when it is on", () => {
  test("registered, in the union, and off until an admin turns it on", () => {
    assert.ok(JOBS.includes(weekRemindersJob));
    assert.ok(SCHEDULER_JOB_IDS.includes("courses-week-reminders"));
    assert.equal(weekRemindersJob.id, "courses-week-reminders");
    assert.equal(jobDefaultEnabled(weekRemindersJob), false);
    assert.equal(weekRemindersJob.label, "Reminders before a session");
  });

  async function tickAt(instant, enabled) {
    at(instant);
    const jobs = {};
    for (const id of SCHEDULER_JOB_IDS) jobs[id] = { enabled: false };
    if (enabled !== undefined) jobs["courses-week-reminders"] = { enabled };
    else delete jobs["courses-week-reminders"];
    world.db.seed("config/scheduler", { enabled: true, jobs });
    process.env.SCHEDULER_SECRET = "a-scheduler-secret-for-this-suite";
    const response = await tick.POST(
      new Request("https://naisi.invalid/api/scheduler/tick", {
        method: "POST",
        headers: { "content-type": "application/json", "x-scheduler-key": "a-scheduler-secret-for-this-suite" },
        body: JSON.stringify({ depth: 0 }),
      }),
    );
    return response.body.jobs.find((job) => job.id === "courses-week-reminders");
  }

  test("with no stored switch it is off; switched on, the tick sends", async () => {
    assert.equal((await tickAt(DUE.b2three)).skipped, "disabled");
    assert.deepEqual(world.mail, []);
    assert.equal((await tickAt(DUE.b2three.getTime() + 15 * 60_000, true)).skipped, null);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, uid);
  });
});

// ===========================================================================
// 8. Somebody moved from a week
// ===========================================================================

describe("8. somebody moved from a week is reminded by the session they are due at that week", () => {
  /**
   * Group A's week 2 meets on Monday 26 October: its 3-day reminder is Friday
   * 23 October at 9am BST. Its week 3 meets on Monday 2 November: its 1-day
   * reminder is Sunday 1 November at 9am GMT.
   */
  const A_DUE = {
    a2three: new Date("2026-10-23T08:00:00Z"),
    a3one: new Date("2026-11-01T09:00:00Z"),
  };
  const chloe = `courseEnrolments/${RUN}__chloe`;

  /** Chloe in Group A now. With `record`, from week 3, her weeks 1 and 2 still Group B's. */
  function moveChloe(record) {
    world.db.poke(chloe, {
      groupId: GROUP.a,
      ...(record ? { groupsByWeek: [{ groupId: GROUP.b, fromWeek: 1 }, { groupId: GROUP.a, fromWeek: 3 }] } : {}),
    });
  }

  test("with a record: week 2 by Group B's session, week 3 by Group A's", async () => {
    moveChloe(true);
    await runJob(A_DUE.a2three);
    assert.equal(marker("chloe", 3, "w02", GROUP.a), undefined, "Group A's week 2 is not hers");
    assert.equal(mailTo("chloe").length, 0);
    assert.equal(mailTo("ana").length, 1, "Group A's own people are reminded as ever");

    await runJob(DUE.b2three);
    assert.equal(mailTo("chloe").length, 1, "Group B's week 2 is hers");
    assert.equal(mailTo("chloe")[0].subject, "Week 2: your session is on Tue 27 Oct");
    assert.ok(marker("chloe", 3, "w02", GROUP.b).sentAt instanceof Date);

    await runJob(A_DUE.a3one);
    assert.equal(mailTo("chloe").length, 2, "Group A's week 3 is hers");
    assert.equal(mailTo("chloe")[1].subject, "Week 3: your session is tomorrow");
    await runJob(DUE.b3one);
    assert.equal(marker("chloe", 1, "w03", GROUP.b), undefined, "Group B's week 3 is not hers");
    assert.equal(mailTo("chloe").length, 2);
  });

  test("moved ahead: the group she is leaving reminds her without Can't make it or the link, which her page does not show; her new group's, with both", async () => {
    const LINK = "https://meet.example.com/abc-defg-hij";
    for (const id of [GROUP.a, GROUP.b]) {
      world.db.poke(`courseGroups/${id}`, { session: { ...read(`courseGroups/${id}`).session, meetingUrl: LINK }, sessionModes: { w02: "virtual", w03: "virtual" } });
    }
    moveChloe(true);
    await runJob(DUE.b2three);
    const leaving = await textOf(mailTo("chloe")[0]);
    assert.ok(leaving.includes("Group B’s week 2 session is on Tue 27 Oct, 6pm to 8pm, online, with Rahul and Sofia."), leaving);
    assert.doesNotMatch(leaving, /Can’t make it\?|The link is on your programme page/);
    // The rest of her email is intact: the notice line, the list and the button.
    assert.ok(leaving.includes(NOTICE_LINE));
    assert.match(leaving, new RegExp(`Week 2 isn’t finished yet: .* ${BUTTON}`));
    // Everybody else in Group B: both, as ever.
    const amara = await textOf(mailTo("amara")[0]);
    assert.ok(amara.includes(`${B2(", online", " The link is on your programme page.")} ${CANT_MAKE_IT}`), amara);

    await runJob(A_DUE.a3one);
    const joined = await textOf(mailTo("chloe")[1]);
    assert.ok(joined.includes(`Group A’s week 3 session is on Mon 2 Nov, 6pm to 8pm, online, with Amelia. The link is on your programme page. ${CANT_MAKE_IT}`), joined);
    assert.ok((await textOf(mailTo("ana").at(-1))).includes(CANT_MAKE_IT));
  });

  test("the rule is what the programme page shows: the group the place is in now", () => {
    const both = { cantMakeIt: true, joinOnline: true };
    const neither = { cantMakeIt: false, joinOnline: false };
    assert.deepEqual(programmePageShowsSession({ groupId: GROUP.a }, GROUP.a), both);
    assert.deepEqual(programmePageShowsSession({ groupId: GROUP.a }, GROUP.b), neither);
    assert.deepEqual(programmePageShowsSession(null, GROUP.b), neither);
  });

  /** Group A's week 2 called off, so its week 3 session covers weeks 2 and 3; its own copy of week 2 asks one reading more. */
  async function groupACoversWeekTwo() {
    const own = blockWeek(2);
    own.blocks.find((block) => block.id === "n2-p1").blocks.push(source("n2-sA", "Only Group A reads this"));
    world.db.seed(`courseGroups/${GROUP.a}/weeks/w02`, { ...own, groupId: GROUP.a, runId: RUN });
    at("2026-10-21T12:00:00Z");
    const cancelled = await call("amelia", change.POST, { groupId: GROUP.a }, {
      body: { week: 2, dateKey: "2026-10-26", kind: "cancel", reason: "Amelia is away.", tell: false },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  }

  test("a session covering a cancelled week: a week she finished with Group B is not named", async () => {
    await groupACoversWeekTwo();
    moveChloe(true);
    // Chloe finishes week 2 from her own week page, on the copy it shows her: the run's, through Group B.
    await finishWeek("chloe", 2);
    await runJob(A_DUE.a3one);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(mailTo("chloe")[0].subject, "Week 3: your session is tomorrow", "week 2 was not Group A's for her");
    assert.doesNotMatch(await textOf(mailTo("chloe")[0]), /Week 2 isn’t finished/);
    // Group A's own people are reminded about both weeks, as ever.
    assert.equal(mailTo("ana").length, 1);
    assert.equal(mailTo("ana")[0].subject, "Weeks 2 and 3: your session is tomorrow");
  });

  test("a session covering a cancelled week: a week she spent with Group B and has not finished is left out too", async () => {
    await groupACoversWeekTwo();
    moveChloe(true);
    // Nothing of week 2 done. Its work was due at Group B's week 2 session, not this one.
    await runJob(A_DUE.a3one);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(mailTo("chloe")[0].subject, "Week 3: your session is tomorrow");
    const text = await textOf(mailTo("chloe")[0]);
    assert.doesNotMatch(text, /Week 2 isn’t finished/);
    assert.match(text, /Week 3 isn’t finished yet/);
    // Somebody in Group A with no record, nothing done either: both weeks, as ever.
    assert.equal(mailTo("ana")[0].subject, "Weeks 2 and 3: your session is tomorrow");
    assert.match(await textOf(mailTo("ana")[0]), /Week 2 isn’t finished yet: .* Week 3 isn’t finished yet/);
  });

  test("a session covering a cancelled week, moved with no record: both weeks, as before", async () => {
    await groupACoversWeekTwo();
    moveChloe(false);
    await runJob(A_DUE.a3one);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(mailTo("chloe")[0].subject, "Weeks 2 and 3: your session is tomorrow");
  });

  test("with no record (moved before the record existed): every week by the group she is in now, as before", async () => {
    moveChloe(false);
    await runJob(A_DUE.a2three);
    assert.equal(mailTo("chloe").length, 1, "Group A's week 2 reminds her");
    assert.equal(mailTo("chloe")[0].subject, "Week 2: your session is on Mon 26 Oct");
    await runJob(DUE.b2three);
    assert.equal(marker("chloe", 3, "w02", GROUP.b), undefined, "Group B's does not");
    assert.equal(mailTo("chloe").length, 1);
    for (const uid of ["amara", "farah"]) assert.equal(mailTo(uid).length, 1, uid);
  });
});

// ===========================================================================
// 9. The place is that week's
// ===========================================================================

describe("9. the day, time and place are that week's, and never a meeting link", () => {
  /** The session's sentence, as Amara reads it 3 days before week 2. */
  async function sentence() {
    await runJob(DUE.b2three);
    const [message] = mailTo("amara");
    assert.ok(message, "Amara is reminded");
    const text = await textOf(message);
    assert.ok(text.includes(CANT_MAKE_IT));
    return text.slice(text.indexOf("Group B’s week 2") === -1 ? text.indexOf("Your week 2") : text.indexOf("Group B’s week 2"), text.indexOf(CANT_MAKE_IT)).trim();
  }

  test("the group's room with its campus: in Room C20 (University Park)", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { campus: "university-park" });
    assert.equal(await sentence(), B2(", in Room C20 (University Park)"));
  });

  test("a week with its own room, set on the rooms page: that room, on the week's campus", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { campus: "jubilee" });
    const set = await call("claudia", change.POST, { groupId: GROUP.b }, {
      body: { kind: "room", weeks: [{ week: 2, dateKey: "2026-10-27", room: "Portland A21" }], tell: false },
    });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(await sentence(), B2(", in Portland A21 (Jubilee)"));
  });

  test("a week whose room is to be confirmed, on a group with a usual room: never the usual room", async () => {
    const cleared = await call("claudia", change.POST, { groupId: GROUP.b }, {
      body: { kind: "room", weeks: [{ week: 2, dateKey: "2026-10-27", room: "TBC" }], tell: false },
    });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    const said = await sentence();
    assert.equal(said, B2("", " The room is still to be confirmed: it will be on your programme page as soon as it’s booked."));
    assert.doesNotMatch(said, /Room C20/);
  });

  test("a group with a standing link and no room is a room to confirm, not online", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, {
      session: { ...read(`courseGroups/${GROUP.b}`).session, location: "", meetingUrl: "https://meet.example.com/abc-defg-hij" },
    });
    assert.equal(await sentence(), B2("", " The room is still to be confirmed: it will be on your programme page as soon as it’s booked."));
  });

  test("a room that holds a link is never printed: a room to confirm", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { session: { ...read(`courseGroups/${GROUP.b}`).session, location: "https://meet.example.com/abc" } });
    assert.equal(await sentence(), B2("", " The room is still to be confirmed: it will be on your programme page as soon as it’s booked."));
  });

  test("a week held online, by the week's own switch: online, and the link is on the programme page, never in the email", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, {
      session: { ...read(`courseGroups/${GROUP.b}`).session, meetingUrl: "https://meet.example.com/abc-defg-hij" },
      sessionModes: { w02: "virtual" },
    });
    assert.equal(await sentence(), B2(", online", " The link is on your programme page."));
    const text = await textOf(mailTo("amara")[0]);
    assert.doesNotMatch(text, /meet\.example|https?:\/\/(?!naisi\.invalid)/, "a meeting link in the email");
  });

  test("a week held online with no link set for it: the sentence stops at online, with the facilitators", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { sessionModes: { w02: "virtual" } });
    assert.equal(read(`courseGroups/${GROUP.b}`).session.meetingUrl, null);
    assert.equal(await sentence(), B2(", online"));
    assert.doesNotMatch(await textOf(mailTo("amara")[0]), /The link is on your programme page/);
  });

  test("a week held online with a link of its own, on a group with none: the link is on the programme page", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, {
      sessionModes: { w02: "virtual" },
      sessionOverrides: { w02: { meetingUrl: "https://meet.example.com/week-two" } },
    });
    assert.equal(await sentence(), B2(", online", " The link is on your programme page."));
    assert.doesNotMatch(await textOf(mailTo("amara")[0]), /meet\.example/);
  });

  test("a week held online whose stored link fails the card's own check: no link sentence, as the card shows none", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, {
      session: { ...read(`courseGroups/${GROUP.b}`).session, meetingUrl: "meet.example.com/no-scheme" },
      sessionModes: { w02: "virtual" },
    });
    assert.equal(await sentence(), B2(", online"));
  });

  test("a group on the Online campus: online, with no campus in brackets", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, {
      campus: "online",
      session: { ...read(`courseGroups/${GROUP.b}`).session, location: "", meetingUrl: "https://meet.example.com/abc-defg-hij" },
    });
    assert.equal(await sentence(), B2(", online", " The link is on your programme page."));
    assert.doesNotMatch(await textOf(mailTo("amara")[0]), /meet\.example/);
  });

  test("the facilitators who stand: one facilitator by first name, none with no 'with'", async () => {
    world.db.poke("users/sofia", { role: "pending" });
    assert.equal(await sentence(), "Group B’s week 2 session is on Tue 27 Oct, 6pm to 8pm, in Room C20, with Rahul.");
    world.mail.length = 0;
    reset(seedBlocks());
    for (const uid of ["rahul", "sofia"]) world.db.poke(`users/${uid}`, { role: "pending" });
    assert.equal(await sentence(), "Group B’s week 2 session is on Tue 27 Oct, 6pm to 8pm, in Room C20.");
  });

  test("an incubator names no group and no facilitator", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.kind`]: "incubator" });
    world.db.poke(`courseGroups/${GROUP.b}`, { campus: "university-park" });
    assert.equal(await sentence(), "Your week 2 session is on Tue 27 Oct, 6pm to 8pm, in Room C20 (University Park).");
    assert.doesNotMatch(await textOf(mailTo("amara")[0]), /Group B|Rahul|Sofia/);
  });
});

// ===========================================================================
// 10. The certificate sentence
// ===========================================================================

describe("10. what a certificate needs, exactly as the programme page says it to that person", () => {
  const RULE = (atLeast) => world.db.seed(`courseFinishing/${RUN}`, { kind: "rule", runId: RUN, atLeast, setAt: new Date("2026-10-01T09:00:00Z") });

  /** What the programme page says to `uid`, read through the overview route as they open it. */
  async function pageSays(uid) {
    const answer = await call(uid, overview.GET, { runId: RUN });
    assert.equal(answer.status, 200, JSON.stringify(answer.body).slice(0, 300));
    return answer.body.certificateNeeds;
  }

  /** The certificate paragraph of `uid`'s latest reminder, or null. */
  async function emailSays(uid) {
    const messages = mailTo(uid);
    const text = await textOf(messages[messages.length - 1]);
    const at = text.indexOf("To get your certificate");
    return at === -1 ? null : text.slice(at, text.indexOf("coming.", at) + "coming.".length);
  }

  test("a run with no rule: no sentence, as the page says none", async () => {
    await runJob(DUE.b2three);
    assert.equal(await emailSays("amara"), null);
    assert.equal(await pageSays("amara"), null);
  });

  test("a run with a rule: the page's own sentence, after Can't make it, and never a count of what they missed", async () => {
    RULE(5);
    await runJob(DUE.b2three);
    const said = await emailSays("amara");
    assert.equal(said, "To get your certificate you need to come to at least 5 of your group’s 6 sessions. A session you’re excused from doesn’t count as coming.");
    assert.equal(said, await pageSays("amara"));
    const text = await textOf(mailTo("amara")[0]);
    assert.ok(text.indexOf(CANT_MAKE_IT) < text.indexOf(said) && text.indexOf(said) < text.indexOf("Week 2 isn’t finished yet"));
    assert.doesNotMatch(text, /missed|you have come|you’ve come|so far|left to come|may still/i);
  });

  test("somebody who joined late, and somebody moved with a record of groups by week: each the page's own words", async () => {
    RULE(5);
    world.db.poke(`courseEnrolments/${RUN}__farah`, { joinedWeekNumber: 2 });
    world.db.poke(`courseEnrolments/${RUN}__chloe`, { groupsByWeek: [{ groupId: GROUP.a, fromWeek: 1 }, { groupId: GROUP.b, fromWeek: 2 }] });
    await runJob(DUE.b2three);
    for (const uid of ["farah", "chloe"]) {
      const said = await emailSays(uid);
      assert.ok(said, uid);
      assert.equal(said, await pageSays(uid), uid);
    }
    assert.equal(await emailSays("farah"), "To get your certificate you need to come to at least 5 sessions. A session you’re excused from doesn’t count as coming.");
  });

  test("an incubator: the page's own sentence, which names no group", async () => {
    RULE(4);
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.kind`]: "incubator" });
    await runJob(DUE.b2three);
    const said = await emailSays("amara");
    assert.equal(said, "To get your certificate you need to come to at least 4 of your 6 sessions. A session you’re excused from doesn’t count as coming.");
    assert.equal(said, await pageSays("amara"));
  });
});

// ===========================================================================
// 11. Nobody is told to come to a session they will not be at
// ===========================================================================

describe("11. nobody is told to come to a session they will not be at", () => {
  /**
   * `uid` says they can't make Group B's week 2 session, on their own word,
   * before it: the line the register keeps as excused in advance ("Most
   * weeks, not all", or a word said before requests), written by the real
   * route through `pressedBefore`.
   */
  async function cantMake(uid) {
    at("2026-10-21T12:00:00Z");
    const said = await pressedBefore(world.db, GROUP.b, uid, () =>
      call(uid, cantMakeIt.POST, { groupId: GROUP.b }, { body: { sessionKey: "w02", cantMakeIt: true } }),
    );
    assert.equal(said.status, 200, JSON.stringify(said.body));
  }

  /** `uid`'s request to be excused from Group B's week 2 session, in `status` (the request alone, no register line). */
  function requested(uid, status) {
    world.db.seed(`courseRequests/excused-${uid}`, {
      kind: "excused",
      status,
      runId: RUN,
      groupId: GROUP.b,
      subjectUid: uid,
      askedByUid: uid,
      reason: "",
      reasonHeld: false,
      sessionKey: "w02",
      weekId: "w02",
      change: { weeks: [{ sessionKey: "w02", weekId: "w02", status }] },
    });
  }
  const approved = (uid) => requested(uid, "approved");

  test("said they can't make it, with the week's work left: the reminder about what is left, in its own words, and never the session", async () => {
    await cantMake("chloe");
    await runJob(DUE.b2three);
    const [message] = mailTo("chloe");
    assert.ok(message);
    assert.equal(message.subject, "Week 2: your session is on Tue 27 Oct");
    const text = await textOf(message);
    assert.ok(text.includes(LEFT_NOTICE_LINE), "the reminder about what is left keeps the reminders' own line");
    assert.ok(!text.includes("you have a session coming up"));
    assert.match(text, /Your AGI Strategy Fellowship session is on Tue 27 Oct at 6pm in Room C20\. Week 2 isn’t finished yet: /);
    assert.match(text, /Finish week 2 https:\/\/naisi\.invalid\/learn\/[^ ]+\/weeks\/2/, "and keeps its own button");
    assert.match(
      text,
      /Finishing everything listed above stops these reminders\. You can keep adding to your work after the session: anything you add after it shows as late to the people who read your work, with how late\./,
    );
    assert.doesNotMatch(text, /Group B’s week 2 session|Can’t make it\?|certificate/);
    assert.ok(marker("chloe", 3).sentAt instanceof Date);
    // The others are reminded of the session as ever.
    assert.ok((await textOf(mailTo("amara")[0])).includes(B2()));
  });

  test("said they can't make it, and the week is done: nothing at all, and the marker says excused", async () => {
    await finishWeek("chloe", 2);
    await cantMake("chloe");
    await runJob(DUE.b2three);
    assert.equal(mailTo("chloe").length, 0);
    assert.equal(marker("chloe", 3).skippedReason, "excused");
    await runJob(DUE.b2one);
    assert.equal(mailTo("chloe").length, 0, "nor the day before");
  });

  test("an approved excusal, with work left and with none: the same two answers", async () => {
    RULE_OFF();
    approved("farah");
    approved("amara");
    await finishWeek("amara", 2);
    await runJob(DUE.b2three);
    assert.equal(mailTo("amara").length, 0);
    assert.equal(marker("amara", 3).skippedReason, "excused");
    const [message] = mailTo("farah");
    assert.ok(message);
    assert.match(await textOf(message), /Your AGI Strategy Fellowship session is on Tue 27 Oct at 6pm in Room C20\. Week 2 isn’t finished yet:/);
    assert.ok((await textOf(mailTo("chloe")[0])).includes(B2()), "Chloe asked nothing, and is reminded of the session");
  });

  test("taking their word back makes them due at the session again", async () => {
    await cantMake("chloe");
    const back = await pressedBefore(world.db, GROUP.b, "chloe", () =>
      call("chloe", cantMakeIt.POST, { groupId: GROUP.b }, { body: { sessionKey: "w02", cantMakeIt: false } }),
    );
    assert.equal(back.status, 200, JSON.stringify(back.body));
    await runJob(DUE.b2three);
    assert.ok((await textOf(mailTo("chloe")[0])).includes(B2()));
  });

  test("a request still waiting, or declined, is no excusal: they are reminded of the session", async () => {
    requested("chloe", "waiting");
    requested("farah", "declined");
    await runJob(DUE.b2three);
    for (const uid of ["chloe", "farah"]) assert.ok((await textOf(mailTo(uid)[0])).includes(B2()), uid);
  });

  /** No rule on the run, as seeded: a reminder about what is left never carries a certificate sentence anyway. */
  function RULE_OFF() {
    assert.equal(read(`courseFinishing/${RUN}`), undefined);
  }
});

// ===========================================================================
// 12. Joined late
// ===========================================================================

describe("12. a covered week whose session was before they were told their group is not theirs", () => {
  test("told after week 2's evening was cancelled: week 3's session reminds them of week 3 alone", async () => {
    at("2026-10-21T12:00:00Z");
    const cancelled = await call("rahul", change.POST, { groupId: GROUP.b }, {
      body: { week: 2, dateKey: "2026-10-27", kind: "cancel", reason: "Rahul and Sofia are both away.", tell: false },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    // Farah was told her group on Wednesday 28 October, after the evening week 2 would have met.
    world.db.poke(`courseEnrolments/${RUN}__farah`, { allocatedEmailAt: new Date("2026-10-28T10:00:00Z"), joinedWeekNumber: 3 });
    await runJob(DUE.b3one);
    const [message] = mailTo("farah");
    assert.ok(message);
    assert.equal(message.subject, "Week 3: your session is tomorrow");
    const text = await textOf(message);
    assert.ok(text.includes("Group B’s week 3 session is on Tue 3 Nov, 6pm to 8pm, in Room C20, with Rahul and Sofia."));
    assert.doesNotMatch(text, /Week 2 isn’t finished/);
    assert.match(text, /Week 3 isn’t finished yet/);
    // Everybody else in the group: both weeks, as ever.
    assert.equal(mailTo("amara")[0].subject, "Weeks 2 and 3: your session is tomorrow");
  });
});

// ===========================================================================
// 13. The entry of a week that holds the person
// ===========================================================================

describe("13. the verdict reads each week on the entry that holds the person", () => {
  /** A person's state with nothing ticked, written or sent. */
  const nothingDone = new Proxy({}, { get: (_, key) => (key === "answerOf" ? () => ({ words: 0, emptyBoxes: 1 }) : () => false) });
  const states = {
    stateOf: () => ({ kind: "open", due: { at: new Date("2026-10-27T18:00:00Z"), by: "session" }, closesAt: null, submittedAt: null }),
  };
  const entry = (uids) => {
    const { blocks } = blockWeek(2);
    return {
      weekNumber: 2,
      blocks,
      tasks: weekTaskNeeds(blocks),
      writes: weekAsksForWriting(blocks),
      asks: weekWritingNeeds(blocks),
      facts: new Map(uids.map((uid) => [uid, { state: nothingDone }])),
    };
  };
  const verdict = (weeks) => sessionReminderVerdict({ uid: "amara", covered: [2], belongs: () => true, weeks, weekStates: states, notComing: false });

  test("one entry a week, as today: her week, listed", () => {
    const one = verdict([entry(["amara", "chloe"])]);
    assert.equal(one.send, "session");
    assert.deepEqual(one.weeks, [2]);
    assert.deepEqual(one.left.map((week) => week.weekNumber), [2]);
  });

  test("two entries for one week, the first not holding her: hers is the one read, and her week is still listed", () => {
    const two = verdict([entry(["chloe"]), entry(["amara"])]);
    assert.equal(two.send, "session");
    assert.deepEqual(two.left.map((week) => week.weekNumber), [2]);
    assert.deepEqual(two, verdict([entry(["amara"])]), "the same answer as her one entry alone");
  });

  test("today the job builds one entry for each covered week, so nothing reads differently", () => {
    const job = readFileSync(new URL("../src/lib/scheduler/jobs/weekReminders.ts", import.meta.url), "utf8");
    assert.match(job, /for \(const weekNumber of coveredWeeks\(sessions, session\)\) \{/);
    const body = job.slice(job.indexOf("async function reminderWeeks("), job.indexOf("const MAX_OWN_REGISTERS"));
    assert.match(body, /for \(const weekNumber of coveredWeeks\(sessions, session\)\) \{/);
    assert.equal(body.split("out.push({").length, 2, "reminderWeeks pushes one entry each time round, one week at a time");
    assert.match(job, /input\.weeks\.find\(\(each\) => each\.weekNumber === weekNumber && each\.facts\.has\(uid\)\)/);
  });
});

// ===========================================================================
// 14. Somebody visiting another group's session for one week
// ===========================================================================

describe("14. somebody visiting another group's session for one week", () => {
  const A_DUE = {
    a2three: new Date("2026-10-23T08:00:00Z"),
    a2one: new Date("2026-10-25T09:00:00Z"),
    a3three: new Date("2026-10-30T09:00:00Z"),
    a3one: new Date("2026-11-01T09:00:00Z"),
  };
  const chloe = `courseEnrolments/${RUN}__chloe`;
  /** Group A's week 2 session as the reminder says it. */
  const A2 = (place = ", in Room A13", after = "") => `Group A’s week 2 session is on Mon 26 Oct, 6pm to 8pm${place}, with Amelia.${after}`;
  const B3 = "Group B’s week 3 session is on Tue 3 Nov, 6pm to 8pm, in Room C20, with Rahul and Sofia.";

  /** Staff send Chloe (Group B) to Group A's session for week `week`. */
  function visitA(week) {
    world.db.poke(chloe, { visits: [{ weekNumber: week, groupId: GROUP.a, arrangedByUid: "zach", arrangedAt: START }] });
  }

  /** Group A's own copy of week `n`, which asks one reading more than the run's. */
  function groupACopy(n) {
    const own = blockWeek(n);
    own.blocks.find((block) => block.id === `n${n}-p1`).blocks.push(source(`n${n}-sA`, "Only Group A reads this"));
    world.db.seed(`courseGroups/${GROUP.a}/weeks/w0${n}`, { ...own, groupId: GROUP.a, runId: RUN });
  }

  test("the host's reminders for the visit's week reach her, her own group's do not", async () => {
    visitA(2);
    await runJob(A_DUE.a2three);
    assert.equal(mailTo("chloe").length, 1, "Group A's week 2 session is the one she goes to");
    assert.equal(mailTo("chloe")[0].subject, "Week 2: your session is on Mon 26 Oct");
    await runJob(DUE.b2three);
    assert.equal(marker("chloe", 3, "w02", GROUP.b), undefined, "Group B's week 2 session is not hers");
    assert.equal(mailTo("chloe").length, 1);
    for (const uid of ["amara", "farah"]) assert.equal(mailTo(uid).length, 1, `${uid} is reminded as ever`);
  });

  test("judged on her own group's copy: a week finished on it lists nothing, though the host's copy asks one reading more", async () => {
    groupACopy(2);
    visitA(2);
    await finishWeek("chloe", 2);
    await runJob(A_DUE.a2three);
    // Done no longer stops the reminder of the session: it stops the list.
    assert.equal(mailTo("chloe").length, 1);
    assert.ok(marker("chloe", 3, "w02", GROUP.a).sentAt, "sent");
    const text = await textOf(mailTo("chloe")[0]);
    assert.doesNotMatch(text, /isn’t finished yet/, "her week is done on her own copy");
    assert.doesNotMatch(text, /Only Group A reads this/);
    assert.equal(mailTo("ana").length, 1, "Group A's own people are judged on Group A's copy");
    assert.match(await textOf(mailTo("ana")[0]), /Week 2 isn’t finished yet/);
  });

  test("not finished: what is left is her own copy's, never the host's extra reading", async () => {
    groupACopy(2);
    visitA(2);
    await runJob(A_DUE.a2three);
    const text = await textOf(mailTo("chloe")[0]);
    assert.doesNotMatch(text, /Only Group A reads this/);
    assert.match(await textOf(mailTo("ana")[0]), /Only Group A reads this/);
  });

  test("a host session covering a cancelled week reminds her about the visit's week alone", async () => {
    groupACopy(2);
    at("2026-10-21T12:00:00Z");
    const cancelled = await call("amelia", change.POST, { groupId: GROUP.a }, {
      body: { week: 2, dateKey: "2026-10-26", kind: "cancel", reason: "Amelia is away.", tell: false },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    visitA(3);
    await runJob(A_DUE.a3one);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(mailTo("chloe")[0].subject, "Week 3: your session is tomorrow", "her week 2 was Group B's");
    assert.doesNotMatch(await textOf(mailTo("chloe")[0]), /Week 2 isn’t finished/);
    assert.equal(mailTo("ana")[0].subject, "Weeks 2 and 3: your session is tomorrow");
  });

  test("with no visit: Group A's reminders never reach her", async () => {
    await runJob(A_DUE.a2three);
    assert.equal(mailTo("chloe").length, 0);
    assert.equal(marker("chloe", 3, "w02", GROUP.a), undefined);
  });

  test("ONE reminder at each of the two moments, the host's session's, in the reminder's own sentences; none of her own group's that week", async () => {
    visitA(2);
    const others = {};
    for (const [moment, instant] of [["a3", A_DUE.a2three], ["b3", DUE.b2three], ["a1", A_DUE.a2one], ["b1", DUE.b2one]]) {
      await runJob(instant);
      others[moment] = mailTo("amara").length;
    }
    const mine = mailTo("chloe");
    assert.deepEqual(mine.map((message) => message.subject), ["Week 2: your session is on Mon 26 Oct", "Week 2: your session is tomorrow"]);
    for (const message of mine) {
      const text = await textOf(message);
      assert.ok(text.includes(NOTICE_LINE), text);
      // The host's day, time, room and facilitator; Can't make it, which her visit's card offers.
      assert.ok(text.includes(`${A2()} ${CANT_MAKE_IT}`), text);
      assert.doesNotMatch(text, /Group B|Rahul|Sofia|Tue 27 Oct/, "nothing of her own group's session that week");
      assert.match(text, new RegExp(BUTTON));
    }
    // Her markers: the host's, sent; her own group's, never written (she is not in its audience that week).
    assert.ok(marker("chloe", 3, "w02", GROUP.a).sentAt);
    assert.ok(marker("chloe", 1, "w02", GROUP.a).sentAt);
    assert.equal(marker("chloe", 3, "w02", GROUP.b), undefined);
    assert.equal(marker("chloe", 1, "w02", GROUP.b), undefined);
    // Everybody else as ever: Group B's two, Group A's own two.
    assert.deepEqual(others, { a3: 0, b3: 1, a1: 1, b1: 2 });
    for (const uid of ["amara", "farah"]) {
      const texts = await Promise.all(mailTo(uid).map(textOf));
      assert.equal(texts.length, 2);
      for (const text of texts) assert.ok(text.includes(`${B2()} ${CANT_MAKE_IT}`), text);
    }
    assert.equal(mailTo("ana").length, 2);
    assert.ok((await textOf(mailTo("ana")[0])).includes(`${A2()} ${CANT_MAKE_IT}`));
  });

  test("the week after the visit: her own group's reminder, as for everybody in it, and none of the host's", async () => {
    visitA(2);
    await runJob(A_DUE.a3three);
    await runJob(A_DUE.a3one);
    assert.equal(mailTo("chloe").length, 0, "Group A's week 3 is not hers");
    assert.equal(marker("chloe", 1, "w03", GROUP.a), undefined);
    await runJob(DUE.b3one);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(mailTo("chloe")[0].subject, "Week 3: your session is tomorrow");
    const text = await textOf(mailTo("chloe")[0]);
    assert.ok(text.includes(`${B3} ${CANT_MAKE_IT}`), text);
    // Word for word what Amara is sent but for the greeting.
    const amara = await textOf(mailTo("amara").at(-1));
    assert.equal(text.replace(/Hi Chloe,/, "Hi Amara,"), amara);
  });

  test("an online host session with a link: the link sentence, as her visit's card shows that link", async () => {
    const LINK = "https://meet.example.com/abc-defg-hij";
    world.db.poke(`courseGroups/${GROUP.a}`, { session: { ...read(`courseGroups/${GROUP.a}`).session, meetingUrl: LINK }, sessionModes: { w02: "virtual" } });
    visitA(2);
    at(A_DUE.a2three);
    const page = await call("chloe", overview.GET, { runId: RUN });
    assert.equal(page.status, 200);
    assert.equal(page.body.visits?.length, 1, "her page draws the visit's card");
    assert.equal(page.body.visits[0].meetingUrl, LINK, "with the host's link for that session");
    await runJob(A_DUE.a2three);
    const text = await textOf(mailTo("chloe")[0]);
    assert.ok(text.includes(`${A2(", online", " The link is on your programme page.")} ${CANT_MAKE_IT}`), text);
  });

  test("excused at home and visiting: due at the host, and reminded of its session", async () => {
    // An admin approved her request to be excused from her own group's week 2 session.
    world.db.seed("courseRequests/excused-chloe", {
      kind: "excused",
      status: "approved",
      runId: RUN,
      groupId: GROUP.b,
      subjectUid: "chloe",
      askedByUid: "chloe",
      reason: "",
      reasonHeld: false,
      sessionKey: "w02",
      weekId: "w02",
      change: { weeks: [{ sessionKey: "w02", weekId: "w02", status: "approved" }] },
    });
    visitA(2);
    await runJob(A_DUE.a2three);
    assert.equal(mailTo("chloe").length, 1);
    assert.ok((await textOf(mailTo("chloe")[0])).includes(`${A2()} ${CANT_MAKE_IT}`));
    await runJob(DUE.b2three);
    assert.equal(mailTo("chloe").length, 1, "nothing from her own group, whose session she is excused from and not due at");
  });

  test("not coming is asked of the host's session: her Can't make it there and she is not told to come", async () => {
    visitA(2);
    at("2026-10-21T12:00:00Z");
    const said = await pressedBefore(world.db, GROUP.a, "chloe", () =>
      call("chloe", cantMakeIt.POST, { groupId: GROUP.a }, { body: { sessionKey: "w02", cantMakeIt: true } }),
    );
    assert.equal(said.status, 200, JSON.stringify(said.body));
    await runJob(A_DUE.a2three);
    // Her week 2 is not done: the reminder about what is left, never the session's.
    assert.equal(mailTo("chloe").length, 1);
    const text = await textOf(mailTo("chloe")[0]);
    assert.ok(text.includes(LEFT_NOTICE_LINE), text);
    assert.doesNotMatch(text, new RegExp(escape(CANT_MAKE_IT)));
    await finishWeek("chloe", 2);
    await runJob(A_DUE.a2one);
    assert.equal(mailTo("chloe").length, 1);
    assert.equal(marker("chloe", 1, "w02", GROUP.a).skippedReason, "excused");
  });

  test("the certificate sentence is the one her programme page says", async () => {
    world.db.seed(`courseFinishing/${RUN}`, { kind: "rule", runId: RUN, atLeast: 4, setAt: new Date("2026-10-01T09:00:00Z") });
    visitA(2);
    at(A_DUE.a2three);
    const page = await call("chloe", overview.GET, { runId: RUN });
    assert.equal(page.status, 200);
    assert.ok(page.body.certificateNeeds, "her page says what a certificate needs");
    await runJob(A_DUE.a2three);
    const text = await textOf(mailTo("chloe")[0]);
    assert.ok(text.includes(page.body.certificateNeeds), `${text}\n${page.body.certificateNeeds}`);
  });

  test("the certificate sentence counts the session she went to: the host's held, never her own group's marked not held", async () => {
    // A rule of every session, so the sentence says how many are due.
    world.db.seed(`courseFinishing/${RUN}`, { kind: "rule", runId: RUN, atLeast: 6, setAt: new Date("2026-10-01T09:00:00Z") });
    visitA(2);
    const register = (groupId, held, records) => ({
      runId: RUN,
      groupId,
      weekNumber: 2,
      occurrence: 1,
      records,
      held,
      pushedAt: new Date("2026-10-27T21:00:00Z"),
      pushedByUid: "zach",
    });
    world.db.seed(registerPath(GROUP.a, 2), register(GROUP.a, true, { ana: "present", chloe: "present" }));
    world.db.seed(registerPath(GROUP.b, 2), register(GROUP.b, false, {}));
    at(DUE.b3one);
    const page = await call("chloe", overview.GET, { runId: RUN });
    assert.equal(page.status, 200);
    await runJob(DUE.b3one);
    const text = await textOf(mailTo("chloe").at(-1));
    assert.ok(page.body.certificateNeeds && text.includes(page.body.certificateNeeds), `${text}\n${page.body.certificateNeeds}`);
    // Amara, whose week 2 session is the one marked not held, is told one session fewer.
    const amara = await textOf(mailTo("amara").at(-1));
    const count = (said) => Number(/you need to come to at least (\d+)/.exec(said)?.[1]);
    assert.equal(count(text), count(amara) + 1, `${text}\n${amara}`);
  });

  test("what her page shows, as the rule answers it: her visit's card, but no card at all where the page draws none", () => {
    const place = { groupId: GROUP.b, groupsByWeek: null, visits: [{ weekNumber: 2, groupId: GROUP.a, arrangedByUid: "zach", arrangedAt: START }] };
    const visit = { weekNumber: 2, occurrence: 1, liveGroupIds: [GROUP.a, GROUP.b], notHeld: false, facilitatesOwnGroup: false };
    assert.deepEqual(programmePageShowsSession(place, GROUP.a, visit), { cantMakeIt: true, joinOnline: true });
    // Her own group's session is still hers on her page: its card is her group's.
    assert.deepEqual(programmePageShowsSession(place, GROUP.b, visit), { cantMakeIt: true, joinOnline: true });
    // She facilitates her own group: her own Can't make it is the instant one, and the visit's card offers none.
    assert.deepEqual(programmePageShowsSession(place, GROUP.a, { ...visit, facilitatesOwnGroup: true }), { cantMakeIt: false, joinOnline: true });
    // No card: the session's register says it was not held, her own group no longer meets, the week's second session, another week, no visit described.
    const neither = { cantMakeIt: false, joinOnline: false };
    assert.deepEqual(programmePageShowsSession(place, GROUP.a, { ...visit, notHeld: true }), neither);
    assert.deepEqual(programmePageShowsSession(place, GROUP.a, { ...visit, liveGroupIds: [GROUP.a] }), neither);
    assert.deepEqual(programmePageShowsSession(place, GROUP.a, { ...visit, occurrence: 2 }), neither);
    assert.deepEqual(programmePageShowsSession(place, GROUP.a, { ...visit, weekNumber: 3 }), neither);
    assert.deepEqual(programmePageShowsSession(place, GROUP.a), neither);
  });
});
