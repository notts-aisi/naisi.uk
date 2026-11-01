/**
 * A programme's Overview tab (board wk-overview) and its "Remind", as every
 * kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/overview
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/registers/remind
 *
 * ## What this guards
 *
 *  1. FOR THE LEAD AND AN ADMIN. A reviewer is told the tab is theirs; the
 *     lead of another programme is told there is no programme here; the
 *     tree's gate sends everybody else to the dashboard. Overview is a link
 *     in the tabs for the lead and admins only.
 *  2. THE WEEK AND ITS SESSIONS, from the run's calendar and each group's
 *     own: the rail with dates, each group's session this week with its
 *     room, facilitators and its register's state in the register's own
 *     word, and "Remind" with the count it emails.
 *  3. NEEDS ATTENTION says only what the records can say, and each item goes
 *     away with the record that put it there: two absences in a row, a week
 *     not published that a group has reached, a register not finished (with
 *     the reminder's and the task's real times), somebody who left.
 *  4. ATTENDANCE BY WEEK AND THE PEOPLE: the grid's figures, the groups a
 *     week so far is from, how many take part and how many left.
 *  5. REMIND emails that group's facilitators and nobody else, behind the
 *     count the button showed, once per facilitator per register whether
 *     the press or the reminder job comes first; every other caller is
 *     refused before anybody is emailed.
 *
 * Real: the page, the route, the reminder job, the email's words, every
 * library under them. Faked: the session, the Admin SDK handle, the view-as
 * guard, the mail door (which records), `next/link`, `next/navigation`, the
 * stylesheets and the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { CAST, makeWorld } from "./lib/handoverWorld.mjs";
import {
  A,
  AGI,
  B,
  COURSE,
  D,
  NOW,
  ROUND,
  RUN,
  SAM_SAID,
  attendanceSeed,
  registerPath,
  switches,
} from "./lib/hubAttendanceWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const made = makeWorld("__hubOverview");
const { world, reset, call, formRoute, lib } = made;
const remindRoute = await formRoute("programmes", "[programmeId]", "registers", "remind");
const { registerRemindersJob } = await lib("scheduler", "jobs", "registerReminders.ts");

const ui = { h: createElement };
globalThis.__hubOverviewUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SESSION = "export async function getCurrentUser() { return globalThis.__hubOverviewPages.user; }";
const STYLESHEETS = [
  "./ProgrammeOverview.module.css",
  // The Overview's Feedback to send draws with feedback's own stylesheet.
  "./feedback.module.css",
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./ProgrammeFrame.module.css",
  "./InitialsChip.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  "./Chip.module.css",
];
globalThis.__hubOverviewPages = { user: null, db: null };
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__hubOverviewPages.db; }"],
    ["@/lib/firebase/session", SESSION],
    ["./session", SESSION],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function useSelectedLayoutSegment() { return globalThis.__hubOverviewPages.segment ?? 'overview'; }\n" +
        "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, ...rest }) =>\n" +
        "  globalThis.__hubOverviewUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
    ],
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
        .join("\n"),
    ],
    // The mail door: the page reads, and never reaches it.
    ["./send", "export async function sendEmail() { throw new Error('a page sent an email'); }"],
    ["@/lib/email/send", "export async function sendEmail() { throw new Error('a page sent an email'); }"],
    ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
  ]),
});

const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: OverviewPage } = await loadTs(join(PROGRAMME, "overview", "page.tsx"));
const { default: ProgrammeTabs } = await loadTs(join("features", "applications", "editor", "ProgrammeTabs.tsx"));

const PAGE_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
const MARKER = `schedulerMarkers/regremind__${D}__w03__grace`;

function sessionFor(uid) {
  const base = made.sessionOf(uid);
  if (!base) return null;
  return { ...base, permissions: CAST.zach.permissions, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  for (const value of Object.values(element.props ?? {})) find(value, name, out);
  return out;
}

/** The Overview as `who` sees it: the element, the model, its HTML and text, what it read, where it sent them. */
async function draw(who) {
  globalThis.__hubOverviewPages.user = who === null ? null : sessionFor(who);
  const reads = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  const before = made.everything();
  try {
    const element = await OverviewPage({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) });
    const html = renderToStaticMarkup(element);
    const [overview] = find(element, "ProgrammeOverview");
    return { element, model: overview?.props.model ?? null, html, text: text(html), reads, to: null, wrote: made.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { element: null, model: null, html: "", text: "", reads, to: err.to, wrote: made.everything() !== before };
  } finally {
    world.db.collection = collection;
  }
}

const remind = (who, body, options = {}) => call(who, remindRoute.POST, { roundId: ROUND, programmeId: AGI }, { body, ...options });
const GRACE = { groupId: D, sessionKey: "w03", emails: 1 };

/** One run of the reminder job at `instant`, as the tick hands it over. */
async function runReminderJob(instant) {
  mock.timers.setTime(instant.getTime());
  world.course = true;
  try {
    return await registerRemindersJob.handler({
      now: instant,
      budget: { remainingMs: () => 20_000, expired: () => false },
      log: () => {},
      policy: { reclaimAfterMinutes: 20, maxAttempts: 3 },
      maxPerTick: registerRemindersJob.maxPerTick,
      maxLateHours: registerRemindersJob.maxLateHours,
    });
  } finally {
    world.course = false;
    mock.timers.setTime(NOW.getTime());
  }
}

const titles = (model) => model.attention.map((item) => item.title);

function start(seed = attendanceSeed()) {
  reset(seed, { now: () => new Date() });
  globalThis.__hubOverviewPages.db = world.db;
  globalThis.__hubOverviewPages.segment = "overview";
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  start();
});

// ---------------------------------------------------------------------------
// 1. Who opens it
// ---------------------------------------------------------------------------

describe("1. for the lead and an admin", () => {
  test("the lead and an admin are drawn the Overview, and it writes nothing", async () => {
    for (const who of ["claudia", "zach"]) {
      const drawn = await draw(who);
      assert.ok(drawn.model, `${who} was not drawn the Overview`);
      assert.equal(drawn.wrote, false, who);
      assert.ok(!drawn.html.includes("@"), `an address reached ${who}'s page`);
    }
  });

  test("a reviewer is told the tab is the lead's and an admin's, and only the form was read", async () => {
    const drawn = await draw("lloyd");
    assert.match(drawn.text, /Only the programme’s lead and admins can open Overview/);
    assert.match(drawn.html, new RegExp(`href="${PAGE_PATH}/applications"`));
    assert.deepEqual(drawn.reads, ["admissionRounds"]);
  });

  test("the lead of another programme is told there is no programme here", async () => {
    const drawn = await draw("tess");
    assert.match(drawn.text, /There is no programme here/);
    assert.deepEqual(drawn.reads, ["admissionRounds"]);
  });

  test("the run's track lead, a facilitator, members placed and told or not, somebody on nothing and somebody signed out go to the dashboard", async () => {
    for (const who of ["yusuf", "grace", "amara", "una", "nobody", null]) {
      const drawn = await draw(who);
      assert.equal(drawn.to, "/dashboard", String(who));
      assert.deepEqual(drawn.reads, [], `${who}'s request read something`);
    }
  });

  test("a programme that names no run says so, in words for the lead", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    const drawn = await draw("claudia");
    assert.match(drawn.text, /AGI Strategy doesn’t name a course run yet\. An admin names it on the Settings tab, under Course run\./);
    assert.ok(!drawn.reads.includes("courseRuns"));
  });

  test("Overview is a link in the tabs for the lead and admins, and not drawn for a reviewer", () => {
    const base = PAGE_PATH;
    const open = renderToStaticMarkup(createElement(ProgrammeTabs, { base, applications: 6, groups: 4, canEdit: true, groupsOpen: true }));
    assert.match(open, new RegExp(`<a href="${base}/overview"[^>]*aria-current="page">Overview</a>`));
    const shut = renderToStaticMarkup(createElement(ProgrammeTabs, { base, applications: 6, groups: 4, canEdit: false, groupsOpen: false }));
    assert.ok(!shut.includes(`${base}/overview`));
    // Applications alone for a reviewer: no Overview, no Interest (never
    // built), and no tab drawn that is not a link.
    assert.doesNotMatch(shut, />Overview<|Interest|<span[^>]*aria-disabled/);
    assert.deepEqual([...shut.matchAll(/<a href="[^"]*\/([a-z]+)"/g)].map((m) => m[1]), ["applications"]);
    // With Settings for somebody who can open it, whose other tabs are shut.
    const settingsOnly = renderToStaticMarkup(createElement(ProgrammeTabs, { base, applications: 6, groups: 4, canEdit: true, groupsOpen: false }));
    assert.deepEqual([...settingsOnly.matchAll(/<a href="[^"]*\/([a-z]+)"/g)].map((m) => m[1]), ["applications", "setup"]);
    // And the lead's whole row, in order, with no Interest tab.
    assert.deepEqual(
      [...open.matchAll(/<a href="[^"]*\/([a-z]+)"/g)].map((m) => m[1]),
      ["overview", "applications", "people", "groups", "weeks", "attendance", "coursework", "messages", "surveys", "setup"],
    );
    assert.doesNotMatch(open, /Interest|<span[^>]*aria-disabled/);
  });
});

// ---------------------------------------------------------------------------
// 2. The week and its sessions
// ---------------------------------------------------------------------------

describe("2. the week and its sessions", () => {
  test("the week the run is in, its dates and theme, and the rail with each week's start", async () => {
    const { model, text: said, html } = await draw("claudia");
    assert.deepEqual(
      { label: model.week.label, title: model.week.title, span: model.week.span, theme: model.week.theme, open: model.week.open },
      { label: "This week", title: "Week 3 of 6", span: "Thu 12 to Wed 18 Nov", theme: "Who decides what AGI means", open: null },
    );
    assert.deepEqual(
      model.week.rail.map((week) => `${week.label} ${week.date}, ${week.stateWord}`),
      [
        "Week 1 Thu 29 Oct, done",
        "Week 2 Thu 5 Nov, done",
        "Week 3 Thu 12 Nov, this week",
        "Week 4 Thu 19 Nov, to come",
        "Week 5 Thu 26 Nov, to come",
        "Week 6 Thu 3 Dec, to come",
      ],
    );
    assert.match(said, /This week Week 3 of 6 Thu 12 to Wed 18 Nov Who decides what AGI means/);
    assert.match(html, /<li class="railStep railCurrent" aria-current="step">/);
    assert.ok(!html.includes("/admin/courses/"), "the lead was sent to a page they cannot open");
  });

  test("an admin is offered the week's editor", async () => {
    const { model } = await draw("zach");
    assert.deepEqual(model.week.open, { href: `/admin/courses/${COURSE.agi}/runs/${RUN.agi}/weeks/w03`, label: "Open week 3" });
  });

  test("before the first day the card is week 1's, and after the last week it says Finished", async () => {
    mock.timers.setTime(new Date("2026-10-27T12:00:00Z").getTime());
    const before = (await draw("claudia")).model.week;
    assert.deepEqual([before.label, before.title, before.span], ["Before the start", "Week 1 of 6", "Thu 29 Oct to Wed 4 Nov"]);
    assert.ok(before.rail.every((week) => week.state === "to-come"));
    mock.timers.setTime(new Date("2026-12-20T12:00:00Z").getTime());
    const after = (await draw("claudia")).model.week;
    assert.deepEqual([after.label, after.title, after.span], ["Finished", "Week 6 of 6", "Thu 3 to Wed 9 Dec"]);
    assert.ok(after.rail.every((week) => week.state === "done"));
  });

  // The sessions come in the order they meet, as wk-overview draws the week.
  // Since the walk of stage two's fixes (G10) their facilitators are named by
  // their whole names, as wk-overview draws them; until then by first names.
  test("each group's session this week, in the order they meet, with its register in the register's own word", async () => {
    const { model, text: said } = await draw("claudia");
    // Each facilitator by the name they go by (`fullNameOfUser`), which since
    // the full names change comes before the account's display name: Sofia,
    // Rahul and Tom go by their first names, and Grace has no other.
    assert.deepEqual(
      model.sessions.map((session) => [session.groupName, session.when, session.where, session.facilitators.map((person) => person.name), session.pill, session.line]),
      [
        ["Group A", "Thu 12 Nov · 6pm", "Portland A13", ["Sofia"], "Register pushed", "3 of 4 came"],
        ["Group D", "Mon 16 Nov · 6pm", "Room D4", ["Grace Okoye"], "Register not pushed", "Saved, not pushed. 1 of 2 so far."],
        ["Group B", "Today · 6pm", "Hallward B12", ["Rahul", "Sofia"], "Today, 6pm", "3 in the group"],
        ["Group C", "Tomorrow · 1pm", "Room B8", ["Tom"], "Tomorrow", null],
      ],
    );
    assert.equal(model.sessions[0].seeIt, `${PAGE_PATH}/attendance?group=${encodeURIComponent(A)}`);
    assert.deepEqual(model.sessions[1].remind, {
      sessionKey: "w03",
      label: "Remind Grace",
      count: 1,
      countLine: "Emails 1 person",
      confirm: "Remind Grace to push Group D’s register for Mon 16 Nov? This emails 1 person.",
    });
    assert.match(said, /Group D Room D4 GO Grace Okoye Register not pushed Saved, not pushed\. 1 of 2 so far\. Remind Grace Emails 1 person/);
    assert.equal(model.sessions[2].today, true);
  });

  test("on the schedule the register's word is finished, on the cards and in the confirm", async () => {
    world.db.seed("config/scheduler", switches({ scheduled: true }));
    const { model } = await draw("claudia");
    assert.equal(model.sessions[0].pill, "Register finished");
    assert.equal(model.sessions[1].pill, "Register not finished");
    assert.equal(model.sessions[1].line, "Saved, not finished. 1 of 2 so far.");
    assert.match(model.sessions[1].remind.confirm, /^Remind Grace to finish Group D’s register for Mon 16 Nov\?/);
  });

  test("a facilitator who has turned task emails off is not offered to the lead: no button, no count", async () => {
    world.db.poke("users/grace", { "profile.notifications": { categories: { tasks: false } } });
    const { model } = await draw("claudia");
    assert.equal(model.sessions[1].groupName, "Group D");
    assert.equal(model.sessions[1].remind, null);
  });
});

// ---------------------------------------------------------------------------
// 3. Needs attention
// ---------------------------------------------------------------------------

// Two absences in a row come in People in groups' order (the walk of stage
// two's fixes, G10): Freya's Group D meets on Mondays, Tariq's Group A on
// Thursdays.
const EVERY_ITEM = [
  "Freya Thompson has missed 2 sessions in a row without saying",
  "Tariq Mensah has missed 2 sessions in a row without saying",
  "Week 4 isn’t ready, and Groups A and D have reached it",
  "Group D’s register for Mon 16 Nov isn’t pushed",
  "Sam Whitfield left on Fri 6 Nov",
  "Omar Haddad left",
];

describe("3. needs attention", () => {
  test("what the records can say, each in its words", async () => {
    const { model, text: said } = await draw("claudia");
    assert.deepEqual(titles(model), EVERY_ITEM);
    const detail = (title) => model.attention.find((item) => item.title === title);
    assert.equal(detail(EVERY_ITEM[0]).detail, "Group D · weeks 2 and 3");
    assert.equal(detail(EVERY_ITEM[1]).detail, "Group A · weeks 2 and 3");
    assert.equal(
      detail(EVERY_ITEM[2]).detail,
      "Groups A and D meet again from Thu 19 Nov. Week 4 isn’t published, so people in these groups can’t open it yet.",
    );
    assert.equal(detail(EVERY_ITEM[2]).link, null, "the lead has no week editor to open");
    // The reminder ships off; the task is on, 60 hours after the session ended.
    assert.equal(detail(EVERY_ITEM[3]).detail, "If it’s still not pushed on Thu 19 Nov at 8am, you and admins get a task.");
    assert.deepEqual(detail(EVERY_ITEM[3]).link, { href: `${PAGE_PATH}/attendance?group=${encodeURIComponent(D)}`, label: "See it" });
    assert.equal(detail(EVERY_ITEM[4]).detail, `Sam said: “${SAM_SAID}” Sam’s off Group A’s register from week 3.`);
    assert.equal(detail(EVERY_ITEM[5]).detail, "Omar’s off Group B’s register.");
    assert.match(said, /Needs attention 6 /);
    assert.ok(!said.includes("Email Tariq") && !said.includes("Email Freya"), "a control for a feature that is not built");
  });

  test("the chase in the jobs' own times, for an admin: the reminder when it is on, and who gets the task", async () => {
    world.db.seed("config/scheduler", switches({ reminders: true }));
    const { model } = await draw("zach");
    const item = model.attention.find((entry) => entry.kind === "register");
    assert.equal(
      item.detail,
      "We’ll remind Grace on Wed 18 Nov at 8am. If it’s still not pushed on Thu 19 Nov at 8am, Claudia and admins get a task.",
    );
    const week = model.attention.find((entry) => entry.kind === "week");
    assert.deepEqual(week.link, { href: `/admin/courses/${COURSE.agi}/runs/${RUN.agi}/weeks/w04`, label: "Open week 4" });
  });

  test("the hours are read from Course settings, and a task already made is said so", async () => {
    world.db.seed("config/courses", { unmarkedRegisterGraceHours: 12, registerTaskHours: 14 });
    world.db.seed("config/scheduler", switches({ reminders: true }));
    const item = (await draw("claudia")).model.attention.find((entry) => entry.kind === "register");
    assert.equal(item.detail, "You and admins have a task for it.");
  });

  test("each item goes away with the record that put it there", async () => {
    // Tariq comes to a session: two absences are no longer the latest marks.
    world.db.seed(registerPath(A, 4), { ...world.db.read(registerPath(A, 3)), weekNumber: 4, records: { tariq: "present" } });
    mock.timers.setTime(new Date("2026-11-19T21:00:00Z").getTime());
    let model = (await draw("claudia")).model;
    assert.ok(!titles(model).some((title) => title.startsWith("Tariq")), titles(model).join(" | "));
    mock.timers.setTime(NOW.getTime());
    start();

    // Week 4 is published.
    world.db.poke(`courseRuns/${RUN.agi}/weeks/w04`, { published: true });
    model = (await draw("claudia")).model;
    assert.ok(!titles(model).some((title) => title.startsWith("Week 4")));

    // Group D's register is finished.
    world.db.poke(registerPath(D, 3), { pushedAt: NOW, pushedByUid: "grace" });
    model = (await draw("claudia")).model;
    assert.ok(!titles(model).some((title) => title.startsWith("Group D’s register")));
    assert.equal(model.sessions[0].pill, "Register pushed");

    // Freya's and Tariq's latest marks are corrected to present; Sam and Omar are put back.
    world.db.poke(registerPath(D, 3), { "records.freya": "present" });
    world.db.poke(registerPath(A, 3), { "records.tariq": "present" });
    world.db.poke(`courseEnrolments/${RUN.agi}__sam`, { status: "active", droppedOutAt: null, dropOutReason: null });
    world.db.poke(`courseEnrolments/${RUN.agi}__omar`, { status: "active", groupId: B });
    model = (await draw("claudia")).model;
    assert.deepEqual(titles(model), []);
    assert.match((await draw("claudia")).text, /Needs attention Nothing needs attention\./);
  });

  // A leaver no register marked: People names them, and the Overview is the
  // one page that reads what they said, so it names them too, with the day
  // and their reason, whether they left by themselves or were taken off.
  // The grid keeps its own rule: a row there is somebody a register marked.
  test("somebody who left before any register marked them is named with the day and what they said, and counted as left; the grid still leaves them out", async () => {
    // Una, placed in Group C and told, leaves on Tue 10 Nov before a register
    // marks Una; Zoe, placed and told, is taken off by staff on Thu 12 Nov
    // before one marks Zoe (a removal clears the seat's group).
    world.db.poke(`courseEnrolments/${RUN.agi}__una`, {
      status: "withdrawn",
      allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
      droppedOutAt: new Date("2026-11-10T10:00:00Z"),
      dropOutReason: "My timetable changed.",
    });
    world.db.seed("users/zoe", { ...world.db.read("users/hamza"), uid: "zoe", displayName: "Zoe Adams", profile: { ...world.db.read("users/hamza").profile, preferredName: "Zoe Adams" } });
    world.db.seed(`courseEnrolments/${RUN.agi}__zoe`, {
      ...world.db.read(`courseEnrolments/${RUN.agi}__hamza`),
      uid: "zoe",
      groupId: null,
      status: "removed",
      allocatedEmailAt: null,
      droppedOutAt: new Date("2026-11-12T10:00:00Z"),
    });
    for (const who of ["claudia", "zach"]) {
      const { model, text: said } = await draw(who);
      assert.deepEqual(
        model.attention.filter((item) => item.kind === "left").map((item) => [item.title, item.detail]),
        [
          ["Zoe Adams left on Thu 12 Nov", ""],
          ["Una Byrne left on Tue 10 Nov", "Una said: “My timetable changed.” Una’s off Group C’s register from week 2."],
          ["Sam Whitfield left on Fri 6 Nov", `Sam said: “${SAM_SAID}” Sam’s off Group A’s register from week 3.`],
          ["Omar Haddad left", "Omar’s off Group B’s register."],
        ],
        who,
      );
      assert.equal(model.people.left, 4, who);
      assert.equal(model.people.line, "4 left. Places can’t be offered after week 1.", who);
      assert.match(said, /Needs attention 8 /, who);
      // Neither is taking part, for the lead or for an admin.
      assert.equal(model.people.takingPart, 10, who);
    }
    // The grid lists neither: no register marked them.
    const { readRunRecords, buildRunAttendance } = await lib("courses", "programmeAttendance.ts");
    const records = await readRunRecords(world.db, RUN.agi);
    const rows = buildRunAttendance(records, { isAdmin: true }, NOW).groups.flatMap((group) => group.people.map((person) => person.uid));
    assert.ok(rows.includes("sam") && rows.includes("omar"), "the leavers a register marked are rows");
    assert.ok(!rows.includes("una") && !rows.includes("zoe"), "a leaver no register marked is no row of the grid");
  });

  test("a register marked as not held needs nothing", async () => {
    world.db.poke(registerPath(D, 3), { held: false });
    const { model } = await draw("claudia");
    assert.ok(!titles(model).some((title) => title.startsWith("Group D’s register")));
    assert.deepEqual([model.sessions[1].groupName, model.sessions[1].pill, model.sessions[1].line, model.sessions[1].remind], ["Group D", "Not held", null, null]);
  });
});

// ---------------------------------------------------------------------------
// 4. Attendance by week, and the people
// ---------------------------------------------------------------------------

describe("4. attendance by week, and the people", () => {
  test("the grid's figures, and which groups the week so far is from", async () => {
    const { model, html } = await draw("claudia");
    assert.deepEqual(
      model.chart.weeks.map((week) => [week.label, week.percent, week.soFar]),
      [
        ["W1", 92, false],
        ["W2", 64, false],
        ["W3", 67, true],
        ["W4", null, false],
        ["W5", null, false],
        ["W6", null, false],
      ],
    );
    assert.equal(model.chart.from, "Week 3 is from Groups A and D so far.");
    assert.equal(
      model.chart.description,
      "Who came, by week: week 1 92%, week 2 64%, week 3 67% so far. Weeks 4 to 6 not yet.",
    );
    assert.match(html, /role="img" aria-label="Who came, by week: week 1 92%, week 2 64%, week 3 67% so far\. Weeks 4 to 6 not yet\."/);
    assert.match(html, new RegExp(`href="${PAGE_PATH}/attendance"[^>]*>All attendance`));
  });

  test("how many take part and how many left, and that freed places are over", async () => {
    const { model, text: said } = await draw("claudia");
    assert.deepEqual(model.people, { takingPart: 10, left: 2, line: "2 left. Places can’t be offered after week 1." });
    assert.match(said, /People 10 taking part 2 left\. Places can’t be offered after week 1\./);
    // An admin is shown everybody placed: Una too.
    assert.equal((await draw("zach")).model.people.takingPart, 11);
  });

  test("in week 1 the line says until when a freed place can be offered", async () => {
    mock.timers.setTime(new Date("2026-11-02T12:00:00Z").getTime());
    assert.equal(
      (await draw("claudia")).model.people.line,
      "2 left. Freed places can be offered until Wed 4 Nov, the end of week 1.",
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Remind
// ---------------------------------------------------------------------------

describe("5. Remind emails the group's facilitators and nobody else", () => {
  test("the lead's press emails Grace once, with the reminder's own words, and the card then says so", async () => {
    const pressed = await remind("claudia", GRACE);
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual(pressed.body, { emailed: 1, failed: 0, names: ["Grace"] });
    // The reminder says "pushed" while the register's button says "Push
    // attendance", as this Overview does (the walk of stage two's fixes, G9).
    assert.deepEqual(
      world.mail.map((message) => [message.to, message.subject, message.kind]),
      [["grace@example.com", "Group D’s register isn’t pushed", "course-facilitator"]],
    );
    const marker = world.db.read(MARKER);
    assert.equal(marker.job, "courses-register-reminders");
    assert.equal(marker.pressedByUid, "claudia");
    assert.ok(marker.sentAt instanceof Date);
    const { model } = await draw("claudia");
    const groupD = model.sessions.find((session) => session.groupName === "Group D");
    assert.equal(groupD.remind, null, "a second button for a reminder already sent");
    assert.equal(groupD.reminded, "Grace was reminded on Tue 17 Nov at 12pm.");
    assert.equal(
      model.attention.find((item) => item.kind === "register").detail,
      "Grace was reminded on Tue 17 Nov at 12pm. If it’s still not pushed on Thu 19 Nov at 8am, you and admins get a task.",
    );
  });

  test("once per facilitator per register: a second press emails nobody, and nor does the job", async () => {
    assert.equal((await remind("claudia", GRACE)).status, 200);
    world.mail.length = 0;
    const again = await remind("zach", GRACE);
    assert.equal(again.status, 409);
    assert.equal(
      again.body.error,
      "Nobody is left to remind about Group D’s register: its facilitators have been reminded already, or can’t be emailed.",
    );
    world.db.seed("config/scheduler", switches({ reminders: true }));
    await runReminderJob(new Date("2026-11-18T09:00:00Z"));
    assert.deepEqual(world.mail, [], "Grace heard about one register twice");
  });

  test("the job first: the press then finds Grace reminded", async () => {
    world.db.seed("config/scheduler", switches({ reminders: true }));
    await runReminderJob(new Date("2026-11-18T09:00:00Z"));
    assert.equal(world.mail.length, 1);
    world.mail.length = 0;
    const { model } = await draw("claudia");
    const groupD = model.sessions.find((session) => session.groupName === "Group D");
    assert.equal(groupD.reminded, "Grace was reminded on Wed 18 Nov at 9am.");
    assert.equal(groupD.remind, null);
    assert.equal((await remind("claudia", GRACE)).status, 409);
    assert.deepEqual(world.mail, []);
  });

  test("the count must be the one the button showed", async () => {
    const refused = await remind("claudia", { ...GRACE, emails: 2 });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "The number of people this reminder emails has changed. Reload the page to see who it reaches now.");
    assert.deepEqual(world.mail, []);
    assert.equal(world.db.read(MARKER), undefined);
  });

  test("only a register not finished, of a session that has ended, of one of the run's groups", async () => {
    const tonight = await remind("claudia", { groupId: B, sessionKey: "w03", emails: 1 });
    assert.deepEqual([tonight.status, tonight.body.error], [409, "Group B’s session on Tue 17 Nov hasn’t finished yet, so there’s nothing to remind anybody about."]);
    const finished = await remind("claudia", { groupId: A, sessionKey: "w03", emails: 1 });
    assert.deepEqual([finished.status, finished.body.error], [409, "Group A’s register for Thu 12 Nov is already pushed."]);
    const elsewhere = await remind("claudia", { groupId: "somebody-elses-group", sessionKey: "w03", emails: 1 });
    assert.deepEqual([elsewhere.status, elsewhere.body.error], [404, "That group isn’t one of AGI Strategy’s."]);
    const noSession = await remind("claudia", { groupId: D, sessionKey: "w09", emails: 1 });
    assert.deepEqual([noSession.status, noSession.body.error], [404, "That session isn’t one of Group D’s."]);
    world.db.poke(registerPath(D, 3), { held: false });
    const notHeld = await remind("claudia", GRACE);
    assert.deepEqual([notHeld.status, notHeld.body.error], [409, "Group D’s session on Mon 16 Nov didn’t happen, so its register needs nothing."]);
    assert.deepEqual(world.mail, []);
  });

  test("the body is checked before anything is read", async () => {
    for (const [body, error] of [
      [undefined, "Say which group’s register to remind its facilitators about."],
      [{ sessionKey: "w03", emails: 1 }, "Say which group’s register to remind its facilitators about."],
      [{ groupId: D, sessionKey: "week three", emails: 1 }, "Say which session’s register it is."],
      [{ groupId: D, sessionKey: "w03" }, "Say how many people the reminder emails, as the button showed it."],
      [{ groupId: D, sessionKey: "w03", emails: 0 }, "Say how many people the reminder emails, as the button showed it."],
    ]) {
      const before = made.everything();
      const refused = await remind("tess", body);
      assert.deepEqual([refused.status, refused.body.error], [400, error]);
      assert.equal(made.everything(), before);
    }
  });

  test("every other caller is refused, and nobody is emailed", async () => {
    for (const [who, status] of [
      ["lloyd", 403],
      ["tess", 404],
      ["yusuf", 404],
      ["rahul", 404],
      ["grace", 404],
      ["amara", 404],
      ["una", 404],
      ["nobody", 404],
      [null, 401],
    ]) {
      const refused = await remind(who, GRACE);
      assert.equal(refused.status, status, String(who));
    }
    assert.deepEqual(world.mail, []);
    assert.equal(world.db.read(MARKER), undefined);
  });

  test("an admin may press it, and a view-as session is refused before anything is read", async () => {
    const before = made.everything();
    const viewing = await remind("zach", GRACE, { viewAs: true });
    assert.equal(viewing.status, 403);
    assert.equal(made.everything(), before);
    const pressed = await remind("zach", GRACE);
    assert.deepEqual([pressed.status, pressed.body.emailed], [200, 1]);
    assert.equal(world.db.read(MARKER).pressedByUid, "zach");
  });

  test("a send that fails is said so, and its marker is left for the job to take again", async () => {
    world.mailFate = () => "fail";
    const failed = await remind("claudia", GRACE);
    assert.deepEqual([failed.status, failed.body.error], [502, "The reminder couldn’t be sent just now. Try again in a few minutes."]);
    const marker = world.db.read(MARKER);
    assert.equal(marker.sentAt, null);
    assert.match(marker.lastError, /did not send/);
  });

  test("a group with two facilitators: both are named, counted and emailed, and nobody in the group is", async () => {
    world.db.poke(`courseGroups/${D}`, { facilitatorUids: ["grace", "tom"] });
    const { model } = await draw("claudia");
    const groupD = model.sessions.find((session) => session.groupName === "Group D");
    assert.deepEqual([groupD.remind.label, groupD.remind.countLine], ["Remind Grace and Tom", "Emails 2 people"]);
    const pressed = await remind("claudia", { ...GRACE, emails: 2 });
    assert.deepEqual(pressed.body, { emailed: 2, failed: 0, names: ["Grace", "Tom"] });
    assert.deepEqual(world.mail.map((message) => message.to).sort(), ["grace@example.com", "tom@example.com"]);
  });
});

// ---------------------------------------------------------------------------
// 6. The Updates card
// ---------------------------------------------------------------------------

describe("6. the Updates card shows the newest updates and leads to Messages", () => {
  const update = (id, fields) => world.db.seed(`courseUpdates/${id}`, { runId: RUN.agi, message: "Same time, 6pm.", ...fields });
  const settled = (sent) => ({ planned: sent, sent, held: 0, suppressed: 0, failed: 0, settled: true });

  test("with none yet, it says so and offers to write one", async () => {
    const { element, html, text: said } = await draw("claudia");
    assert.deepEqual(find(element, "ProgrammeOverview")[0].props.updates, []);
    assert.match(said, /Updates Write an update No updates yet\./);
    assert.match(html, new RegExp(`href="${PAGE_PATH}/messages"[^>]*>Write an update`));
  });

  test("the two newest, worded as the Messages tab words them, for the lead and an admin alike", async () => {
    update("u1", { to: "everyone", title: "Week 3 readings are up", authorUid: "claudia", postedAt: new Date("2026-11-12T10:00:00Z"), email: settled(10) });
    update("u2", { to: "group", groupId: D, title: "Room change for Group D this week", authorUid: "grace", postedAt: new Date("2026-11-16T09:00:00Z"), email: settled(3) });
    update("u3", { to: "facilitators", title: "Facilitators’ notes for week 3", authorUid: "zach", postedAt: new Date("2026-11-10T09:00:00Z") });
    for (const who of ["claudia", "zach"]) {
      const { element, html, wrote } = await draw(who);
      const shown = find(element, "ProgrammeOverview")[0].props.updates;
      assert.deepEqual(
        shown.map((row) => [row.id, row.title, row.authorUid, row.meta]),
        [
          ["u2", "Room change for Group D this week", "grace", "Grace → Group D · Mon 16 Nov · Emailed to 3"],
          ["u1", "Week 3 readings are up", "claudia", "Claudia → Everyone · Thu 12 Nov · Emailed to 10"],
        ],
        who,
      );
      for (const title of ["Room change for Group D this week", "Week 3 readings are up"]) {
        assert.match(html, new RegExp(`href="${PAGE_PATH}/messages"[^>]*>${title}<`), `${who}: ${title}`);
      }
      assert.ok(!html.includes("Facilitators’ notes for week 3"), `${who} was shown a third update`);
      assert.equal(wrote, false, who);
    }
  });
});
