/**
 * A programme's Overview tab and its "Remind", as every
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
 *  4. ATTENDANCE BY WEEK, THE GROUPS IN A WEEK AND THE PEOPLE: each week
 *     from its finished registers only, by kind, as the grid counts them,
 *     somebody moved between groups once in each week's own group, a
 *     session that didn't happen counted for nobody; one row per group for
 *     the chosen week (`?week=`), opening its page on that week; the empty
 *     states; how many take part and how many left.
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
  C,
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
  "./OverviewByWeek.module.css",
  "./Select.module.css",
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

/** The Overview as `who` sees it with `?week=` in the address. */
async function drawWeek(who, week) {
  globalThis.__hubOverviewPages.user = sessionFor(who);
  const element = await OverviewPage({
    params: Promise.resolve({ roundId: ROUND, programmeId: AGI }),
    searchParams: Promise.resolve({ week }),
  });
  const [overview] = find(element, "ProgrammeOverview");
  return { model: overview?.props.model ?? null, html: renderToStaticMarkup(element) };
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
      // The week's page on the Weeks tab, the lead's as much as an admin's.
      {
        label: "This week",
        title: "Week 3 of 6",
        span: "Thu 12 to Wed 18 Nov",
        theme: "Who decides what AGI means",
        open: { href: `${PAGE_PATH}/weeks/w03`, label: "Open week 3" },
      },
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
    assert.ok(!html.includes("/admin/courses/"), "the Overview sent somebody into the older editor");
  });

  test("an admin is offered the same week's page on the Weeks tab, never the older week editor", async () => {
    const { model, html } = await draw("zach");
    assert.deepEqual(model.week.open, { href: `${PAGE_PATH}/weeks/w03`, label: "Open week 3" });
    assert.ok(!html.includes("/admin/courses/"), "the Overview sent an admin into the older editor");
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

  // The sessions come in the order they meet, as the Overview tab draws the week.
  // Since the walk of stage two's fixes (G10) their facilitators are named by
  // their whole names, as the Overview tab draws them; until then by first names.
  test("each group's session this week, in the order they meet, with its register in the register's own word", async () => {
    const { model, text: said } = await draw("claudia");
    // Each facilitator by the names rule for the lead, who is on the
    // committee (`nameForViewer`): each account's full name, here its own
    // name, which begins with the name each goes by.
    assert.deepEqual(
      model.sessions.map((session) => [session.groupName, session.when, session.where, session.facilitators.map((person) => person.name), session.pill, session.line]),
      [
        ["Group A", "Thu 12 Nov · 6pm", "Portland A13", ["Sofia Rossi"], "Register pushed", "3 of 4 came"],
        ["Group D", "Mon 16 Nov · 6pm", "Room D4", ["Grace Okoye"], "Register not pushed", "Saved, not pushed. 1 of 2 so far."],
        ["Group B", "Today · 6pm", "Hallward B12", ["Rahul Mehta", "Sofia Rossi"], "Today, 6pm", "3 in the group"],
        ["Group C", "Tomorrow · 1pm", "Room B8", ["Tom Fletcher"], "Tomorrow", null],
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
    assert.deepEqual(detail(EVERY_ITEM[2]).link, { href: `${PAGE_PATH}/weeks/w04`, label: "Open week 4" }, "the lead opens the week on the Weeks tab");
    // The reminder ships off; the task is on, 60 hours after the session ended.
    assert.equal(detail(EVERY_ITEM[3]).detail, "If it’s still not pushed on Thu 19 Nov at 8am, you and admins get a task.");
    // CHANGED ON PURPOSE (November 2026), with covering a register: the line
    // for a register not finished leads to the ways to take it, on the
    // group's page, open on that week.
    assert.deepEqual(detail(EVERY_ITEM[3]).link, { href: `${PAGE_PATH}/groups/${encodeURIComponent(D)}?take=3`, label: "Take the register" });
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
    assert.deepEqual(week.link, { href: `${PAGE_PATH}/weeks/w04`, label: "Open week 4" });
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

  test("after a restore, a session that passed while the group was archived asks for nothing: no attention row, no promise, no Remind", async () => {
    // Group D was archived over its week 3 session (Mon 16 Nov) and restored the next morning.
    world.db.seed("config/scheduler", switches({ reminders: true }));
    world.db.poke(`courseGroups/${D}`, { restoredAt: new Date("2026-11-17T09:00:00Z") });
    const { model } = await draw("zach");
    assert.equal(model.attention.filter((entry) => entry.kind === "register").length, 0, JSON.stringify(titles(model)));
    assert.ok(!JSON.stringify(model.attention).includes("We’ll remind"), "a reminder is promised that never comes");
    const row = model.sessions.find((entry) => entry.groupId === D && entry.dateKey === "2026-11-16");
    assert.ok(row, "Group D’s week 3 session is in the week shown");
    assert.deepEqual([row.state, row.remind], ["not-held", null]);
    const pressed = await remind("claudia", GRACE);
    assert.deepEqual(
      [pressed.status, pressed.body.error],
      [409, "Group D’s session on Mon 16 Nov passed while it was archived, so no register is owed and nobody is reminded."],
    );
    assert.deepEqual(world.mail, []);
  });

  test("a register that was taken for such a session still shows and counts as before", async () => {
    world.db.poke(`courseGroups/${D}`, { restoredAt: new Date("2026-11-17T09:00:00Z") });
    world.db.poke(registerPath(D, 3), { pushedAt: new Date("2026-11-16T21:00:00Z") });
    const { model } = await draw("zach");
    const row = model.sessions.find((entry) => entry.groupId === D && entry.dateKey === "2026-11-16");
    assert.ok(row);
    assert.equal(row.state, "finished");
    assert.equal(model.attention.filter((entry) => entry.kind === "register").length, 0);
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
  test("attendance by week counts finished registers only, by kind, and says how far each week has got", async () => {
    const { model, html } = await draw("claudia");
    assert.equal(model.ending, "pushed");
    assert.equal(model.byWeek.blank, null);
    assert.deepEqual(
      model.byWeek.weeks.map((week) => [week.label, week.when, week.state, week.counts, week.line, week.unfinished]),
      [
        // Every register of weeks 1 and 2 is finished: the week's whole count.
        ["Week 1", "w/c Thu 29 Oct", "done", { room: 11, online: 0, excused: 1, absent: 0 }, "11 of 12 came", null],
        ["Week 2", "w/c Thu 5 Nov", "done", { room: 7, online: 0, excused: 1, absent: 3 }, "7 of 11 came", null],
        // Group A's register is finished; Group D met on Monday and its saved
        // register (Freya absent, Yasmin present) counts for nobody yet.
        ["Week 3", "this week", "so-far", { room: 3, online: 0, excused: 0, absent: 1 }, "2 of 4 groups have met so far", "1 register not pushed yet"],
        ["Week 4", "w/c Thu 19 Nov", "not-met", { room: 0, online: 0, excused: 0, absent: 0 }, "Not met yet", null],
        ["Week 5", "w/c Thu 26 Nov", "not-met", { room: 0, online: 0, excused: 0, absent: 0 }, "Not met yet", null],
        ["Week 6", "w/c Thu 3 Dec", "not-met", { room: 0, online: 0, excused: 0, absent: 0 }, "Not met yet", null],
      ],
    );
    // The same figures the Attendance tab's grid holds, where every register of the week is finished.
    const { readRunRecords, buildRunAttendance } = await lib("courses", "programmeAttendance.ts");
    const grid = buildRunAttendance(await readRunRecords(world.db, RUN.agi), { isAdmin: false }, NOW);
    for (const weekNumber of [1, 2]) {
      const total = grid.totals.find((each) => each.weekNumber === weekNumber);
      const row = model.byWeek.weeks.find((each) => each.weekNumber === weekNumber);
      assert.deepEqual([row.came, row.of, row.counts.online], [total.came, total.of, total.online], `week ${weekNumber}`);
    }
    assert.match(html, /role="img" aria-label="Week 1: in the room 11, online 0, excused 1, absent 0\."/);
    assert.match(html, new RegExp(`href="${PAGE_PATH}/attendance"[^>]*>Week 1`));
    assert.ok(!/Who came, by week/.test(html), "the old percentage chart is gone");
  });

  test("one row per group for the week the programme is in, each opening the group's page on that week", async () => {
    const { model, html, text: said } = await draw("claudia");
    const groups = model.byWeek.groups;
    assert.equal(groups.heading, "Groups in week 3");
    assert.deepEqual([groups.sessionHeading, groups.beforeHeading, groups.cameHeading], ["Week 3 session", "Week 2 came", "Week 3 came"]);
    assert.deepEqual(
      groups.options.map((option) => option.label),
      ["Week 1", "Week 2", "Week 3 (this week)", "Week 4", "Week 5", "Week 6"],
    );
    assert.deepEqual(
      groups.rows.map((row) => [row.groupName, row.facilitators, row.session, row.cameBefore, row.came]),
      [
        ["Group D", "Grace Okoye", "Mon 16 Nov, 6pm", "1 of 2", "Not pushed"],
        ["Group B", "Rahul Mehta and Sofia Rossi", "Today, 6pm", "3 of 3", "Tonight"],
        ["Group C", "Tom Fletcher", "Tomorrow, 1pm", "1 of 1", "Tomorrow"],
        ["Group A", "Sofia Rossi", "Thu 12 Nov, 6pm", "2 of 5", "3 of 4"],
      ],
    );
    // These weeks are not written as blocks, so their groups' pages count no week's work either.
    assert.ok(groups.rows.every((row) => row.readings === "Not tracked" && row.coursework === "Not tracked"));
    for (const row of groups.rows) {
      assert.equal(row.href, `${PAGE_PATH}/groups/${encodeURIComponent(row.groupId)}?week=3`);
      assert.ok(html.includes(`href="${row.href}"`), `${row.groupName} opens nothing`);
    }
    // The week picker is a plain GET form on the tab's own address.
    assert.match(html, new RegExp(`<form[^>]* action="${PAGE_PATH}/overview" method="get"`));
    assert.match(html, /<select[^>]*name="week"/);
    assert.match(said, /Groups in week 3 Each row opens that group’s page\. Week /);
    // An admin is drawn the same figures here: Una, whom Publish has not told, has no mark.
    assert.deepEqual((await draw("zach")).model.byWeek.groups.rows.map((row) => row.came), groups.rows.map((row) => row.came));
  });

  test("another week is chosen from the address, and a week nobody has met says so in every row", async () => {
    const element = await drawWeek("claudia", "5");
    const groups = element.model.byWeek.groups;
    assert.equal(groups.heading, "Groups in week 5");
    assert.deepEqual(
      groups.rows.map((row) => [row.groupName, row.cameBefore, row.came]),
      [
        ["Group D", "No register yet", "No register yet"],
        ["Group B", "No register yet", "No register yet"],
        ["Group C", "No register yet", "No register yet"],
        ["Group A", "No register yet", "No register yet"],
      ],
    );
    assert.ok(groups.rows.every((row) => row.href.endsWith("?week=5")));
    // Week 1 has no week before it; an address that is not a week of the run opens on this week.
    assert.equal((await drawWeek("claudia", "1")).model.byWeek.groups.beforeHeading, null);
    assert.equal((await drawWeek("claudia", "9")).model.byWeek.groups.weekNumber, 3);
    assert.equal((await drawWeek("claudia", "3; drop")).model.byWeek.groups.weekNumber, 3);
  });

  test("a session that didn't happen is no session: its group leaves the week's count", async () => {
    world.db.poke(registerPath(D, 3), { held: false });
    const { model } = await draw("claudia");
    const week3 = model.byWeek.weeks.find((week) => week.weekNumber === 3);
    assert.deepEqual([week3.line, week3.unfinished, week3.counts], ["1 of 3 groups have met so far", null, { room: 3, online: 0, excused: 0, absent: 1 }]);
    const d = model.byWeek.groups.rows.find((row) => row.groupId === D);
    assert.deepEqual([d.session, d.came], ["Mon 16 Nov, 6pm · not held", "Not held"]);
  });

  test("once Group D's register is finished, week 3 counts it, and a moved week and a room to confirm are said", async () => {
    world.db.poke(registerPath(D, 3), { pushedAt: new Date("2026-11-16T20:30:00Z"), pushedByUid: "grace" });
    world.db.poke(`courseGroups/${C}`, {
      "session.location": "",
      "sessionChanges.w03": { kind: "moved", reason: "A room clash.", dateKey: "2026-11-18", byUid: "zach", at: NOW },
    });
    const { model } = await draw("claudia");
    const week3 = model.byWeek.weeks.find((week) => week.weekNumber === 3);
    assert.deepEqual([week3.line, week3.counts], ["2 of 4 groups have met so far", { room: 4, online: 0, excused: 0, absent: 2 }]);
    assert.equal(model.byWeek.groups.rows.find((row) => row.groupId === D).came, "1 of 2");
    const c = model.byWeek.groups.rows.find((row) => row.groupId === C);
    assert.deepEqual([c.session, c.moved], ["Tomorrow, 1pm · moved · room to be confirmed", true]);
    assert.ok(model.byWeek.groups.rows.filter((row) => row.groupId !== C).every((row) => !row.moved));
  });

  test("somebody moved between groups is counted once, in each week's own group", async () => {
    // Kofi moves from Group B to Group A from week 3, and Group A's finished week 3 register marks him.
    world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, {
      groupId: A,
      groupsByWeek: [
        { groupId: B, fromWeek: 1 },
        { groupId: A, fromWeek: 3 },
      ],
    });
    world.db.poke(registerPath(A, 3), { "records.kofi": "present" });
    const { model } = await draw("claudia");
    const byWeek = Object.fromEntries(model.byWeek.weeks.map((week) => [week.weekNumber, week.counts]));
    // Weeks 1 and 2 as before: his marks there are Group B's, counted once.
    assert.deepEqual(byWeek[1], { room: 11, online: 0, excused: 1, absent: 0 });
    assert.deepEqual(byWeek[2], { room: 7, online: 0, excused: 1, absent: 3 });
    assert.deepEqual(byWeek[3], { room: 4, online: 0, excused: 0, absent: 1 });
    const rows = Object.fromEntries(model.byWeek.groups.rows.map((row) => [row.groupName, [row.cameBefore, row.came]]));
    assert.deepEqual(rows["Group B"], ["3 of 3", "Tonight"]);
    assert.deepEqual(rows["Group A"], ["2 of 5", "4 of 5"]);
  });

  test("a run with no weeks, and one with no groups, say so instead of counting", async () => {
    const { readRunRecords, listGroups } = await lib("courses", "programmeAttendance.ts");
    const { buildProgrammeOverview } = await lib("courses", "programmeOverview.ts");
    const { attendanceByWeek, NO_GROUPS_YET, NO_WEEKS_YET } = await lib("courses", "overviewByWeek.ts");
    const records = await readRunRecords(world.db, RUN.agi);
    const place = { programmePath: PAGE_PATH, courseId: COURSE.agi, decisionsSentAt: null };
    const viewer = { isAdmin: false, uid: "claudia" };
    const noGroups = await buildProgrammeOverview(world.db, { ...records, groups: [] }, viewer, place, NOW);
    assert.deepEqual(noGroups.byWeek, { weeks: [], groups: null, blank: NO_GROUPS_YET });
    const noWeeks = await buildProgrammeOverview(world.db, { ...records, run: { ...records.run, weekPlan: [] }, groups: [] }, viewer, place, NOW);
    assert.deepEqual(noWeeks.byWeek, { weeks: [], groups: null, blank: NO_WEEKS_YET });
    // The pure rows over nothing: nothing.
    assert.deepEqual(attendanceByWeek({ listed: listGroups(records, viewer, NOW, []), weeks: [], slots: [], thisWeek: null, totals: [], ending: "pushed" }), []);
  });

  test("somebody who joined online is counted online, and a whole week's figure is the Attendance tab's own total", async () => {
    // Dev came to week 2 online (a finished register), and Amara to week 3 (Group A's, finished; the week is not whole).
    world.db.poke(registerPath(A, 2), { "online.dev": true });
    world.db.poke(registerPath(A, 3), { "online.amara": true });
    const { model, html } = await draw("claudia");
    const byWeek = Object.fromEntries(model.byWeek.weeks.map((week) => [week.weekNumber, week]));
    assert.deepEqual(byWeek[2].counts, { room: 6, online: 1, excused: 1, absent: 3 });
    assert.equal(byWeek[2].line, "7 of 11 came");
    assert.deepEqual(byWeek[3].counts, { room: 2, online: 1, excused: 0, absent: 1 });
    assert.match(html, /aria-label="Week 2: in the room 6, online 1, excused 1, absent 3\."/);
    const { readRunRecords, buildRunAttendance } = await lib("courses", "programmeAttendance.ts");
    const total = buildRunAttendance(await readRunRecords(world.db, RUN.agi), { isAdmin: false }, NOW).totals.find((each) => each.weekNumber === 2);
    assert.deepEqual([byWeek[2].came, byWeek[2].of, byWeek[2].counts.online], [total.came, total.of, total.online]);
    // A group's row: Group A's week 2 and week 3, the online mark counted as came.
    const a = model.byWeek.groups.rows.find((row) => row.groupId === A);
    assert.deepEqual([a.cameBefore, a.came], ["2 of 5", "3 of 4"]);
    // The line the old chart carried stays, under the rows, and the card names where a week goes.
    assert.match(html, /Late and left early count as came\./);
    assert.match(html, /Every group, from the pushed registers\. Each week opens the Attendance tab\./);
  });

  test("a whole week reads the tab's total, even a week only a group archived since held", async () => {
    const { attendanceByWeek } = await lib("courses", "overviewByWeek.ts");
    const totals = [{ weekNumber: 1, percent: 75, came: 3, of: 4, online: 1, soFar: false, from: ["Group Z"] }];
    const [row] = attendanceByWeek({ listed: [], weeks: [1], slots: [], thisWeek: null, totals, ending: "finished" });
    assert.deepEqual([row.state, row.line, row.counts], ["done", "3 of 4 came", { room: 2, online: 1, excused: 0, absent: 1 }]);
    const [none] = attendanceByWeek({ listed: [], weeks: [1], slots: [], thisWeek: null, totals: [], ending: "finished" });
    assert.deepEqual([none.state, none.line], ["none", "No group meets in week 1"]);
  });

  test("a held session with no date keeps the week from no state, and its row says it has no date yet", async () => {
    // Group D's week 3 register finished; Groups B and C's week 3 sessions have no date and no register.
    world.db.poke(registerPath(D, 3), { pushedAt: new Date("2026-11-16T20:30:00Z"), pushedByUid: "grace" });
    const { readRunRecords, listGroups, weeksOf, buildRunAttendance } = await lib("courses", "programmeAttendance.ts");
    const { attendanceByWeek, groupsInWeek } = await lib("courses", "overviewByWeek.ts");
    const records = await readRunRecords(world.db, RUN.agi);
    const viewer = { isAdmin: false };
    const listed = listGroups(records, viewer, NOW, weeksOf(records));
    for (const entry of listed.filter((each) => each.group.id === B || each.group.id === C)) {
      const facts = entry.sessions.get(3);
      Object.assign(facts, { startsAt: null, endsAt: null, started: false, ended: false, tag: null, session: { ...facts.session, dateKey: "" } });
    }
    const totals = buildRunAttendance(records, viewer, NOW).totals;
    const week3 = attendanceByWeek({ listed, weeks: [3], slots: [], thisWeek: 3, totals, ending: "pushed" })[0];
    assert.deepEqual([week3.state, week3.line], ["done", "4 of 6 came"]);
    const rows = groupsInWeek({ listed, weeks: [1, 2, 3], weekNumber: 3, thisWeek: 3, work: new Map(), ending: "pushed", todayKey: "2026-11-17", programmePath: PAGE_PATH }).rows;
    assert.deepEqual(rows.filter((row) => row.groupId === B || row.groupId === C).map((row) => [row.session, row.came]), [
      ["No date yet", "No date yet"],
      ["No date yet", "No date yet"],
    ]);
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
