/**
 * Each week opens straight after the group's previous session (C17, Q5), and
 * a week's own page as the board draws it (wk-week-phone).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   src/lib/courses/weekOpening.ts                the rule
 *   GET /api/courses/runs/[runId]/overview        `weekSchedule`: each week, its session, open or not
 *   /learn/[runId]/weeks/[n]                      the page's gate, then the page
 *
 * ## What this guards
 *
 *  1. THE RULE, AT ITS EDGES. A week opens to somebody taking part once the
 *     group's session before it has ENDED: shut the minute before, shut at the
 *     end itself, open the minute after. The first week waits on nothing. A
 *     session moved through "Change a session" is waited on at its new time;
 *     a cancelled one is not waited on at all (the week opens after the
 *     session the group last held); a pushed one moves the weeks after it.
 *     A calendar nobody can date waits on nothing, as every run did before.
 *  2. WHO IT IS FOR. Somebody taking part. The group's facilitators, admins,
 *     and a facilitator of another group see every published week, as they
 *     always have; nobody else reads the run at all.
 *  3. THE PAGE'S GATE says when a shut week opens, and never promises an
 *     unpublished week (the page's own "isn't published yet" stands).
 *  4. THE WEEK PAGE draws the board: the week of weeks and its dates, what
 *     is done and the minutes left, "Before your session" with THIS week's
 *     own session date (a moved week's, D2), the exercise a facilitator
 *     reviews, and the way on with when the next week opens. No sentence on
 *     it has a dash (C35).
 *
 * Real: the overview route, the week page's server shell and its client
 * page, the libraries. Faked: the session, the Admin SDK handle, the clock,
 * the stylesheets and the browser's data hooks (see the world).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { B, NOW, RUN, makeMemberPagesWorld } from "./lib/memberPagesWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeMemberPagesWorld("__memberWeeks");
const { lib } = w;

/** Move the clock to a London wall clock in November (GMT, so the same in UTC). */
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

/** Group B's stored document, changed in place. */
function changeGroupB(change) {
  const path = `courseGroups/${B}`;
  w.world.db.seed(path, { ...w.world.db.read(path), ...change });
}

/** Week 3 of Group B moved to Wednesday 18 Nov at 6pm, in Room M3, for that week only. */
function moveWeek3() {
  changeGroupB({
    sessionOverrides: { w03: { weekday: 3, startTimeLocal: "18:00", location: "Room M3" } },
    sessionChanges: { w03: { kind: "moved", reason: "The room is booked.", dateKey: "2026-11-18", byUid: "rahul", at: new Date("2026-11-13T09:00:00Z") } },
  });
}

/** Week 3 of Group B cancelled, the group keeping pace. */
function cancelWeek3() {
  changeGroupB({
    sessionChanges: { w03: { kind: "cancelled", reason: "Rahul and Sofia are both away.", dateKey: "2026-11-17", byUid: "rahul", at: new Date("2026-11-13T09:00:00Z") } },
  });
}

/** Group B's sessions, resolved as every reader resolves them. */
function sessionsOfB() {
  const run = lib.courses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
  const group = lib.groups.normalizeCourseGroup(B, w.world.db.read(`courseGroups/${B}`));
  return lib.sessions.resolveSessions(run, group);
}

const opening = (n) => lib.opening.weekOpening(sessionsOfB(), n);
const openAt = (n, iso) => lib.opening.isOpenAt(opening(n), new Date(iso));

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

describe("1. a week opens straight after the group's previous session", () => {
  test("the first week waits on nothing; every other waits on the session before it", () => {
    assert.equal(opening(1).after, null);
    const after = opening(4).after;
    assert.deepEqual({ dateKey: after.dateKey, startTimeLocal: after.startTimeLocal }, { dateKey: "2026-11-17", startTimeLocal: "18:00" });
    assert.equal(after.endsAt.toISOString(), "2026-11-17T20:00:00.000Z");
    assert.equal(opening(2).after.dateKey, "2026-11-03");
  });

  test("at its edges: shut the minute before the session ends and at the end itself, open the minute after", () => {
    assert.equal(openAt(4, "2026-11-17T19:59:00Z"), false);
    assert.equal(openAt(4, "2026-11-17T20:00:00Z"), false);
    assert.equal(openAt(4, "2026-11-17T20:01:00Z"), true);
    assert.equal(openAt(1, "2026-10-01T09:00:00Z"), true);
  });

  test("a session moved through Change a session is waited on at its new day and time", () => {
    moveWeek3();
    assert.equal(opening(4).after.dateKey, "2026-11-18");
    assert.equal(openAt(4, "2026-11-17T20:01:00Z"), false);
    assert.equal(openAt(4, "2026-11-18T19:59:00Z"), false);
    assert.equal(openAt(4, "2026-11-18T20:01:00Z"), true);
  });

  test("a cancelled session is not waited on: the week after it opens after the session the group last held", () => {
    cancelWeek3();
    assert.equal(opening(4).after.dateKey, "2026-11-10");
    assert.equal(openAt(4, NOW.toISOString()), true);
    // The week after that waits on week 4's own session as usual.
    assert.equal(opening(5).after.dateKey, "2026-11-24");
  });

  test("a session pushed back a week moves every week after it", () => {
    // Change a session's push: a break where week 4 was, so week 4 meets on Tue 1 Dec.
    const plan = [1, 2, 3].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` }));
    plan.push({ kind: "break", label: "No session this week" }, ...[4, 5, 6].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` })));
    changeGroupB({ paceStartDate: "2026-10-29", paceWeekPlan: plan });
    assert.equal(opening(4).after.dateKey, "2026-11-17");
    assert.equal(opening(5).after.dateKey, "2026-12-01");
    assert.equal(openAt(5, "2026-11-24T20:01:00Z"), false);
  });

  test("a calendar nobody can date waits on nothing: its published weeks open as they always did", () => {
    const run = w.world.db.read(`courseRuns/${RUN.agi}`);
    w.world.db.seed(`courseRuns/${RUN.agi}`, { ...run, startDate: "" });
    for (let n = 1; n <= 6; n += 1) assert.equal(opening(n).after, null, `week ${n}`);
  });
});

// ---------------------------------------------------------------------------
// 2. The overview's weeks, as every caller
// ---------------------------------------------------------------------------

/** Each week of a caller's schedule: [week, date, open, opens after]. */
async function scheduleOf(who) {
  const answer = await w.overview(who);
  if (answer.status !== 200) return answer.status;
  return answer.body.weekSchedule.map((s) => [s.weekNumber, s.dateKey, s.open, s.opensAfter ? `${s.opensAfter.dateKey} ${s.opensAfter.startTimeLocal}` : null]);
}

describe("2. the weeks each caller is told about", () => {
  test("somebody taking part in Group B: weeks 1 to 3 open, week 4 waits on tonight's session, 5 and 6 are not published", async () => {
    assert.deepEqual(await scheduleOf("chloe"), [
      [1, "2026-11-03", true, null],
      [2, "2026-11-10", true, null],
      [3, "2026-11-17", true, null],
      [4, "2026-11-24", false, "2026-11-17 18:00"],
      [5, "2026-12-01", false, null],
      [6, "2026-12-08", false, null],
    ]);
  });

  test("the minute after tonight's session ends, week 4 is open to her", async () => {
    at("2026-11-17T20:01:00Z");
    const schedule = await scheduleOf("chloe");
    assert.deepEqual(schedule[3], [4, "2026-11-24", true, null]);
  });

  test("a member of another group is told their own group's weeks: Group A met on Thursday, so week 4 is open", async () => {
    const schedule = await scheduleOf("amara");
    assert.deepEqual(schedule.slice(2, 4), [
      [3, "2026-11-12", true, null],
      [4, "2026-11-19", true, null],
    ]);
  });

  test("each week's own session, Change a session applied: a moved week says its new day, time and room", async () => {
    moveWeek3();
    const body = (await w.overview("chloe")).body;
    const week3 = body.weekSchedule.find((s) => s.weekNumber === 3);
    assert.deepEqual([week3.dateKey, week3.startTimeLocal, week3.location, week3.roomChanged], ["2026-11-18", "18:00", "Room M3", true]);
    assert.deepEqual(body.weekSchedule.find((s) => s.weekNumber === 4).opensAfter, { dateKey: "2026-11-18", startTimeLocal: "18:00" });
  });

  for (const [who, why] of [
    ["rahul", "the group's facilitator"],
    ["sofia", "a facilitator of two groups"],
    ["zach", "an admin"],
  ]) {
    test(`${why} sees every published week open, and nothing waits`, async () => {
      const schedule = await scheduleOf(who);
      assert.deepEqual(schedule.map(([n, , open, after]) => [n, open, after]), [
        [1, true, null],
        [2, true, null],
        [3, true, null],
        [4, true, null],
        [5, false, null],
        [6, false, null],
      ]);
    });
  }

  for (const [who, why, status] of [
    ["una", "placed and not told by Publish yet", 403],
    ["sam", "who left", 403],
    ["omar", "whom staff took off", 403],
    ["claudia", "the programme's lead, who is not on the run", 403],
    ["yusuf", "the run's track lead", 403],
    ["lloyd", "the run's admissions reviewer", 403],
    [null, "somebody signed out", 401],
  ]) {
    test(`${why} is told nothing`, async () => {
      assert.equal(await scheduleOf(who), status);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. The week page's gate
// ---------------------------------------------------------------------------

describe("3. a week's page before it opens", () => {
  test("somebody taking part is told when it opens, and led back", async () => {
    const before = w.everything();
    const shell = await w.weekShell("chloe", 4);
    assert.equal(shell.component, "WeekNotOpen");
    assert.equal(shell.text, "AGI Strategy Week 4 Week 4 isn’t open yet It opens tonight, after your session. Back to AGI Strategy →");
    assert.equal(w.everything(), before, "the gate wrote something");
  });

  test("the day before, it says the day", async () => {
    at("2026-11-16T12:00:00Z");
    assert.match((await w.weekShell("chloe", 4)).text, /It opens on Tue 17 Nov, after your session\./);
  });

  test("the minute before the session ends it is shut; the minute after, the page is drawn", async () => {
    at("2026-11-17T19:59:00Z");
    assert.equal((await w.weekShell("chloe", 4)).component, "WeekNotOpen");
    at("2026-11-17T20:01:00Z");
    const open = await w.weekShell("chloe", 4);
    assert.equal(open.component, "WeekView");
    assert.deepEqual(open.props, { runId: RUN.agi, weekNumber: 4, uid: "chloe", viewerRole: "learner" });
  });

  test("a moved session moves the opening; a cancelled one opens the week now", async () => {
    moveWeek3();
    at("2026-11-17T20:01:00Z");
    const moved = await w.weekShell("chloe", 4);
    assert.equal(moved.component, "WeekNotOpen");
    assert.match(moved.text, /It opens on Wed 18 Nov, after your session\./);
    w.reset();
    cancelWeek3();
    at(NOW.toISOString());
    assert.equal((await w.weekShell("chloe", 4)).component, "WeekView");
  });

  test("an unpublished week promises nothing: the page's own words about it stand", async () => {
    // Week 5 would wait on week 4's session; it is not published, so the page decides.
    assert.equal((await w.weekShell("chloe", 5)).component, "WeekView");
  });

  test("open weeks are drawn as before", async () => {
    for (const n of [1, 2, 3]) assert.equal((await w.weekShell("chloe", n)).component, "WeekView", `week ${n}`);
  });

  for (const [who, role] of [
    ["rahul", "facilitator"],
    ["sofia", "facilitator"],
    ["zach", "admin"],
  ]) {
    test(`${who} (${role}) is drawn every published week, shut to the group or not`, async () => {
      const shell = await w.weekShell(who, 4);
      assert.equal(shell.component, "WeekView");
      assert.equal(shell.props.viewerRole, role);
    });
  }

  test("a member of another group is drawn week 4: her own group's session has ended", async () => {
    assert.equal((await w.weekShell("amara", 4)).component, "WeekView");
  });

  for (const [who, to] of [
    ["yusuf", `/learn/${encodeURIComponent(RUN.agi)}/admissions`],
    ["lloyd", `/learn/${encodeURIComponent(RUN.agi)}/admissions`],
    ["claudia", "/learn"],
    ["sam", "/learn"],
    ["omar", "/learn"],
    ["una", "/learn"],
    [null, "/login"],
  ]) {
    test(`${who ?? "somebody signed out"} is sent to ${to}, as before`, async () => {
      assert.equal((await w.weekShell(who, 4)).to, to);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. The week page as the board draws it
// ---------------------------------------------------------------------------

describe("4. a week's page (wk-week-phone)", () => {
  test("week 3, tonight: the head, before your session, the exercise and the way on", async () => {
    await w.asBrowser("chloe");
    const { text, html } = w.weekPage("chloe", 3);
    assert.equal(
      text,
      "AGI Strategy Week 3 Week 3 of 6 · Thu 12 to Wed 18 Nov Who decides what AGI means 0 of 3 done · about 1 hr 15 min left " +
        "Before your session Tue 17 Nov " +
        "Week 3 reading one Reading 25 min Example Press Cohort notes ▾ " +
        "Week 3 talk Video 20 min Cohort notes ▾ " +
        "Week 3 reading two Reading 30 min Cohort notes ▾ " +
        "Exercise A facilitator reviews it What is week 3 about? Due before your session Start the exercise " +
        "Rahul or Sofia will read it and reply. " +
        "Week 2 Week 4 opens tonight, after your session See your progress week by week",
    );
    // Real boxes, each named for its reading.
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
    assert.match(html, /aria-label="Done: Week 3 reading one"/);
    assert.match(html, /aria-label="Open Week 3 talk"/);
  });

  test("once tonight's session has ended, the way on is a link to week 4", async () => {
    at("2026-11-17T20:01:00Z");
    await w.asBrowser("chloe");
    const { html, text } = w.weekPage("chloe", 3);
    assert.match(html, /href="\/learn\/[^"]+\/weeks\/4"/);
    assert.doesNotMatch(text, /opens tonight/);
  });

  test("D2: a moved week's page, read before that week, shows its own session's date", async () => {
    // Week 4 moved to Mon 23 Nov at 7pm, in Room M4; read on Tuesday night of
    // week 3, once week 3's session has ended and week 4 is open.
    changeGroupB({
      sessionOverrides: { w04: { weekday: 1, startTimeLocal: "19:00", location: "Room M4" } },
      sessionChanges: { w04: { kind: "moved", reason: "The room is booked.", dateKey: "2026-11-23", byUid: "rahul", at: new Date("2026-11-13T09:00:00Z") } },
    });
    at("2026-11-17T21:00:00Z");
    await w.asBrowser("chloe");
    const { text } = w.weekPage("chloe", 4);
    assert.match(text, /Before your session Mon 23 Nov /);
    assert.doesNotMatch(text, /Tue 24 Nov/);
  });

  test("a cancelled week's page says so, with the reason the group was given", async () => {
    cancelWeek3();
    await w.asBrowser("chloe");
    const { text } = w.weekPage("chloe", 3);
    assert.match(text, /Before your session Cancelled Tue 17 Nov Rahul and Sofia are both away\. /);
  });

  test("a week held online says so, and where the link is", async () => {
    changeGroupB({ sessionModes: { w03: "virtual" }, session: { ...w.world.db.read(`courseGroups/${B}`).session, meetingUrl: "https://meet.example.com/group-b" } });
    await w.asBrowser("chloe");
    const { text, html } = w.weekPage("chloe", 3);
    assert.match(text, /Before your session Online this week Tue 17 Nov The link to join is on your programme page, not in your emails\./);
    assert.doesNotMatch(html, /meet\.example\.com/);
  });

  test("a facilitator reads the week with no boxes and no exercise to start", async () => {
    await w.asBrowser("rahul");
    const { text, html } = w.weekPage("rahul", 4, "facilitator");
    assert.doesNotMatch(html, /type="checkbox"/);
    assert.doesNotMatch(text, /Start the exercise|done ·/);
    assert.match(text, /You are viewing this week as a facilitator\. Exercises are submitted by the learners on this run\./);
  });

  test("no sentence on the page has a dash of either kind", async () => {
    await w.asBrowser("chloe");
    for (const n of [1, 3]) assert.doesNotMatch(w.weekPage("chloe", n).text, /[–—]/, `week ${n}`);
  });
});
