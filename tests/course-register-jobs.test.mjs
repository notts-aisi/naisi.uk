/**
 * THE PARTS OF HOW A REGISTER ENDS THAT ARE NOT A REQUEST: the identities of
 * the three jobs, the arithmetic of when next week's email goes, the words the
 * register shows, the held email's card, and the settings an admin changes.
 *
 *  1. `src/lib/scheduler/registerJobs.ts` restates each job's id and default
 *     so a request can read a switch without importing the job. Restated facts
 *     drift unless something holds them together: this suite does, against
 *     the registrations the tick actually runs.
 *  2. The send instant ("Week N is open", 6 days before each session at 9am)
 *     is a London wall clock on a civil date, so the clocks going back on
 *     Sunday 25 October 2026 must not move it by an hour.
 *  3. The register's words are the board's, every value from the payload,
 *     with a sentence dropped (never printed blank) when a job is off.
 *  4. The settings route refuses what would make the two chases read wrong.
 *  5. A group's email about its next session has one door. The push and the
 *     schedule never both send because both go through one send that claims
 *     the group's marker before the first message; a file anywhere else in
 *     `src` that calls the send or mints the marker would be a lane the
 *     switch knows nothing about. The last section walks the tree for that.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";
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
const weekEmails = await lib("courses", "weekEmails", "model.ts");
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

  test("the lead times are written once: the week's emails in their model, the chases as the settings' defaults", () => {
    assert.equal(weekEmails.WEEK_OPEN_DAYS_BEFORE, 6);
    assert.deepEqual([...weekEmails.WEEK_REMINDER_DAYS], [3, 1]);
    assert.equal(weekEmails.WEEK_EMAIL_CLOCK, "09:00");
    // The days-before setting is retired: nothing reads it, and it has no default.
    assert.equal(DEFAULT_COURSES_CONFIG.nextWeekEmailDaysBefore, undefined);
    assert.equal(DEFAULT_COURSES_CONFIG.unmarkedRegisterGraceHours, 36);
    assert.equal(DEFAULT_COURSES_CONFIG.registerTaskHours, 60);
  });
});

// ===========================================================================
// 2. When next week's email goes
// ===========================================================================

describe("when Week N is open goes", () => {
  const plan = [1, 2, 3, 4, 5, 6].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` }));
  const run = { id: "run1", startDate: "2026-10-15", weekPlan: plan };
  const group = (weekday) =>
    normalizeCourseGroup("g1", {
      runId: "run1",
      name: "Group",
      session: { weekday, startTimeLocal: "18:00", durationMinutes: 120, location: "Room", meetingUrl: null, notes: "" },
    });

  test("six days before, at 9am in London, on either side of the clocks going back", () => {
    // Monday 26 October 6pm: six days before is Tuesday 20 October, BST: 8am UTC.
    const monday = resolveSessions(run, group(1))[1];
    assert.equal(monday.dateKey, "2026-10-26");
    assert.equal(nextWeekEmailSendAt(monday).toISOString(), "2026-10-20T08:00:00.000Z");
    // Saturday 31 October: six days before is Sunday 25 October, the day the
    // clocks go back, and 9am that day is GMT: 9am UTC. Counting 144 hours
    // back from the session would have said 8am.
    const saturday = resolveSessions(run, group(6))[2];
    assert.equal(saturday.dateKey, "2026-10-31");
    assert.equal(nextWeekEmailSendAt(saturday).toISOString(), "2026-10-25T09:00:00.000Z");
    // The session's own time of day no longer moves it: 9am whatever the hour.
    const lunch = { ...monday, session: { ...monday.session, startTimeLocal: "12:30" } };
    assert.equal(nextWeekEmailSendAt(lunch).toISOString(), "2026-10-20T08:00:00.000Z");
  });

  test("due from the send instant, inclusive, until the session starts, exclusive", () => {
    const sessions = resolveSessions(run, group(2));
    const sendAt = new Date("2026-10-21T08:00:00Z");
    const startsAt = new Date("2026-10-27T18:00:00Z");
    assert.equal(nextWeekEmailTiming(sessions, 1, new Date(sendAt.getTime() - 1)).state, "waiting");
    assert.equal(nextWeekEmailTiming(sessions, 1, sendAt).state, "due");
    assert.equal(nextWeekEmailTiming(sessions, 1, new Date(startsAt.getTime() - 1)).state, "due");
    assert.equal(nextWeekEmailTiming(sessions, 1, startsAt).state, "past");
  });

  test("the group's first session too, and never one that cannot be dated", () => {
    // Week 1 meets on Tuesday 20 October: six days before is Wednesday 14 October at 9am BST.
    const sessions = resolveSessions(run, group(2));
    assert.deepEqual(nextWeekEmailTiming(sessions, 0, new Date("2026-10-14T08:00:00Z")), {
      state: "due",
      sendAt: new Date("2026-10-14T08:00:00Z"),
      startsAt: new Date("2026-10-20T17:00:00Z"),
    });
    const undated = resolveSessions({ ...run, startDate: "" }, group(2));
    assert.equal(nextWeekEmailTiming(undated, 1, new Date("2026-10-25T18:00:00Z")).state, "undated");
    assert.equal(nextWeekEmailSendAt({ dateKey: "", session: { startTimeLocal: "18:00" } }), null);
    assert.equal(nextWeekEmailSendAt({ dateKey: "2026-10-27", session: { startTimeLocal: "" } }), null);
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
    nextEmail: { state: "goes", at: "Wed 18 Nov at 9am", weekNumber: 4 },
    reminder: { hours: 36, names: ["Rahul", "Sofia"] },
    task: { hours: 60, leadName: "Claudia" },
    ...over,
  });

  test("on its schedule, the board's option B, word for word", () => {
    const words = registerEndingWords(sample());
    assert.equal(words.button, "Finish the register");
    assert.equal(words.effect, "Locks it and shows everyone their mark. Nobody’s emailed.");
    assert.deepEqual(words.notes, [
      "Week 4’s email goes to Group B on Wed 18 Nov at 9am, whatever happens here.",
      "Not finished 36 hours after the session? Rahul and Sofia get a reminder. At 60 hours, Claudia and admins get a task.",
    ]);
  });

  test("while the push sends the email, the board's option A, with today's values", () => {
    const words = registerEndingWords(
      sample({ scheduled: false, nextEmail: null, reminder: null, task: { hours: 36, leadName: "" } }),
    );
    assert.equal(words.button, "Push attendance");
    assert.equal(words.columnButton, "Push");
    assert.equal(words.effect, "Locks the register, shows everyone their mark and emails Group B that the next week is open.");
    assert.deepEqual(words.notes, [
      "If nobody pushes, nobody gets the next week’s email.",
      "After 36 hours admins get a task.",
    ]);
    // With the route's answer for the register, the week is named.
    const named = registerEndingWords(
      sample({
        scheduled: false,
        nextEmail: null,
        reminder: null,
        task: null,
        pushEmails: { w03: { kind: "sends", weekNumber: 4, day: "Tue 24 Nov", cancelled: false, emails: 3, people: 3 } },
      }),
    );
    assert.equal(named.effect, "Locks the register, shows everyone their mark and emails Group B that week 4 is open.");
    assert.deepEqual(named.notes, ["If nobody pushes, nobody gets week 4’s email."]);
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

  test("one facilitator gets a reminder; two or more get one", () => {
    const one = { hours: 36, names: ["Sofia"] };
    assert.equal(
      chaseSentence(sample({ reminder: one })),
      "Not finished 36 hours after the session? Sofia gets a reminder. At 60 hours, Claudia and admins get a task.",
    );
    assert.equal(
      chaseSentence(sample({ scheduled: false, reminder: one })),
      "After 36 hours Sofia gets a reminder. After 60 hours Claudia and admins get a task.",
    );
    assert.equal(
      chaseSentence(sample({ reminder: { hours: 36, names: ["Rahul", "Sofia", "Tom"] }, task: null })),
      "Not finished 36 hours after the session? Rahul, Sofia and Tom get a reminder.",
    );
  });

  test("every state of the week's email says what is true, and which week", () => {
    assert.equal(
      nextEmailSentence("Group B", { state: "went", at: "Wed 18 Nov at 9am", weekNumber: 4 }),
      "Week 4’s email went to Group B on Wed 18 Nov at 9am.",
    );
    assert.equal(
      nextEmailSentence("Group B", { state: "held", missing: ["the group’s room", "what week 4 asks for"], weekNumber: 4 }),
      "Week 4’s email to Group B is held: it’s missing the group’s room and what week 4 asks for.",
    );
    assert.equal(
      nextEmailSentence("Group B", { state: "waiting-for-week", weekNumber: 4 }),
      "Week 4’s email to Group B is waiting for week 4 to be published.",
    );
    assert.equal(nextEmailSentence("Group B", { state: "shortly", weekNumber: 4 }), "Week 4’s email to Group B goes out shortly.");
    assert.equal(nextEmailSentence("Group B", { state: "missed", weekNumber: 4 }), "Week 4 has started without its email.");
  });

  test("a finished register says so, and a last session sends nothing", () => {
    const finished = registerEndingWords(
      sample({ focus: { ...sample().focus, finished: true } }),
    );
    assert.equal(finished.notes[0], "This register is finished. Everyone can see their mark.");
    const last = registerEndingWords(sample({ scheduled: false, hasNext: false, nextEmail: null }));
    assert.equal(last.effect, "Locks the register and shows everyone their mark. It’s the group’s last session, so nobody’s emailed.");
    assert.ok(!last.notes.some((note) => note.startsWith("If nobody pushes")), "a last session promises no email");
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
    assert.equal(task.title, "Week 4’s email held: Group B");
    assert.match(task.description, /has not been sent “Week 4 is open”, about week 4 on Tuesday 24 November/);
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

  test("an admin reads the two forms and the two chases, with their defaults; nobody else does", async () => {
    reset(seedWorld());
    const read = await call("zach", configRoute.GET, {});
    assert.equal(read.status, 200);
    assert.equal(read.body.unmarkedRegisterGraceHours, 36);
    assert.equal(read.body.registerTaskHours, 60);
    assert.equal(read.body.defaults.registerTaskHours, 60);
    // When the week's emails go is not a setting any more.
    assert.equal(read.body.nextWeekEmailDaysBefore, undefined);
    assert.equal(read.body.defaults.nextWeekEmailDaysBefore, undefined);
    for (const who of ["claudia", "rahul", "amara"]) {
      assert.equal((await call(who, configRoute.GET, {})).status, 403, who);
      assert.equal((await save(who, { registerTaskHours: 70 })).status, 403, who);
    }
  });

  test("hours up to a fortnight; the retired days-before setting is no setting, and is stored by nobody", async () => {
    reset(seedWorld());
    assert.equal((await save("zach", { registerTaskHours: 337 })).status, 400);
    assert.equal((await save("zach", { unmarkedRegisterGraceHours: 0 })).status, 400);
    for (const days of [3, 7, "2"]) {
      const refused = await save("zach", { nextWeekEmailDaysBefore: days });
      assert.equal(refused.status, 400, String(days));
      assert.match(refused.body.error, /Nothing to change/);
    }
    assert.equal(made.world.db.read("config/courses"), undefined, "nothing was written");
    const saved = await save("zach", { registerTaskHours: 70, nextWeekEmailDaysBefore: 3 });
    assert.equal(saved.status, 200);
    assert.equal(made.world.db.read("config/courses").registerTaskHours, 70);
    assert.equal(made.world.db.read("config/courses").nextWeekEmailDaysBefore, undefined);
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
      body: { registerTaskHours: 70 },
      viewAs: true,
    });
    assert.equal(blocked.status, 403);
    assert.equal(made.world.db.read("config/courses"), undefined);
  });
});

// ===========================================================================
// 6. One door for a group's email about its next session
// ===========================================================================

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every file under `src` that may name the sender or the marker id, with the
 * reason it may. Checked in both directions: a file that names either and is
 * not listed fails, and so does a listed file that no longer names it.
 */
const ONE_DOOR = {
  sendNextWeekEmail: {
    "src/lib/courses/nextWeekEmail.ts": "declares it: the one send, after the one shared claim",
    "src/app/api/courses/groups/[groupId]/attendance/push/route.ts":
      "the push lane while the schedule is off, and an admin's resend",
    "src/lib/scheduler/jobs/nextWeekEmail.ts": "the schedule lane, 6 days before each session at 9am",
  },
  groupNudgeMarkerId: {
    "src/lib/email/courseNudgeEmail.ts": "declares it",
    "src/lib/courses/nextWeekEmail.ts": "the one claim the push and the schedule share",
  },
};

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry)) yield full;
  }
}

describe("a group's email about its next session has one door", () => {
  const files = [...sourceFiles(join(ROOT, "src"))];

  test("the walk found the tree", () => {
    assert.ok(files.length > 500, `only ${files.length} files under src`);
  });

  for (const [name, allowed] of Object.entries(ONE_DOOR)) {
    test(`only the listed files name ${name}`, () => {
      const pattern = new RegExp(`\\b${name}\\b`);
      const naming = [];
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        if (!source.includes(name)) continue;
        const code = stripSource(source);
        const label = relative(ROOT, file).split(sep).join("/");
        assertReadable(source, code, label, assert);
        if (pattern.test(code)) naming.push(label);
      }
      const unlisted = naming.filter((label) => !(label in allowed));
      assert.deepEqual(
        unlisted,
        [],
        `${unlisted.join(", ")} names ${name}. A third sender of a group's email about its ` +
          "next session would send beside the push and the schedule, which never both send " +
          "only because they share one claim. Send through src/lib/courses/nextWeekEmail.ts.",
      );
      const stale = Object.keys(allowed).filter((label) => !naming.includes(label));
      assert.deepEqual(stale, [], `listed but no longer naming ${name}: ${stale.join(", ")}`);
      for (const [label, reason] of Object.entries(allowed)) assert.ok(reason.length > 0, label);
    });
  }
});
