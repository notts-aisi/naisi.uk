/**
 * HOW A REGISTER ENDS (wk-register, option B): the real handlers and the real
 * jobs, driven against one course run in its second week.
 *
 *  1. FINISHING. While next week's email is on its schedule, "Finish the
 *     register" locks it, rebuilds everyone's attendance record, shows people
 *     their marks, closes the follow-up card, and emails NOBODY. While it is
 *     not, "Push attendance" does all that and sends the email, as it always
 *     has: the job's switch is the switch between the two.
 *  2. "WEEK N IS OPEN" ON ITS SCHEDULE. Six days before each session, at 9am
 *     in London, on either side of the clocks going back, the group's first
 *     session included; once per group per session; held while its week is
 *     unpublished and sent once it is; never sent once the session has started;
 *     held whole, with a card for the lead and the admins, when a value is
 *     empty; never a meeting link; a notice, so it reaches everybody holding a
 *     place in the group whatever they unsubscribed from, and nobody else.
 *  3. THE CHASE. One reminder to the group's facilitators 36 hours after the
 *     session ENDS, and a task for the programme's lead and the admins at 60.
 *  4. WHO MAY FINISH. A facilitator of the group or an admin; nobody else, and
 *     nobody during a view-as session.
 *  5. WHAT THE REGISTER SAYS about all of this, from records.
 *
 * Mail goes to a stand-in door that writes down what it was handed
 * (`tests/lib/registerWorld.mjs`); every message is rendered to text with the
 * real template before anything is said about its words.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import {
  AT,
  GROUP,
  OTHER_RUN,
  RUN,
  jobContext,
  makeWorld,
  registerPath,
  seedWorld,
} from "./lib/registerWorld.mjs";

const made = makeWorld();
const { world, reset, call, courseRoute, lib, loadTs } = made;

const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const overview = await courseRoute("runs", "[runId]", "overview");
const tick = await loadTs("app/api/scheduler/tick/route.ts");
const { nextWeekEmailJob } = await lib("scheduler", "jobs", "nextWeekEmail.ts");
const { registerRemindersJob } = await lib("scheduler", "jobs", "registerReminders.ts");
const { unmarkedRegistersJob } = await lib("scheduler", "jobs", "unmarkedRegisters.ts");
const { SCHEDULER_JOB_IDS } = await lib("scheduler", "registry.ts");
const { heldEmailTaskId } = await lib("courses", "heldEmailTask.ts");
const { registerFollowUpTaskId } = await lib("courses", "unmarkedRegisters.ts");
const { registerEndingWords } = await loadTs("features/courses/registerEndingWords.ts");

mock.timers.enable({ apis: ["Date"], now: AT.week1Evening });
const at = (instant) => mock.timers.setTime(instant.getTime());

const HOUR = 3_600_000;
/** Group B's week 1 session ends Tuesday 20 October at 8pm BST. */
const WEEK1_ENDS = new Date("2026-10-20T19:00:00Z");
const afterEnd = (hours) => new Date(WEEK1_ENDS.getTime() + hours * HOUR);

const MEMBERS_B = ["amara", "chloe", "farah"];
const address = (uid) => `${uid}@example.com`;
const mailTo = (uid) => world.mail.filter((message) => message.to === address(uid));
/** The "Week N is open" emails one person was sent about week `n`. */
const weekMail = (uid, n) => mailTo(uid).filter((message) => message.subject.startsWith(`Week ${n} is open`));
const read = (path) => world.db.read(path);

/** A message as its reader sees it: the real template, rendered to text. */
async function textOf(message) {
  return (await render(message.react, { plainText: true })).replace(/\s+/g, " ");
}

/** Every member of a group marked, as the facilitator taps them in. */
async function markAll(who, groupId, weekNumber, members, status = "present") {
  const response = await call(
    who,
    register.POST,
    { groupId },
    { body: { weekNumber, marks: members.map((uid) => ({ uid, status })) } },
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response;
}

const finish = (who, groupId, weekNumber, extra = {}, options = {}) =>
  call(who, push.POST, { groupId }, { body: { weekNumber, ...extra }, ...options });

/** One run of a job, as the tick hands it over, at `instant`. */
async function runJob(job, instant, options) {
  at(instant);
  return job.handler(jobContext(job, instant, options).ctx);
}

/** The switches, set as an admin sets them on Site status. */
function switches({ scheduled, reminders, tasks }) {
  const jobs = { ...(read("config/scheduler")?.jobs ?? {}) };
  if (scheduled !== undefined) jobs["courses-next-week-email"] = { enabled: scheduled };
  if (reminders !== undefined) jobs["courses-register-reminders"] = { enabled: reminders };
  if (tasks !== undefined) jobs["courses-unmarked-registers"] = { enabled: tasks };
  world.db.seed("config/scheduler", { enabled: true, jobs });
}

const gnudgeFor = (groupId, slotStartKey, runId = RUN) =>
  `courseNudges/gnudge__${runId}__${groupId}__${slotStartKey}`;
/** Week 2's slot starts Thursday 22 October. */
const WEEK2_SLOT = "2026-10-22";
/** Week 1's slot starts Thursday 15 October, the run's first day. */
const WEEK1_SLOT = "2026-10-15";
/** Week 3's slot starts Thursday 29 October. */
const WEEK3_SLOT = "2026-10-29";

beforeEach(() => {
  at(AT.week1Evening);
  reset(seedWorld());
});

// ===========================================================================
// 1. Finishing
// ===========================================================================

describe("Finish the register, while next week's email is on its schedule", () => {
  beforeEach(() => reset(seedWorld({ scheduled: true })));

  test("locks it, rebuilds the totals, shows the marks and emails nobody", async () => {
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const done = await finish("rahul", GROUP.b, 1);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.alreadyPushed, false);
    assert.equal(done.body.scheduled, true);
    assert.equal(done.body.mirrored, MEMBERS_B.length, "every member's record was rebuilt");
    assert.equal(done.body.sent, 0);
    assert.match(done.body.reason, /emailed nobody/);

    const stored = read(registerPath(GROUP.b, 1));
    assert.ok(stored.pushedAt instanceof Date, "the register is locked");
    assert.equal(stored.pushedByUid, "rahul");
    for (const uid of MEMBERS_B) {
      assert.equal(read(`courseEnrolments/${RUN}__${uid}`).attendance.lastPushedSessionKey, "w01");
    }
    assert.deepEqual(world.mail, [], "nobody was emailed");
    assert.equal(read(gnudgeFor(GROUP.b, WEEK2_SLOT)), undefined, "and nothing was claimed");
    const audit = world.db.paths().filter((path) => path.startsWith("courseAudit/"));
    assert.ok(
      audit.some((path) => read(path).kind === "attendance-push"),
      "the finish is on the record",
    );
  });

  test("a second press changes nothing and says so", async () => {
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    await finish("rahul", GROUP.b, 1);
    const again = await finish("sofia", GROUP.b, 1);
    assert.equal(again.status, 200);
    assert.equal(again.body.alreadyPushed, true);
    assert.equal(again.body.mirrored, 0);
    assert.equal(again.body.sent, 0);
    assert.match(again.body.reason, /already finished/);
    assert.deepEqual(world.mail, []);
  });

  test("a finished register refuses a tap, and an admin's correction works as before", async () => {
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    await finish("rahul", GROUP.b, 1);
    const tap = await call("rahul", register.POST, { groupId: GROUP.b }, {
      body: { weekNumber: 1, marks: [{ uid: "amara", status: "late" }] },
    });
    assert.equal(tap.status, 409);
    const refused = await call("rahul", register.PATCH, { groupId: GROUP.b }, {
      body: { weekNumber: 1, marks: [{ uid: "amara", status: "late" }] },
    });
    assert.equal(refused.status, 403, "a facilitator does not correct a finished register");
    const corrected = await call("zach", register.PATCH, { groupId: GROUP.b }, {
      body: { weekNumber: 1, marks: [{ uid: "amara", status: "late" }] },
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    assert.equal(corrected.body.marked, 1);
    assert.ok(corrected.body.logged >= 1);
    assert.equal(read(registerPath(GROUP.b, 1)).records.amara, "late");
    assert.equal(read(`courseEnrolments/${RUN}__amara`).attendance.late, 1, "the totals follow");
    assert.deepEqual(world.mail, []);
  });

  test("members see their mark only once the register is finished", async () => {
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const before = await call("amara", overview.GET, { runId: RUN });
    assert.equal(before.status, 200, JSON.stringify(before.body).slice(0, 300));
    assert.deepEqual(
      before.body.ownAttendance?.sessions ?? [],
      [],
      "a register still being taken shows nobody anything",
    );
    await finish("rahul", GROUP.b, 1);
    const after = await call("amara", overview.GET, { runId: RUN });
    assert.deepEqual(
      after.body.ownAttendance.sessions.map((s) => [s.sessionKey, s.status]),
      [["w01", "present"]],
    );
    assert.equal(after.body.ownAttendance.rollup.attendedInFull, 1);
  });

  test("finishing closes the task the chase raised", async () => {
    at(afterEnd(61));
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const taskPath = `tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`;
    world.db.seed(taskPath, {
      title: "Register not finished: Group B, week 1",
      source: "course-register",
      sourceRef: { cohortId: RUN, weekNumber: 1, groupId: GROUP.b, sessionKey: "w01" },
      completerUids: ["claudia", "zach"],
      archived: false,
    });
    await finish("rahul", GROUP.b, 1);
    assert.equal(read(taskPath).archived, true);
  });

  test("an admin's resend never sends an email that has not gone yet", async () => {
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    await finish("rahul", GROUP.b, 1);
    const early = await finish("zach", GROUP.b, 1, { force: true });
    assert.equal(early.status, 200);
    assert.equal(early.body.sent, 0);
    assert.match(early.body.reason, /hasn’t gone yet/);
    assert.deepEqual(world.mail, []);

    // Once the schedule has sent it, the resend re-sends it, and says so on the claim.
    await runJob(nextWeekEmailJob, AT.groupBDue);
    at(AT.week1Evening);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1);
    const resent = await finish("zach", GROUP.b, 1, { force: true });
    assert.equal(resent.body.sent, MEMBERS_B.length);
    assert.equal(resent.body.forced, true);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 2, "this group, and no other");
    assert.equal(mailTo("ana").length, 1);
    assert.equal(read(gnudgeFor(GROUP.b, WEEK2_SLOT)).forceCount, 1);
    const refused = await finish("rahul", GROUP.b, 1, { force: true });
    assert.equal(refused.status, 403, "a facilitator cannot force a resend");
  });
});

describe("Push attendance, while next week's email is not on its schedule", () => {
  test("pushing sends the group next week's email, once, as it always has", async () => {
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const done = await finish("rahul", GROUP.b, 1);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.scheduled, false);
    assert.equal(done.body.sent, MEMBERS_B.length);
    for (const uid of MEMBERS_B) {
      assert.equal(mailTo(uid).length, 1, `${uid} heard once`);
      assert.equal(mailTo(uid)[0].kind, "notice");
      assert.equal(mailTo(uid)[0].surface, "course-week");
      assert.equal(mailTo(uid)[0].listUnsubscribe, undefined);
    }
    const marker = read(gnudgeFor(GROUP.b, WEEK2_SLOT));
    assert.equal(marker.via, "push");
    assert.equal(marker.sentByUid, "rahul");
    assert.equal(marker.pushedSessionKey, "w01");
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Week 2 of AGI Strategy Fellowship is open: Week 2 theme\. Your next session is Tue 27 Oct at 6pm in Room C20\./);
    assert.match(text, /Sent as an important notice/);

    const again = await finish("rahul", GROUP.b, 1);
    assert.equal(again.body.alreadyPushed, true);
    assert.match(again.body.reason, /already pushed, so nothing was sent again/);
    assert.equal(world.mail.length, MEMBERS_B.length);
  });

  test("an empty room still leaves the email without it here, exactly as before", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "" });
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const done = await finish("rahul", GROUP.b, 1);
    assert.equal(done.body.sent, MEMBERS_B.length, "the push lane keeps today's behaviour");
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Your next session is Tue 27 Oct at 6pm\./);
    assert.doesNotMatch(text, /Room C20/);
  });
});

// ===========================================================================
// 2. Next week's email on its schedule
// ===========================================================================

describe("Week N is open on its schedule", () => {
  beforeEach(() => reset(seedWorld({ scheduled: true })));

  test("goes six days before, at 9am in London, either side of the clocks going back", async () => {
    // Group A meets Monday 26 October at 6pm. Six days before is Tuesday 20
    // October at 9am, still BST: 8am UTC.
    await runJob(nextWeekEmailJob, AT.beforeGroupA);
    assert.equal(weekMail("ana", 2).length, 0, "not a minute early");
    await runJob(nextWeekEmailJob, AT.groupADue);
    assert.equal(weekMail("ana", 2).length, 1, "on the minute");
    assert.equal(read(gnudgeFor(GROUP.a, WEEK2_SLOT)).via, "schedule");
    await runJob(nextWeekEmailJob, AT.groupAElapsed);
    assert.equal(weekMail("ana", 2).length, 1, "and once");

    // Group B meets Tuesday 27 October: Wednesday 21 October at 9am BST.
    await runJob(nextWeekEmailJob, AT.beforeGroupB);
    for (const uid of MEMBERS_B) assert.equal(weekMail(uid, 2).length, 0);
    await runJob(nextWeekEmailJob, AT.groupBDue);
    for (const uid of MEMBERS_B) assert.equal(weekMail(uid, 2).length, 1, `${uid} on time`);
    await runJob(nextWeekEmailJob, new Date(AT.groupBDue.getTime() + 15 * 60_000));
    for (const uid of MEMBERS_B) assert.equal(weekMail(uid, 2).length, 1, `${uid} once`);

    const [message] = weekMail("amara", 2);
    assert.equal(message.subject, "Week 2 is open: Week 2 theme");
    const text = await textOf(message);
    assert.match(text, /Hi Amara, .*Week 2 of AGI Strategy Fellowship is open: Week 2 theme\. Your next session is Tue 27 Oct at 6pm in Room C20\./);
    assert.match(text, /Something to read or watch/);
    assert.match(text, /Open week 2/);

    // Week 3, after the clocks have gone back: Wednesday 28 October at 9am GMT.
    world.db.poke(`courseRuns/${RUN}/weeks/w03`, { published: true });
    await runJob(nextWeekEmailJob, new Date(AT.groupBWeek3Due.getTime() - 60_000));
    for (const uid of MEMBERS_B) assert.equal(weekMail(uid, 3).length, 0, `${uid}: week 3's email is a minute away`);
    await runJob(nextWeekEmailJob, AT.groupBWeek3Due);
    for (const uid of MEMBERS_B) assert.equal(weekMail(uid, 3).length, 1, `${uid}: week 3's email at 9am GMT`);
    assert.equal(read(gnudgeFor(GROUP.b, WEEK3_SLOT)).via, "schedule");
  });

  test("the group's first session too: Week 1 is open goes six days before it", async () => {
    // Group B's week 1 meets on Tuesday 20 October: six days before is
    // Wednesday 14 October at 9am BST. (Group A's, on the Monday, went a day
    // before it.)
    await runJob(nextWeekEmailJob, new Date("2026-10-14T07:59:00Z"));
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 0, uid);
    assert.equal(weekMail("ana", 1).length, 1, "Group A's own week 1, a day earlier");
    await runJob(nextWeekEmailJob, new Date("2026-10-14T08:00:00Z"));
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, uid);
    assert.equal(mailTo("amara")[0].subject, "Week 1 is open: Week 1 theme");
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Your first session is Tue 20 Oct at 6pm in Room C20\./);
    assert.ok(read(gnudgeFor(GROUP.b, WEEK1_SLOT)));
  });

  test("two ticks at once send it once", async () => {
    at(AT.groupBDue);
    const ctx = () => jobContext(nextWeekEmailJob, AT.groupBDue).ctx;
    await Promise.all([nextWeekEmailJob.handler(ctx()), nextWeekEmailJob.handler(ctx())]);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, `${uid} once`);
  });

  test("held while its week is unpublished, and sent once it is published", async () => {
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { published: false });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("amara").length, 0);
    assert.equal(read(gnudgeFor(GROUP.b, WEEK2_SLOT)), undefined, "held, not claimed");
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { published: true });
    await runJob(nextWeekEmailJob, new Date("2026-10-23T10:00:00Z"));
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1);
  });

  test("an unpublished week whose session has started is never sent about", async () => {
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { published: false });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { published: true });
    await runJob(nextWeekEmailJob, AT.groupBStarts);
    await runJob(nextWeekEmailJob, new Date(AT.groupBStarts.getTime() + HOUR));
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 0);
    assert.equal(read(gnudgeFor(GROUP.b, WEEK2_SLOT)), undefined);
  });

  test("a missing value holds the whole email and tells the lead and the admins, once", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    await runJob(nextWeekEmailJob, new Date(AT.groupBDue.getTime() + 15 * 60_000));
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 0, "nobody gets half an email");
    assert.equal(read(gnudgeFor(GROUP.b, WEEK2_SLOT)), undefined);

    const cards = world.db
      .paths()
      .filter((path) => path.startsWith("tasks/") && path.endsWith("__email"));
    assert.deepEqual(cards, [`tasks/${heldEmailTaskId(RUN, GROUP.b, "w02")}`], "one card");
    const card = read(cards[0]);
    assert.deepEqual(card.completerUids, ["claudia", "zach"], "the lead, then the admins");
    assert.equal(card.visibility, "committee");
    assert.equal(card.title, "Week 2’s email held: Group B");
    assert.match(card.description, /missing the group’s room/);
    assert.ok(card.initialNotifyAt instanceof Date, "born notified, so it emails nobody");
    assert.equal(card.sourceRef.sessionKey, undefined, "finishing a register never closes it");
    for (const uid of ["claudia", "zach"]) {
      assert.equal(mailTo(uid).length, 0, `${uid} is told on the board, not by email`);
    }

    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "Room C20" });
    await runJob(nextWeekEmailJob, new Date(AT.groupBDue.getTime() + 30 * 60_000));
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, "it goes once it can");
    assert.equal(read(cards[0]).archived, true, "and the card has done its job");
  });

  test("a week that asks for nothing, one with no title, or a room holding a link, holds it too", async () => {
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { materials: [], estimatedMinutes: null });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("amara").length, 0);
    assert.match(read(`tasks/${heldEmailTaskId(RUN, GROUP.b, "w02")}`).description, /what week 2 asks for/);

    reset(seedWorld({ scheduled: true }));
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { title: "" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("amara").length, 0);
    assert.match(read(`tasks/${heldEmailTaskId(RUN, GROUP.b, "w02")}`).description, /week 2’s title/);

    reset(seedWorld({ scheduled: true }));
    world.db.poke(`courseGroups/${GROUP.b}`, {
      "session.location": "https://zoom.example.com/j/123456789",
    });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("amara").length, 0, "a link is never printed as a room");
  });

  test("never a meeting link: an online week says Online", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, {
      "session.meetingUrl": "https://meet.example.com/abc-defg-hij",
      // The week's virtual switch, as the session route stores it.
      sessionModes: { w02: "virtual" },
    });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Your next session is Tue 27 Oct at 6pm, online\./);
    assert.doesNotMatch(text, /meet\.example\.com/);
    for (const message of world.mail) {
      assert.doesNotMatch(JSON.stringify(message.subject), /meet\.example\.com/);
    }
  });

  test("a notice: everybody holding a place in the group, whatever they switched off, and nobody else", async () => {
    world.db.poke("users/chloe", { "profile.notifications": { categories: { courses: false } } });
    world.db.poke(`subscriptions/sub_amara__cohort-${RUN}`, { subscribed: false });
    world.db.seed("suppressedEmails/farah@example.com", { email: "farah@example.com" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("amara").length, 1, "unsubscribed from the run's list, and reached: it is a notice");
    assert.equal(mailTo("chloe").length, 1, "switched course email off, and reached: it is a notice");
    assert.equal(mailTo("farah").length, 0, "a suppressed address is the one thing that stops it");
    assert.equal(mailTo("ana").length, 1, "Group A's own email, not Group B's");
    assert.equal(mailTo("nell").length, 0, "on no run");
    for (const uid of ["rahul", "sofia", "claudia", "zach"]) {
      assert.equal(mailTo(uid).length, 0, `${uid} is not a member of the group`);
    }
  });

  test("a run no programme names still gets its email", async () => {
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("dev").length, 1);
    assert.equal(read(gnudgeFor(GROUP.other, WEEK2_SLOT, OTHER_RUN)).via, "schedule");
  });

  test("once the schedule has sent it, a push after the switch is turned off sends nothing", async () => {
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(world.mail.length, MEMBERS_B.length + 2);
    switches({ scheduled: false });
    at(new Date(AT.groupBDue.getTime() + HOUR));
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const done = await finish("rahul", GROUP.b, 1);
    assert.equal(done.body.scheduled, false);
    assert.equal(done.body.sent, 0);
    assert.match(done.body.reason, /already had the reminder/);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1);
  });

  test("once a push has sent it, the schedule sends nothing", async () => {
    switches({ scheduled: false });
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    await finish("rahul", GROUP.b, 1);
    switches({ scheduled: true });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1);
  });
});

describe("the tick runs next week's email only while its switch is on", () => {
  /** Every other job switched off, so the tick runs these three alone. */
  function onlyRegisterJobs({ scheduled }) {
    const jobs = {};
    for (const id of SCHEDULER_JOB_IDS) jobs[id] = { enabled: false };
    jobs["courses-next-week-email"] = { enabled: scheduled };
    world.db.seed("config/scheduler", { enabled: true, jobs });
  }

  async function tickAt(instant) {
    at(instant);
    process.env.SCHEDULER_SECRET = "a-scheduler-secret-for-this-suite";
    const response = await tick.POST(
      new Request("https://naisi.invalid/api/scheduler/tick", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-scheduler-key": "a-scheduler-secret-for-this-suite",
        },
        body: JSON.stringify({ depth: 0 }),
      }),
    );
    return response.body;
  }

  test("switched off, it changes nothing; switched on, it sends", async () => {
    onlyRegisterJobs({ scheduled: false });
    const off = await tickAt(AT.groupBDue);
    const entry = off.jobs.find((job) => job.id === "courses-next-week-email");
    assert.equal(entry.skipped, "disabled");
    assert.deepEqual(world.mail, []);
    assert.equal(read(gnudgeFor(GROUP.b, WEEK2_SLOT)), undefined);

    onlyRegisterJobs({ scheduled: true });
    const on = await tickAt(new Date(AT.groupBDue.getTime() + 15 * 60_000));
    assert.equal(on.jobs.find((job) => job.id === "courses-next-week-email").skipped, null);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1);
  });

  test("with no stored switch it is off, as a job that emails ships", async () => {
    const jobs = {};
    for (const id of SCHEDULER_JOB_IDS) jobs[id] = { enabled: false };
    delete jobs["courses-next-week-email"];
    world.db.seed("config/scheduler", { enabled: true, jobs });
    const off = await tickAt(AT.groupBDue);
    assert.equal(off.jobs.find((job) => job.id === "courses-next-week-email").skipped, "disabled");
    assert.deepEqual(world.mail, []);
    // And the push sends it, because the switch the push reads is the same one.
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const done = await finish("rahul", GROUP.b, 1);
    assert.equal(done.body.scheduled, false);
    assert.equal(done.body.sent, MEMBERS_B.length);
  });
});

// ===========================================================================
// 3. The chase
// ===========================================================================

describe("the reminder to the facilitators, 36 hours after the session ends", () => {
  beforeEach(() => reset(seedWorld({ reminders: true })));

  test("one email to each of the group's facilitators, counted from the end", async () => {
    // From the START it would have gone at 5am; from the end it goes at 7am.
    await runJob(registerRemindersJob, afterEnd(35.98));
    assert.equal(mailTo("rahul").length, 0, "not a minute early");
    assert.equal(mailTo("sofia").length, 0);
    await runJob(registerRemindersJob, afterEnd(36));
    assert.equal(mailTo("rahul").length, 1);
    assert.equal(mailTo("sofia").length, 1);
    // Group A met the evening before, so its register reached its own hours
    // earlier, and its facilitator heard once.
    assert.equal(mailTo("amelia").length, 1, "Group A's register is unfinished too");
    for (const uid of ["claudia", "zach", ...MEMBERS_B]) assert.equal(mailTo(uid).length, 0);
    await runJob(registerRemindersJob, afterEnd(36.25));
    assert.equal(mailTo("rahul").length, 1, "once");

    const message = mailTo("rahul")[0];
    // In the register's own word while next week's email is not on its
    // schedule (the walk of stage two's fixes, G9): "pushed", as its button
    // ("Push attendance") and the lead's Overview say.
    assert.equal(message.subject, "Group B’s register isn’t pushed");
    assert.equal(message.kind, "course-facilitator");
    const text = await textOf(message);
    assert.match(text, /Group B’s register for Tue 20 Oct isn’t pushed yet\./);
    assert.match(text, /Push attendance to lock the register/);
    assert.match(text, /If the session didn’t happen, the register can say so, and it still needs pushing\./);
    assert.match(text, /If it’s still not pushed 60 hours after the session, Claudia and admins get a task\./);
    assert.doesNotMatch(text, /finish/i);
    assert.match(text, /learn\/agi-strategy-fellowship-autumn-2026__run00001\/group\/autumn-2026-group-b__grp0000b/);
  });

  test("names the right button once next week's email is on its schedule", async () => {
    switches({ scheduled: true });
    await runJob(registerRemindersJob, afterEnd(36));
    // Every sentence in the register's word for ending it while next week's
    // email is on its schedule: "finished" (the walk of stage two's fixes, G9).
    const message = mailTo("rahul")[0];
    assert.equal(message.subject, "Group B’s register isn’t finished");
    const text = await textOf(message);
    assert.match(text, /Group B’s register for Tue 20 Oct isn’t finished yet\./);
    assert.match(text, /Finish the register to lock it and show everyone their mark\. Nobody’s emailed\./);
    assert.match(text, /If the session didn’t happen, the register can say so, and it still needs finishing\./);
    assert.match(text, /If it’s still not finished 60 hours after the session, Claudia and admins get a task\./);
    assert.doesNotMatch(text, /push/i);
  });

  test("a finished register, or a session that did not happen, is not chased", async () => {
    at(afterEnd(2));
    switches({ scheduled: true });
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    await finish("rahul", GROUP.b, 1);
    const held = await call("amelia", register.POST, { groupId: GROUP.a }, {
      body: { weekNumber: 1, held: false },
    });
    assert.equal(held.status, 200, JSON.stringify(held.body));
    await runJob(registerRemindersJob, new Date("2026-10-21T07:00:00Z"));
    await runJob(registerRemindersJob, afterEnd(36));
    for (const uid of ["rahul", "sofia", "amelia"]) assert.equal(mailTo(uid).length, 0, uid);
    assert.equal(mailTo("pia").length, 1, "the other run's unfinished register is still chased");
  });

  test("skips a facilitator who switched task emails off, or lost their standing, and says so", async () => {
    world.db.poke("users/sofia", { "profile.notifications": { categories: { tasks: false } } });
    world.db.poke("users/rahul", { role: "pending" });
    await runJob(registerRemindersJob, afterEnd(36));
    assert.equal(mailTo("sofia").length, 0);
    assert.equal(mailTo("rahul").length, 0);
    assert.equal(read("schedulerMarkers/regremind__autumn-2026-group-b__grp0000b__w01__sofia").skippedReason, "opted-out");
    assert.equal(read("schedulerMarkers/regremind__autumn-2026-group-b__grp0000b__w01__rahul").skippedReason, "no-standing");
  });

  test("switched off, nothing is sent", async () => {
    reset(seedWorld({ reminders: false }));
    // The tick would not run it at all; here the job is asked directly, so the
    // switch is the tick's, and the job's own copy asks nothing of it.
    const config = read("config/scheduler");
    assert.equal(config.jobs["courses-register-reminders"].enabled, false);
  });
});

describe("the task for the lead and the admins, 60 hours after the session ends", () => {
  test("not at 36 hours; at 60, one card, for the lead and the admins, emailing nobody", async () => {
    const cardPath = `tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`;
    await runJob(unmarkedRegistersJob, afterEnd(59.98));
    assert.equal(read(cardPath), undefined, "not before 60 hours");
    await runJob(unmarkedRegistersJob, afterEnd(60));
    const card = read(cardPath);
    assert.ok(card, "the card is raised");
    assert.deepEqual(card.completerUids, ["claudia", "zach"]);
    assert.equal(card.title, "Register not finished: Group B, week 1");
    assert.match(card.description, /press Push attendance/);
    assert.ok(card.initialNotifyAt instanceof Date);
    assert.deepEqual(card.pendingNotifyUids, []);
    assert.equal(card.visibility, "committee");
    assert.deepEqual(world.mail, []);
    assert.equal(
      card.dueDate.toISOString(),
      afterEnd(60).toISOString(),
      "due at the end plus the task's hours",
    );
  });

  test("a run no programme names goes to the admins alone", async () => {
    await runJob(unmarkedRegistersJob, afterEnd(60));
    const card = read(`tasks/${registerFollowUpTaskId(OTHER_RUN, GROUP.other, "w01")}`);
    assert.deepEqual(card.completerUids, ["zach"]);
  });

  test("a lead who no longer stands behind the role is left off", async () => {
    world.db.poke("users/claudia", { role: "member" });
    await runJob(unmarkedRegistersJob, afterEnd(60));
    assert.deepEqual(read(`tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`).completerUids, ["zach"]);
  });

  test("names Finish the register once next week's email is on its schedule", async () => {
    switches({ scheduled: true });
    await runJob(unmarkedRegistersJob, afterEnd(60));
    const card = read(`tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`);
    assert.match(card.description, /press Finish the register/);
    assert.match(card.description, /goes on its own schedule/);
  });
});

// ===========================================================================
// 4. Who may finish
// ===========================================================================

describe("who may finish a register", () => {
  test("a facilitator of another group, the lead, a member and a pending account are refused", async () => {
    for (const who of ["amelia", "claudia", "amara", "wen", "nell"]) {
      const finished = await finish(who, GROUP.b, 1);
      assert.equal(finished.status, 403, `${who} may not finish Group B's register`);
      const tapped = await call(who, register.POST, { groupId: GROUP.b }, {
        body: { weekNumber: 1, marks: [{ uid: "amara", status: "present" }] },
      });
      assert.equal(tapped.status, 403, `${who} may not mark it`);
    }
    assert.equal((await finish(null, GROUP.b, 1)).status, 401);
    assert.equal(read(registerPath(GROUP.b, 1)), undefined, "nothing was written");
  });

  test("a view-as session is refused before anything is read or written", async () => {
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    const viewed = await finish("rahul", GROUP.b, 1, {}, { viewAs: true });
    assert.equal(viewed.status, 403);
    assert.equal(viewed.body.error, "view-as");
    assert.equal(read(registerPath(GROUP.b, 1)).pushedAt, undefined);
    assert.deepEqual(world.mail, []);
  });

  test("the group's facilitator and an admin may", async () => {
    await markAll("sofia", GROUP.b, 1, MEMBERS_B);
    assert.equal((await finish("sofia", GROUP.b, 1)).status, 200);
    await markAll("zach", GROUP.a, 1, ["ana"]);
    assert.equal((await finish("zach", GROUP.a, 1)).status, 200);
  });
});

// ===========================================================================
// 5. What the register says
// ===========================================================================

describe("what the register says about how it ends", () => {
  async function ending(who = "rahul", groupId = GROUP.b) {
    const response = await call(who, register.GET, { groupId });
    assert.equal(response.status, 200, JSON.stringify(response.body).slice(0, 300));
    return response.body.ending;
  }

  test("while the push sends the email: option A's words, with today's values", async () => {
    const value = await ending();
    assert.equal(value.scheduled, false);
    assert.deepEqual(value.focus, {
      sessionKey: "w01",
      weekNumber: 1,
      occurrence: 1,
      line: "Tue 20 Oct · 6pm · Room C20",
      finished: false,
    });
    const words = registerEndingWords(value);
    assert.equal(words.button, "Push attendance");
    assert.equal(words.effect, "Locks the register, shows everyone their mark and emails Group B that week 2 is open.");
    assert.deepEqual(words.notes, [
      "If nobody pushes, nobody gets week 2’s email.",
      "After 60 hours Claudia and admins get a task.",
    ]);
  });

  test("on its schedule: option B, every value from records", async () => {
    reset(seedWorld({ scheduled: true, reminders: true }));
    const value = await ending();
    const words = registerEndingWords(value);
    assert.equal(words.button, "Finish the register");
    assert.equal(words.effect, "Locks it and shows everyone their mark. Nobody’s emailed.");
    assert.deepEqual(words.notes, [
      "Week 2’s email goes to Group B on Wed 21 Oct at 9am, whatever happens here.",
      "Not finished 36 hours after the session? Rahul and Sofia get a reminder. At 60 hours, Claudia and admins get a task.",
    ]);
  });

  test("a facilitator who lost their standing is not promised a reminder", async () => {
    reset(seedWorld({ scheduled: true, reminders: true }));
    world.db.poke("users/rahul", { role: "pending" });
    const words = registerEndingWords(await ending("sofia"));
    assert.equal(
      words.notes[1],
      "Not finished 36 hours after the session? Sofia gets a reminder. At 60 hours, Claudia and admins get a task.",
    );
  });

  test("once finished, it says so, and when the email went", async () => {
    reset(seedWorld({ scheduled: true }));
    await markAll("rahul", GROUP.b, 1, MEMBERS_B);
    await finish("rahul", GROUP.b, 1);
    let words = registerEndingWords(await ending());
    assert.deepEqual(words.notes, [
      "This register is finished. Everyone can see their mark.",
      "Week 2’s email goes to Group B on Wed 21 Oct at 9am, whatever happens here.",
    ]);
    await runJob(nextWeekEmailJob, AT.groupBDue);
    words = registerEndingWords(await ending());
    assert.equal(words.notes[1], "Week 2’s email went to Group B on Wed 21 Oct at 9am.");
  });

  test("a held email and a waiting week say why", async () => {
    reset(seedWorld({ scheduled: true }));
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "" });
    at(AT.groupBDue);
    let words = registerEndingWords(await ending());
    assert.equal(words.notes[0], "Week 2’s email to Group B is held: it’s missing the group’s room.");
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "Room C20" });
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { published: false });
    words = registerEndingWords(await ending());
    assert.equal(words.notes[0], "Week 2’s email to Group B is waiting for week 2 to be published.");
  });

  test("a run no programme names has no lead to name, and a job switched off promises nothing", async () => {
    reset(seedWorld({ scheduled: true, reminders: false, tasks: false }));
    assert.deepEqual(registerEndingWords(await ending()).notes, [
      "Week 2’s email goes to Group B on Wed 21 Oct at 9am, whatever happens here.",
    ]);
    reset(seedWorld({ scheduled: true }));
    const other = await ending("pia", GROUP.other);
    assert.deepEqual(registerEndingWords(other).notes.slice(-1), [
      "Not finished 60 hours after the session? Admins get a task.",
    ]);
  });
});
