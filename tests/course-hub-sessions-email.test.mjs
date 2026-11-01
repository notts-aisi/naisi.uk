/**
 * Changing a session (Q25), and what goes out by email after it: "Week N is
 * open" about the changed session and the one after it, on both of that
 * email's lanes, and the register chase, which a cancelled session never
 * starts.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. "CANCELLING OR MOVING A SESSION REWRITES ITS EMAIL" (wk-messages). The
 *     email about a cancelled session says it is off, why, and when the group
 *     meets next, in the programme page's words, and says nothing about when
 *     and where the group meets; the email about the session after it says it
 *     covers both weeks; a moved session's email names its new day, time and
 *     room; an online week's says Online and never the link; a pushed week's
 *     email goes for its new evening and none goes for the evening it lost.
 *     Whole or not at all still holds for everything else.
 *  2. ONE SEND, TWO LANES. The schedule and the register's push both send
 *     through the shared module, so both say the same.
 *  3. THE CHASE. A cancelled session's register is nobody's to finish: no
 *     reminder to its facilitators, no task for the lead and the admins.
 *
 * Built on `tests/lib/registerWorld.mjs`: the run starts on Thursday 15
 * October 2026; Group B meets on Tuesdays from 6pm to 8pm in Room C20 (Rahul
 * and Sofia; Amara, Chloe and Farah in it), Group A on Mondays (Amelia, with
 * Ana). Weeks 1 and 2 are published.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { AT, GROUP, RUN, jobContext, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";

const made = makeWorld("__sessionsEmail");
const { world, reset, call, courseRoute, lib } = made;

const change = await courseRoute("groups", "[groupId]", "session", "change");
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const { nextWeekEmailJob } = await lib("scheduler", "jobs", "nextWeekEmail.ts");
const { registerRemindersJob } = await lib("scheduler", "jobs", "registerReminders.ts");
const { unmarkedRegistersJob } = await lib("scheduler", "jobs", "unmarkedRegisters.ts");
const { registerFollowUpTaskId } = await lib("courses", "unmarkedRegisters.ts");

mock.timers.enable({ apis: ["Date"], now: AT.week1Evening });
const at = (instant) => mock.timers.setTime(new Date(instant).getTime());

const AWAY = "Rahul and Sofia are both away.";
const MEMBERS_B = ["amara", "chloe", "farah"];
const address = (uid) => `${uid}@example.com`;
const mailTo = (uid) => world.mail.filter((message) => message.to === address(uid));
const read = (path) => world.db.read(path);

/** A message as its reader sees it: the real template, rendered to text. */
async function textOf(message) {
  return (await render(message.react, { plainText: true })).replace(/\s+/g, " ");
}

/** One run of a job, as the tick hands it over, at `instant`. */
async function runJob(job, instant) {
  at(instant);
  return job.handler(jobContext(job, new Date(instant)).ctx);
}

/** A change to a session of Group B, pressed by Rahul with nobody told: the email is the thing under test. */
async function changeB(body, when = "2026-10-20T21:00:00Z") {
  at(when);
  const response = await call("rahul", change.POST, { groupId: GROUP.b }, { body: { reason: AWAY, tell: false, ...body } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response;
}

const publishWeek = (n) => world.db.poke(`courseRuns/${RUN}/weeks/w0${n}`, { published: true });

beforeEach(() => {
  at(AT.week1Evening);
  reset(seedWorld({ scheduled: true }));
});

// ---------------------------------------------------------------------------
// 1. Next week's email, on its schedule
// ---------------------------------------------------------------------------

describe("1. Week N is open says what the change makes true", () => {
  test("cancelled, keeping pace: off, why, and the next session, with no sentence about meeting", async () => {
    await changeB({ week: 2, dateKey: "2026-10-27", kind: "cancel" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 1, uid);
    const text = await textOf(mailTo("amara")[0]);
    assert.match(
      text,
      /Tue 27 Oct is cancelled\. Rahul and Sofia are both away\. Do week 2’s reading anyway\. On Tue 3 Nov you’ll talk about weeks 2 and 3 together\./,
    );
    assert.doesNotMatch(text, /Your next session/);
    // It follows the week's opening line, which is what the inbox previews.
    assert.ok(text.indexOf("Week 2 of") < text.indexOf("Tue 27 Oct is cancelled"), text);
    const message = mailTo("amara")[0];
    assert.equal(message.react.props.preheader, "Week 2 of AGI Strategy Fellowship is open: Week 2 theme.");
    // Group A's email, due in the same window, is its own and untouched.
    const groupA = await textOf(mailTo("ana")[0]);
    assert.match(groupA, /Your next session is Mon 26 Oct at 6pm in Room A13\./);
    assert.doesNotMatch(groupA, /cancelled/);
  });

  test("the session after a cancelled one says it covers both weeks", async () => {
    await changeB({ week: 2, dateKey: "2026-10-27", kind: "cancel" });
    publishWeek(3);
    await runJob(nextWeekEmailJob, AT.groupBWeek3Due);
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /On Tue 3 Nov you’ll talk about weeks 2 and 3 together\./);
    assert.match(text, /Your next session is Tue 3 Nov at 6pm in Room C20\./);
  });

  test("moved: the new day, time and room, at the new evening's own time", async () => {
    await changeB({
      week: 2,
      dateKey: "2026-10-27",
      kind: "move",
      move: { dateKey: "2026-10-28", time: "7pm", room: "Room D1" },
    });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("amara").length, 0, "not due six days before the old evening");
    // Six days before Wednesday 28 October: Thursday 22 October at 9am BST.
    await runJob(nextWeekEmailJob, "2026-10-22T08:00:00Z");
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Your next session is Wed 28 Oct at 7pm in Room D1\./);
    assert.doesNotMatch(text, /Room C20/);
  });

  test("online: Online, and never the link", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.meetingUrl": "https://meet.example.com/abc-defg-hij" });
    await changeB({ week: 2, dateKey: "2026-10-27", kind: "online" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Your next session is Tue 27 Oct at 6pm, online\./);
    assert.ok(!JSON.stringify(world.mail).includes("meet.example.com"), "the link is in an email");
  });

  test("pushed back: no email for the lost evening, and week 2's for its new one", async () => {
    await changeB({ week: 2, dateKey: "2026-10-27", kind: "push" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    for (const uid of MEMBERS_B) assert.equal(mailTo(uid).length, 0, `${uid} was emailed about an evening nobody meets`);
    await runJob(nextWeekEmailJob, AT.groupBWeek3Due);
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Week 2 of/);
    assert.match(text, /Your next session is Tue 3 Nov at 6pm in Room C20\./);
  });

  test("whole or not at all still holds for everything but the meeting sentence", async () => {
    await changeB({ week: 2, dateKey: "2026-10-27", kind: "cancel" });
    world.db.poke(`courseRuns/${RUN}/weeks/w02`, { title: "" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    assert.equal(mailTo("amara").length, 0, "an email with an empty value went");
  });
});

// ---------------------------------------------------------------------------
// 2. The push lane says the same
// ---------------------------------------------------------------------------

describe("2. the register's push sends the same rewritten email", () => {
  beforeEach(() => reset(seedWorld({ scheduled: false })));

  test("pushing week 1's register, with week 2 cancelled, sends week 2's email rewritten", async () => {
    await changeB({ week: 2, dateKey: "2026-10-27", kind: "cancel" }, "2026-10-20T12:00:00Z");
    at(AT.week1Evening);
    const marked = await call("rahul", register.POST, { groupId: GROUP.b }, {
      body: { weekNumber: 1, marks: MEMBERS_B.map((uid) => ({ uid, status: "present" })) },
    });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const pushed = await call("rahul", push.POST, { groupId: GROUP.b }, { body: { weekNumber: 1 } });
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    const text = await textOf(mailTo("amara")[0]);
    assert.match(text, /Tue 27 Oct is cancelled\. Rahul and Sofia are both away\./);
    assert.doesNotMatch(text, /Your next session/);
  });
});

// ---------------------------------------------------------------------------
// 2b. Each group's own evening
// ---------------------------------------------------------------------------

describe("2b. each group's email names its own evening, and the cancelled one only as off", () => {
  // The run's catch-up email this replaced went to every group at once; the
  // week's email goes group by group, so a cancelled evening is never named
  // to another group, nor another group's room to this one.
  test("Group B is told its evening is off; Group A keeps its own", async () => {
    await changeB({ week: 2, dateKey: "2026-10-27", kind: "cancel" });
    await runJob(nextWeekEmailJob, AT.groupBDue);
    const amara = await textOf(mailTo("amara")[0]);
    assert.doesNotMatch(amara, /Your next session/);
    assert.doesNotMatch(amara, /Room A13|Mon 26 Oct/);
    const ana = await textOf(mailTo("ana")[0]);
    assert.match(ana, /Your next session is Mon 26 Oct at 6pm in Room A13\./);
    assert.doesNotMatch(ana, /cancelled|Room C20|27 Oct/);
  });
});

// ---------------------------------------------------------------------------
// 3. The chase
// ---------------------------------------------------------------------------

describe("3. a cancelled session's register is nobody's to finish", () => {
  /** Group B's week 1 session ends Tuesday 20 October at 8pm BST. */
  const afterEnd = (hours) => new Date(new Date("2026-10-20T19:00:00Z").getTime() + hours * 3_600_000);

  test("no reminder to its facilitators; another group's unfinished register is still chased", async () => {
    reset(seedWorld({ scheduled: true, reminders: true }));
    await changeB({ week: 1, dateKey: "2026-10-20", kind: "cancel" }, "2026-10-19T12:00:00Z");
    // Group A met on the Monday, so its register reaches its hours a day earlier.
    await runJob(registerRemindersJob, "2026-10-21T12:00:00Z");
    assert.equal(mailTo("amelia").length, 1, "Group A's unfinished register is chased as before");
    await runJob(registerRemindersJob, afterEnd(36));
    await runJob(registerRemindersJob, afterEnd(40));
    assert.equal(mailTo("rahul").length, 0);
    assert.equal(mailTo("sofia").length, 0);
  });

  test("no task for the lead and the admins; another group's still raised", async () => {
    await changeB({ week: 1, dateKey: "2026-10-20", kind: "cancel" }, "2026-10-19T12:00:00Z");
    await runJob(unmarkedRegistersJob, "2026-10-22T12:00:00Z");
    assert.ok(read(`tasks/${registerFollowUpTaskId(RUN, GROUP.a, "w01")}`), "Group A's card is raised as before");
    await runJob(unmarkedRegistersJob, afterEnd(60));
    await runJob(unmarkedRegistersJob, afterEnd(70));
    assert.equal(read(`tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`), undefined);
  });

  test("a session put back as usual is chased again", async () => {
    await changeB({ week: 1, dateKey: "2026-10-20", kind: "cancel" }, "2026-10-19T12:00:00Z");
    await changeB({ week: 1, dateKey: "2026-10-20", kind: "restore" }, "2026-10-19T13:00:00Z");
    await runJob(unmarkedRegistersJob, afterEnd(60));
    assert.ok(read(`tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`));
    assert.equal(read(registerPath(GROUP.b, 1)), undefined, "nothing wrote the register");
  });
});
