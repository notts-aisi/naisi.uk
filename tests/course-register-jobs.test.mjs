/**
 * THE PARTS OF HOW A REGISTER ENDS THAT ARE NOT A REQUEST: the identities of
 * the three jobs, the arithmetic of when next week's email goes, the words the
 * register shows, the held email's card, and the settings an admin changes.
 *
 *  1. `src/lib/scheduler/registerJobs.ts` restates each job's id and default
 *     so a request can read a switch without importing the job. Restated facts
 *     drift unless something holds them together: this suite does, against
 *     the registrations the tick actually runs.
 *  2. The send instant is a London wall clock on a civil date, so the clocks
 *     going back on Sunday 25 October 2026 must not move it by an hour.
 *  3. The register's words are the board's, every value from the payload,
 *     with a sentence dropped (never printed blank) when a job is off.
 *  4. The settings route refuses what would make the two chases read wrong.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, seedWorld } from "./lib/registerWorld.mjs";

const made = makeWorld("__registerJobs");
const { reset, call, lib, loadTs } = made;

const identities = await lib("scheduler", "registerJobs.ts");
const { nextWeekEmailJob } = await lib("scheduler", "jobs", "nextWeekEmail.ts");
const { registerRemindersJob } = await lib("scheduler", "jobs", "registerReminders.ts");
const { unmarkedRegistersJob } = await lib("scheduler", "jobs", "unmarkedRegisters.ts");
const { JOBS, SCHEDULER_JOB_IDS, jobDefaultEnabled } = await lib("scheduler", "registry.ts");
const { nextWeekEmailSendAt, nextWeekEmailTiming } = await lib("courses", "registerChase.ts");
const { londonClockLabel, londonDayAndClock, sessionLine } = await lib("courses", "londonLabels.ts");
const { resolveSessions } = await lib("courses", "sessions.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const { buildHeldEmailTask, heldEmailTaskId } = await lib("courses", "heldEmailTask.ts");
const { normalizeTask } = await lib("firestore", "tasks.ts");
const { DEFAULT_COURSES_CONFIG } = await lib("firestore", "config.ts");
const { chaseSentence, nextEmailSentence, registerEndingWords } = await loadTs(
  "features/courses/registerEndingWords.ts",
);
const configRoute = await loadTs("app/api/admin/courses-config/route.ts");

// ===========================================================================
// 1. The jobs
// ===========================================================================

describe("the three jobs a register's ending depends on", () => {
  test("each restated identity is its registration's own id and default", () => {
    for (const [identity, job] of [
      [identities.NEXT_WEEK_EMAIL_JOB, nextWeekEmailJob],
      [identities.REGISTER_REMINDERS_JOB, registerRemindersJob],
      [identities.UNMARKED_REGISTERS_JOB, unmarkedRegistersJob],
    ]) {
      assert.equal(identity.id, job.id);
      assert.equal(identity.enabledByDefault, jobDefaultEnabled(job), `${job.id}'s default`);
      assert.ok(JOBS.includes(job), `${job.id} is registered`);
      assert.ok(SCHEDULER_JOB_IDS.includes(job.id), `${job.id} is in the union`);
    }
  });

  test("the two that email ship switched off; the one that raises cards ships on", () => {
    assert.equal(nextWeekEmailJob.enabledByDefault, false);
    assert.equal(registerRemindersJob.enabledByDefault, false);
    assert.equal(jobDefaultEnabled(unmarkedRegistersJob), true);
  });

  test("the lead time is written once, as the setting's default", () => {
    assert.equal(DEFAULT_COURSES_CONFIG.nextWeekEmailDaysBefore, 2);
    assert.equal(DEFAULT_COURSES_CONFIG.unmarkedRegisterGraceHours, 36);
    assert.equal(DEFAULT_COURSES_CONFIG.registerTaskHours, 60);
  });
});

// ===========================================================================
// 2. When next week's email goes
// ===========================================================================

describe("when next week's email goes", () => {
  const plan = [1, 2, 3, 4, 5, 6].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` }));
  const run = { id: "run1", startDate: "2026-10-15", weekPlan: plan };
  const group = (weekday) =>
    normalizeCourseGroup("g1", {
      runId: "run1",
      name: "Group",
      session: { weekday, startTimeLocal: "18:00", durationMinutes: 120, location: "Room", meetingUrl: null, notes: "" },
    });

  test("two days before, at the session's own wall clock, on either side of the clocks going back", () => {
    // Monday 26 October 6pm GMT: Saturday 24 October 6pm is BST, 17:00 UTC.
    const monday = resolveSessions(run, group(1))[1];
    assert.equal(monday.dateKey, "2026-10-26");
    assert.equal(nextWeekEmailSendAt(monday, 2).toISOString(), "2026-10-24T17:00:00.000Z");
    // Tuesday 27 October 6pm GMT: Sunday 25 October 6pm GMT, 18:00 UTC.
    const tuesday = resolveSessions(run, group(2))[1];
    assert.equal(nextWeekEmailSendAt(tuesday, 2).toISOString(), "2026-10-25T18:00:00.000Z");
    // A one-day lead across the change itself: Sunday 25 October, from Monday 26.
    assert.equal(nextWeekEmailSendAt(monday, 1).toISOString(), "2026-10-25T18:00:00.000Z");
  });

  test("due from the send instant, inclusive, until the session starts, exclusive", () => {
    const sessions = resolveSessions(run, group(2));
    const sendAt = new Date("2026-10-25T18:00:00Z");
    const startsAt = new Date("2026-10-27T18:00:00Z");
    assert.equal(nextWeekEmailTiming(sessions, 1, 2, new Date(sendAt.getTime() - 1)).state, "waiting");
    assert.equal(nextWeekEmailTiming(sessions, 1, 2, sendAt).state, "due");
    assert.equal(nextWeekEmailTiming(sessions, 1, 2, new Date(startsAt.getTime() - 1)).state, "due");
    assert.equal(nextWeekEmailTiming(sessions, 1, 2, startsAt).state, "past");
  });

  test("never for a group's first session, nor for one that cannot be dated", () => {
    const sessions = resolveSessions(run, group(2));
    assert.equal(nextWeekEmailTiming(sessions, 0, 2, new Date("2026-10-19T12:00:00Z")).state, "first-session");
    const undated = resolveSessions({ ...run, startDate: "" }, group(2));
    assert.equal(nextWeekEmailTiming(undated, 1, 2, new Date("2026-10-25T18:00:00Z")).state, "undated");
    assert.equal(nextWeekEmailSendAt({ dateKey: "", session: { startTimeLocal: "18:00" } }, 2), null);
  });

  test("the house clock and date, read in London", () => {
    assert.equal(londonClockLabel(new Date("2026-11-22T18:00:00Z")), "6pm");
    assert.equal(londonClockLabel(new Date("2026-11-17T19:58:00Z")), "7:58pm");
    assert.equal(londonClockLabel(new Date("2026-07-01T11:00:00Z")), "12pm");
    assert.equal(londonClockLabel(new Date("2026-11-17T00:30:00Z")), "12:30am");
    assert.equal(londonDayAndClock(new Date("2026-11-22T18:00:00Z")), "Sun 22 Nov at 6pm");
    assert.equal(sessionLine(new Date("2026-11-17T18:00:00Z"), "Room C20"), "Tue 17 Nov · 6pm · Room C20");
    assert.equal(sessionLine(new Date("2026-11-17T18:00:00Z"), ""), "Tue 17 Nov · 6pm");
  });
});

// ===========================================================================
// 3. The words under the button
// ===========================================================================

describe("the words under the register's button", () => {
  /** The board's own sample: Group B, Rahul and Sofia, Claudia. */
  const sample = (over = {}) => ({
    scheduled: true,
    groupName: "Group B",
    focus: { sessionKey: "w03", weekNumber: 3, occurrence: 1, line: "Tue 17 Nov · 6pm · Room C20", finished: false },
    hasNext: true,
    nextEmail: { state: "goes", at: "Sun 22 Nov at 6pm" },
    reminder: { hours: 36, names: ["Rahul", "Sofia"] },
    task: { hours: 60, leadName: "Claudia" },
    ...over,
  });

  test("on its schedule, the board's option B, word for word", () => {
    const words = registerEndingWords(sample());
    assert.equal(words.button, "Finish the register");
    assert.equal(words.effect, "Locks it and shows everyone their mark. Nobody’s emailed.");
    assert.deepEqual(words.notes, [
      "Next week’s email goes to Group B on Sun 22 Nov at 6pm, whatever happens here.",
      "Not finished 36 hours after the session? Rahul and Sofia get a reminder. At 60 hours, Claudia and admins get a task.",
    ]);
  });

  test("while the push sends the email, the board's option A, with today's values", () => {
    const words = registerEndingWords(
      sample({ scheduled: false, nextEmail: null, reminder: null, task: { hours: 36, leadName: "" } }),
    );
    assert.equal(words.button, "Push attendance");
    assert.equal(words.columnButton, "Push");
    assert.equal(words.effect, "Locks the register, shows everyone their mark and emails Group B about next week.");
    assert.deepEqual(words.notes, [
      "If nobody pushes, nobody gets next week’s email.",
      "After 36 hours admins get a task.",
    ]);
  });

  test("a job switched off drops its sentence, and a run with no lead names the admins", () => {
    assert.equal(
      chaseSentence(sample({ reminder: null })),
      "Not finished 60 hours after the session? Claudia and admins get a task.",
    );
    assert.equal(
      chaseSentence(sample({ task: null })),
      "Not finished 36 hours after the session? Rahul and Sofia get a reminder.",
    );
    assert.equal(
      chaseSentence(sample({ reminder: null, task: { hours: 60, leadName: "" } })),
      "Not finished 60 hours after the session? Admins get a task.",
    );
    assert.equal(chaseSentence(sample({ reminder: null, task: null })), "");
    assert.equal(
      chaseSentence(sample({ reminder: { hours: 36, names: [] } })),
      "Not finished 36 hours after the session? The group’s facilitators get a reminder. At 60 hours, Claudia and admins get a task.",
    );
    assert.equal(
      chaseSentence(sample({ scheduled: false, reminder: { hours: 36, names: [] } })),
      "After 36 hours the group’s facilitators get a reminder. After 60 hours Claudia and admins get a task.",
    );
  });

  test("every state of next week's email says what is true", () => {
    assert.equal(
      nextEmailSentence("Group B", { state: "went", at: "Sun 22 Nov at 6pm" }),
      "Next week’s email went to Group B on Sun 22 Nov at 6pm.",
    );
    assert.equal(
      nextEmailSentence("Group B", { state: "held", missing: ["the group’s room", "week 4’s reading"] }),
      "Next week’s email to Group B is held: it’s missing the group’s room and week 4’s reading.",
    );
    assert.equal(
      nextEmailSentence("Group B", { state: "waiting-for-week", weekNumber: 4 }),
      "Next week’s email to Group B is waiting for week 4 to be published.",
    );
    assert.equal(nextEmailSentence("Group B", { state: "shortly" }), "Next week’s email to Group B goes out shortly.");
    assert.equal(nextEmailSentence("Group B", { state: "missed", weekNumber: 4 }), "Week 4 has started without its email.");
  });

  test("a finished register says so, and a last session sends nothing", () => {
    const finished = registerEndingWords(
      sample({ focus: { ...sample().focus, finished: true } }),
    );
    assert.equal(finished.notes[0], "This register is finished. Everyone can see their mark.");
    const last = registerEndingWords(sample({ scheduled: false, hasNext: false, nextEmail: null }));
    assert.equal(last.effect, "Locks the register and shows everyone their mark. It’s the group’s last session, so nobody’s emailed.");
    assert.ok(!last.notes.includes("If nobody pushes, nobody gets next week’s email."));
  });

  test("no word under the button carries a dash", () => {
    for (const words of [registerEndingWords(sample()), registerEndingWords(sample({ scheduled: false }))]) {
      for (const line of [words.button, words.effect, ...words.notes]) {
        assert.doesNotMatch(line, /[–—]/, line);
      }
    }
  });
});

// ===========================================================================
// 4. The held email's card
// ===========================================================================

describe("the held email's card", () => {
  const card = () =>
    buildHeldEmailTask({
      runId: "run1",
      groupId: "g1",
      session: { weekNumber: 4, sessionKey: "w04", dateKey: "2026-11-24" },
      courseTitle: "AGI Strategy Fellowship",
      groupName: "Group B",
      missing: ["the group’s room"],
      completerUids: ["claudia", "zach"],
      creatorUid: "zach",
      dueDate: new Date("2026-11-24T18:00:00Z"),
      now: new Date("2026-11-22T18:00:00Z"),
      limits: { title: 120, description: 4000 },
    });

  test("goes to the lead and the admins, on the committee board, born notified", () => {
    const task = card();
    assert.equal(task.source, "course-register");
    assert.deepEqual(task.completerUids, ["claudia", "zach"]);
    assert.equal(task.visibility, "committee");
    assert.equal(task.initialNotifyAt.toISOString(), "2026-11-22T18:00:00.000Z");
    assert.deepEqual(task.pendingNotifyUids, []);
    assert.equal(task.title, "Next week’s email held: Group B, week 4");
    assert.match(task.description, /about week 4 on Tuesday 24 November/);
    assert.match(task.description, /missing the group’s room/);
  });

  test("points at the run and the group but no session, and survives the reader", () => {
    const task = card();
    assert.deepEqual(task.sourceRef, { cohortId: "run1", weekNumber: 4, groupId: "g1" });
    const read = normalizeTask(heldEmailTaskId("run1", "g1", "w04"), task);
    assert.equal(read.sourceRef.sessionKey, undefined);
    assert.equal(heldEmailTaskId("run1", "g1", "w04"), "course-register__run1__g1__w04__email");
    for (const [key, value] of Object.entries(task)) assert.notEqual(value, undefined, key);
  });
});

// ===========================================================================
// 5. The settings an admin changes on Site status
// ===========================================================================

describe("the course settings", () => {
  const save = (who, body) => call(who, configRoute.POST, {}, { body });

  test("an admin reads the three, with their defaults; nobody else does", async () => {
    reset(seedWorld());
    const read = await call("zach", configRoute.GET, {});
    assert.equal(read.status, 200);
    assert.equal(read.body.nextWeekEmailDaysBefore, 2);
    assert.equal(read.body.unmarkedRegisterGraceHours, 36);
    assert.equal(read.body.registerTaskHours, 60);
    assert.equal(read.body.defaults.nextWeekEmailDaysBefore, 2);
    for (const who of ["claudia", "rahul", "amara"]) {
      assert.equal((await call(who, configRoute.GET, {})).status, 403, who);
      assert.equal((await save(who, { nextWeekEmailDaysBefore: 3 })).status, 403, who);
    }
  });

  test("days are a whole number from 1 to 6, hours up to a fortnight", async () => {
    reset(seedWorld());
    for (const days of [0, 7, 1.5, "2", null]) {
      assert.equal((await save("zach", { nextWeekEmailDaysBefore: days })).status, 400, String(days));
    }
    assert.equal((await save("zach", { registerTaskHours: 337 })).status, 400);
    assert.equal((await save("zach", { unmarkedRegisterGraceHours: 0 })).status, 400);
    const saved = await save("zach", { nextWeekEmailDaysBefore: 3 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.nextWeekEmailDaysBefore, 3);
    assert.equal(made.world.db.read("config/courses").nextWeekEmailDaysBefore, 3);
  });

  test("the task has to come after the reminder, checked against what is stored", async () => {
    reset(seedWorld());
    const refused = await save("zach", { registerTaskHours: 30 });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /task has to come after the reminder/);
    const also = await save("zach", { unmarkedRegisterGraceHours: 60 });
    assert.equal(also.status, 400, "the reminder may not reach the stored task");
    const both = await save("zach", { unmarkedRegisterGraceHours: 24, registerTaskHours: 48 });
    assert.equal(both.status, 200);
    assert.equal(both.body.registerTaskHours, 48);
  });

  test("a view-as session saves nothing", async () => {
    reset(seedWorld());
    const blocked = await call("zach", configRoute.POST, {}, {
      body: { nextWeekEmailDaysBefore: 3 },
      viewAs: true,
    });
    assert.equal(blocked.status, 403);
    assert.equal(made.world.db.read("config/courses"), undefined);
  });
});
