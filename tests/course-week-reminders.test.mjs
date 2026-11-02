/**
 * THE REMINDERS BEFORE A SESSION (`courses-week-reminders`): 3 days and 1 day
 * before each of a group's sessions, at 9am in London, one email to each
 * person holding a place in the group whose week is not done, listing what is
 * left of it. The real job, run against one course run.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO IS DUE, AND WHEN. Every session that meets has two reminders, each
 *     due from 9am on its day until twelve hours later and never once the
 *     session has started; either side of the clocks going back.
 *  2. ONLY THE PEOPLE WHOSE WEEK IS NOT DONE. "Done" is the one meaning
 *     (`weekDone`): submitted, and every reading its tasks count ticked.
 *     Somebody who finishes after the 3-day reminder is not sent the 1-day
 *     one. A week submitted with a reading left unticked takes no more work,
 *     and is not reminded about.
 *  3. ONE MARKER EACH. A claim per person per reminder, stamped with why
 *     nobody was mailed when nobody was; two ticks at once send once; a
 *     reminder too late to be worth sending is stamped stale, once.
 *  4. THE SESSION THAT MEETS. A cancelled evening has no reminders; the
 *     session after it covers both weeks, each with its own list. A moved
 *     session is reminded about on its new date.
 *  5. A NOTICE. Everybody holding a place, whatever they unsubscribed from;
 *     a suppressed address is the one thing that stops it; the line saying
 *     why above the words; no unsubscribe; nobody else (not a facilitator
 *     holding no place, not somebody nobody has told their group).
 *  6. ONLY WEEKS WRITTEN AS BLOCKS, AND PUBLISHED, are reminded about.
 *  7. IT SHIPS SWITCHED OFF, and the tick runs it only when it is on.
 *
 * Built on `tests/lib/registerWorld.mjs`: the run starts on Thursday 15
 * October 2026; Group B meets on Tuesdays from 6pm to 8pm in Room C20 (Rahul
 * and Sofia facilitate; Amara, Chloe and Farah are in it), Group A on Mondays
 * (Amelia; Ana). Here weeks 2 and 3 are written as blocks: two readings in
 * part 1 and a written answer in part 2.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { GROUP, RUN, jobContext, makeWorld, seedWorld } from "./lib/registerWorld.mjs";

const made = makeWorld("__weekReminders");
const { world, reset, call, courseRoute, lib, loadTs } = made;

const { weekRemindersJob, dueReminders } = await lib("scheduler", "jobs", "weekReminders.ts");
const { JOBS, SCHEDULER_JOB_IDS, jobDefaultEnabled } = await lib("scheduler", "registry.ts");
const { resolveSessions } = await lib("courses", "sessions.ts");
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const tickRoute = await courseRoute("runs", "[runId]", "ticks", "[itemId]");
const writeRoute = await courseRoute("runs", "[runId]", "written-answers", "[answerId]");
const submitRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "submit");
const change = await courseRoute("groups", "[groupId]", "session", "change");
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
// 2. Only the people whose week is not done
// ===========================================================================

describe("2. only the people whose week is not done", () => {
  test("a week submitted with every reading ticked is done: nobody reminds them, and the marker says why", async () => {
    await finishWeek("amara", 2);
    await runJob(DUE.b2three);
    assert.equal(mailTo("amara").length, 0);
    assert.equal(marker("amara", 3).skippedReason, "done");
    assert.equal(mailTo("chloe").length, 1);
  });

  test("finishing the week after the 3-day reminder stops the 1-day one", async () => {
    await runJob(DUE.b2three);
    assert.equal(mailTo("chloe").length, 1);
    at("2026-10-25T12:00:00Z");
    await finishWeek("chloe", 2);
    await runJob(DUE.b2one);
    assert.equal(mailTo("chloe").length, 1, "no second reminder");
    assert.equal(marker("chloe", 1).skippedReason, "done");
    assert.equal(mailTo("farah").length, 2, "and the others still get theirs");
  });

  test("a week submitted with a reading left unticked takes no more work: no reminder, stamped submitted", async () => {
    await finishWeek("farah", 2, { tickBoth: false });
    await runJob(DUE.b2three);
    assert.equal(mailTo("farah").length, 0);
    assert.equal(marker("farah", 3).skippedReason, "submitted");
  });

  test("the reminder lists what is left, the check's own lines, and that the week is not submitted", async () => {
    // Chloe ticked one of the two readings and has written nothing yet.
    await finishWeek("chloe", 2, { tickBoth: false, submit: false });
    await runJob(DUE.b2one);
    const [message] = mailTo("chloe");
    assert.equal(message.kind, "notice");
    assert.equal(message.surface, "course-week-reminder");
    assert.equal(message.listUnsubscribe, undefined, "a notice offers no unsubscribe");
    const text = await textOf(message);
    assert.match(text, /Hi Chloe, Sent as an important notice You are getting this because our records show this week’s work isn’t finished, so it reaches you whatever your notification settings say, and it is never marketing\./);
    assert.match(text, /Your AGI Strategy Fellowship session is tomorrow, Tue 27 Oct at 6pm in Room C20\./);
    assert.match(
      text,
      /Week 2 isn’t finished yet: \* One reading isn’t ticked: “Who keeps the lamps”\. \* Your written answer is empty\. \* Week 2 isn’t submitted\./,
    );
    assert.match(text, /Finish week 2 https:\/\/naisi\.invalid\/learn\/[^ ]+\/weeks\/2/);
    assert.match(text, /Submitting it, with every reading ticked, stops these reminders\. Your work locks when the session starts\./);
    assert.doesNotMatch(text, /unsubscribe|\b(mark|grade|score)\b/i);
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
    assert.match(text, /Your AGI Strategy Fellowship session is tomorrow, Tue 3 Nov at 6pm in Room C20\./);
    assert.match(text, /Week 2 isn’t finished yet: .* Week 2 isn’t submitted\. Week 3 isn’t finished yet: .* Week 3 isn’t submitted\./);
    assert.match(text, /Finish week 2/);
    assert.match(text, /Submitting each week, with every reading ticked, stops these reminders\./);
    assert.ok(marker("amara", 1, "w03"), "claimed on the session that meets");
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
    assert.match(await textOf(mailTo("amara")[0]), /tomorrow, Wed 28 Oct at 7pm in Room D1\./);
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

describe("6. only weeks written as blocks, and published", () => {
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
