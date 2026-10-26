/**
 * The follow-ups to Publish: Remove gives the place on the form back, as
 * leaving does, and what the person's own page then says; the register
 * reminder opens the register; and the hand-over panel lists who left and who
 * was taken off apart.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST  /api/courses/runs/[runId]/enrolments/[uid]/remove
 *   POST  /api/admissions/forms/[roundId]/application/reply      "I can’t make it", before the removal
 *   POST  /api/courses/runs/[runId]/allocate                     putting somebody back
 *   GET   /api/courses/runs/[runId]/allocation                   the cards, and Publish's count
 *   POST  /api/courses/runs/[runId]/allocation/publish(/test)
 *   "Your application" (`loadStatus`, drawn by `StatusPage`), and the list of applications
 *   POST  /api/admissions/forms/[roundId]/programmes/[programmeId]/registers/remind
 *   the `courses-register-reminders` job
 *   GET   /api/admissions/forms/[roundId]/programmes/[programmeId]/run   the Course run panel, and `RunHandOver`
 *
 * ## What this guards
 *
 *  1. A SEAT THE APPLICATION FORM PLACED GIVES ITS PLACE ON THE FORM BACK
 *     WHEN STAFF REMOVE IT, in the same act, exactly as leaving gives it: the
 *     application says "I can’t make it" with no reason, and the form's counts
 *     move. Nobody is emailed. A second press gives nothing back twice. As an
 *     admin and as the programme's lead.
 *  2. NOTHING ELSE GIVES ANYTHING BACK: a seat the form did not place
 *     (somebody who applied to the run itself), a seat whose person holds no
 *     place on the form, and any removal once the run's last session is over,
 *     when leaving gives nothing back either.
 *  3. THE PAGE AFTER A REMOVAL says they were taken off the programme, and
 *     when, and the list of their applications says the same: never that they
 *     told us they can't make it, never that they left, and no way to the
 *     programme's page, which closes to them. Somebody who gave the place back
 *     themselves before the removal still reads what they told us.
 *  4. PUTTING SOMEBODY BACK after a removal: their card stops saying "Gave
 *     their place back", Publish tells them, and their place on the form is
 *     theirs again (`tests/course-hub-put-back.test.mjs` holds every page
 *     that reads it).
 *  5. THE REGISTER REMINDER'S "Open the register" goes to the register's own
 *     page, whichever sends it: the lead's Remind (as an admin and as the
 *     programme's lead) or the job.
 *  6. THE HAND-OVER PANEL (an admin's alone) lists the people on the run's
 *     list who no longer hold a place in three ways: left by themselves, taken
 *     off by staff (each with nothing to do), and everybody else, whose seat
 *     is still on the run, with the runbook's steps as before.
 *
 *  7. THREE LINES OF COPY WITHOUT A DASH: Remove's refusal of a facilitator's
 *     seat, the register's caption, and the label of a joiner's empty cell.
 *
 * Built on `tests/lib/leavingWorld.mjs`: week 3 of AGI Strategy's run, the
 * clock at noon on Tue 17 Nov 2026 in London. Amara is in Group A, told, and
 * holds a place through the form; Chloe applied to the run itself; Una is
 * placed in Group C, not told, and holds no place on the form.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { switches } from "./lib/hubAttendanceWorld.mjs";
import {
  A,
  AGI,
  COURSE,
  D,
  NOW,
  ROUND,
  RUN,
  applicationPath,
  enrolmentPath,
  formPath,
  makeLeavingWorld,
  subscriptionPath,
  textOf,
} from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const w = await makeLeavingWorld("__publishFollowUps");
const { world, call, routes } = w;

const statusLoad = await w.loadTs(join("lib", "applications", "status", "load.ts"));
const { default: StatusPage } = await w.loadTs(join("features", "applications", "status", "StatusPage.tsx"));
const fit = await w.loadTs(join("features", "courses", "allocationFit.ts"));
const record = await w.loadTs(join("lib", "courses", "finishing", "record.ts"));
const remindRoute = await w.formRoute("programmes", "[programmeId]", "registers", "remind");
const { registerRemindersJob } = await w.loadTs(join("lib", "scheduler", "jobs", "registerReminders.ts"));
const { default: RunHandOver } = await w.loadTs(join("features", "applications", "editor", "RunHandOver.tsx"));
const panelWords = await w.loadTs(join("features", "applications", "editor", "runHandOverWords.ts"));

const CALLERS = [
  ["an admin", "zach"],
  ["the programme's lead", "claudia"],
];
const HOME = `/learn/${RUN.agi}`;
const TIMES = { kind: "times", other: "" };

const read = (path) => world.db.read(path);
const at = (value) => (value instanceof Date ? value.toISOString() : value);

function reset() {
  w.reset();
  // The Admin SDK's sweep of a document and what is under it, on the handle
  // the reply route is given too.
  world.db.recursiveDelete = async (ref) => ref.delete();
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every document, by path, with a log line's own id folded. */
function snapshot() {
  return new Map(world.db.paths().map((path) => [path.replace(/auto-\d+$/, "auto"), JSON.stringify(read(path))]));
}

/** The paths that changed, appeared or went since `before`. */
function changedSince(before) {
  const now = snapshot();
  return [...new Set([...before.keys(), ...now.keys()])].filter((path) => before.get(path) !== now.get(path)).sort();
}

const remove = (who, uid) => call(who, routes.remove.POST, { runId: RUN.agi, uid }, { course: true });

/** A person's own reply, as their page sends it, and what it sends after its answer. */
async function replies(who, body = { reply: "cant-make-it", reason: TIMES }) {
  const answer = await call(who, routes.reply.POST, { roundId: ROUND }, { body });
  await w.settle();
  return answer;
}

/** Somebody holding a place on AGI Strategy by their own ranking: a copy of Amara's application, theirs. */
function holdsAPlace(uid, name) {
  const application = structuredClone(read(applicationPath("amara")));
  Object.assign(application, { uid, email: `${uid}@example.com`, displayName: name });
  for (const content of [application.draft, application.sent]) content.aboutYou.preferredName = name.split(" ")[0];
  world.db.seed(applicationPath(uid), application);
}

/** The person's own application, as stored. */
function applicationOf(uid) {
  const stored = read(applicationPath(uid));
  return {
    status: stored.status,
    attendance: stored.attendance?.answer ?? null,
    releaseReason: stored.releaseReason ?? null,
    withdrawnAt: at(stored.withdrawnAt ?? null),
  };
}

/** Their seat on the run, as stored. */
function seatOf(uid) {
  const seat = read(enrolmentPath(uid));
  return {
    status: seat.status,
    groupId: seat.groupId,
    told: seat.allocatedEmailAt instanceof Date,
    droppedOutAt: at(seat.droppedOutAt ?? null),
  };
}

const formCounts = () => ({ ...read(formPath).applicationCounts });

/** What somebody's own application page says, as the page's read and the page draw it. */
async function ownPage(uid) {
  const loaded = await statusLoad.loadStatus(world.db, ROUND, uid, new Date());
  const html = renderToStaticMarkup(createElement(StatusPage, { roundId: ROUND, view: loaded.view, viewingAs: false }));
  return { view: loaded.view, html, text: textOf(html) };
}

/** The chip and sentence the list of their applications draws for this form. */
async function listLine(uid) {
  const said = (await statusLoad.loadListWords(world.db, uid, [ROUND], new Date())).get(ROUND);
  return said ? [said.chip, said.sentence] : null;
}

/** What one card on the board says, by the card's own rule, from the board route's answer. */
async function cardOf(who, uid) {
  const shown = (await w.join.board(who)).body;
  const groups = shown.groups.map((group) => ({ id: group.id, sessionLabel: group.sessionLabel }));
  const row = shown.people.find((each) => each.uid === uid);
  return { row, gaveBack: fit.cardFit(row, groups.find((group) => group.id === row.groupId) ?? null, groups).gaveBack };
}

/** When the run's last session ends. */
const endOf = async () => record.readRunEndById(world.courseDb, RUN.agi, new Date());

/** The page of somebody taken off the programme, word for word. `day` is null when none is on record. */
const REMOVED_CARD = (day) =>
  "Autumn 2026 · Fri 23 Oct Your application Taken off the programme You’re no longer on AGI Strategy. " +
  (day ? `That was on ${day}. ` : "") +
  "If you think that’s a mistake, email ai-safety@uonsu.com and we’ll see what we can do. " +
  "Our events are open to everyone, so come along to one. See what’s on";

// ---------------------------------------------------------------------------
// 1. Remove gives the place on the form back
// ---------------------------------------------------------------------------

describe("1. a seat the form placed gives its place on the form back when staff remove it", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: Amara's place goes back in the same act, as "I can’t make it" with no reason, and the form's counts move`, async () => {
      assert.deepEqual(applicationOf("amara"), { status: "accepted", attendance: null, releaseReason: null, withdrawnAt: null });
      const counts = formCounts();
      const before = snapshot();

      const answer = await remove(who, "amara");
      assert.deepEqual([answer.status, answer.body], [200, { ok: true }]);
      await w.settle();

      assert.deepEqual(seatOf("amara"), { status: "removed", groupId: null, told: false, droppedOutAt: NOW.toISOString() });
      assert.deepEqual(applicationOf("amara"), {
        status: "withdrawn",
        attendance: "cant-make-it",
        releaseReason: null,
        withdrawnAt: NOW.toISOString(),
      });
      assert.deepEqual(formCounts(), { ...counts, accepted: counts.accepted - 1, withdrawn: counts.withdrawn + 1 });
      // The seat, its group's count, the application and the form's counts,
      // and the cohort's list: nothing else, and nobody is emailed.
      assert.deepEqual(changedSince(before), [
        applicationPath("amara"),
        formPath,
        enrolmentPath("amara"),
        `courseGroups/${A}`,
        subscriptionPath("amara"),
        "subscriptionEvents/auto",
      ].sort());
      assert.equal(world.mail.length, 0);

      // Amara's card says Removed, and Gave their place back.
      const card = await cardOf(who, "amara");
      assert.deepEqual([card.row.enrolmentStatus, card.row.fromForm.holdsPlace, card.gaveBack], ["removed", false, true]);
    });

    test(`as ${label}: a second press of Remove gives nothing back twice and writes nothing`, async () => {
      assert.equal((await remove(who, "amara")).status, 200);
      await w.settle();
      const counts = formCounts();
      const before = snapshot();
      assert.deepEqual([(await remove(who, "amara")).status, formCounts()], [200, counts]);
      await w.settle();
      assert.deepEqual(changedSince(before), []);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Nothing else gives anything back
// ---------------------------------------------------------------------------

describe("2. nothing gives back a place the removal did not come from", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: Chloe, who applied to the run itself, and Una, who holds no place on the form, are removed with the form untouched`, async () => {
      const counts = formCounts();
      for (const uid of ["chloe", "una"]) {
        const before = snapshot();
        assert.equal((await remove(who, uid)).status, 200, uid);
        await w.settle();
        assert.equal(seatOf(uid).status, "removed", uid);
        const changed = changedSince(before);
        assert.ok(changed.includes(enrolmentPath(uid)), uid);
        assert.deepEqual(
          changed.filter((path) => path === formPath || path.startsWith("admissionApplications/")),
          [],
          `removing ${uid} wrote to the form`,
        );
      }
      assert.deepEqual(formCounts(), counts);
    });
  }

  test("only a seat still on the run gives its place back: a seat an older record marks completed is removed with the form untouched", async () => {
    world.db.poke(enrolmentPath("amara"), { status: "completed" });
    const counts = formCounts();
    assert.equal((await remove("zach", "amara")).status, 200);
    await w.settle();
    assert.equal(seatOf("amara").status, "removed");
    assert.deepEqual(applicationOf("amara"), { status: "accepted", attendance: null, releaseReason: null, withdrawnAt: null });
    assert.deepEqual(formCounts(), counts);
  });

  test("once the run's last session is over, a removal gives nothing back, and the page still says they were taken off", async () => {
    const ended = (await endOf()).endsAt;
    mock.timers.setTime(ended.getTime() + 60_000);
    const counts = formCounts();
    assert.equal((await remove("claudia", "amara")).status, 200);
    await w.settle();
    assert.equal(seatOf("amara").status, "removed");
    assert.deepEqual(applicationOf("amara"), { status: "accepted", attendance: null, releaseReason: null, withdrawnAt: null });
    assert.deepEqual(formCounts(), counts);
    const page = await ownPage("amara");
    assert.equal(page.view.kind, "removed");
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" })
      .format(new Date())
      .replace(",", "");
    assert.equal(page.text, REMOVED_CARD(day));
  });
});

// ---------------------------------------------------------------------------
// 3. The page after a removal
// ---------------------------------------------------------------------------

describe("3. the person's own page after a removal", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label} removes Amara: Amara's page and list say Amara was taken off, and when, and nothing else`, async () => {
      assert.equal((await remove(who, "amara")).status, 200);
      await w.settle();
      const page = await ownPage("amara");
      assert.equal(page.view.kind, "removed");
      assert.equal(page.text, REMOVED_CARD("Tue 17 Nov"));
      assert.match(page.html, /<a href="mailto:ai-safety@uonsu.com" class="link">ai-safety@uonsu.com<\/a> and we’ll see what we can do\./);
      assert.match(page.html, /<a href="\/events" class="outlineSmall"><span>See what’s on<\/span>/);
      assert.ok(!page.html.includes(HOME), "the run closes to somebody taken off it");
      assert.ok(!page.html.includes("<button"), "a reply button is drawn");
      assert.doesNotMatch(page.text, /can’t make it|I’m coming|Left the programme|You left|we’ll email you/);
      assert.deepEqual(await listLine("amara"), ["Taken off the programme", "You’re no longer on AGI Strategy."]);
    });
  }

  test("with no day on record, the page leaves the day out", async () => {
    assert.equal((await remove("zach", "amara")).status, 200);
    await w.settle();
    world.db.poke(enrolmentPath("amara"), { droppedOutAt: null });
    assert.equal((await ownPage("amara")).text, REMOVED_CARD(null));
  });

  test("somebody who gave the place back themselves before the removal still reads what they told us", async () => {
    // Una holds a place now, is placed in Group C and not told, and says
    // "I can’t make it" with a reason; then the lead removes Una, as the
    // runbook's first step says.
    holdsAPlace("una", "Una Byrne");
    assert.equal((await replies("una")).status, 200);
    assert.deepEqual(applicationOf("una").releaseReason, TIMES);
    const counts = formCounts();
    assert.equal((await remove("claudia", "una")).status, 200);
    await w.settle();
    assert.deepEqual([seatOf("una").status, applicationOf("una").releaseReason, formCounts()], ["removed", TIMES, counts]);
    const page = await ownPage("una");
    assert.equal(page.view.kind, "released");
    assert.match(page.text, /Place given back You’ve told us you can’t make it\. Your place in AGI Strategy has gone back so someone else can take it\./);
    assert.deepEqual(await listLine("una"), ["Place given back", "You’ve told us you can’t make it."]);
  });
});

// ---------------------------------------------------------------------------
// 4. Putting somebody back after a removal
// ---------------------------------------------------------------------------

describe("4. putting somebody back after a removal: the card, Publish, and the place on the form", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: Amara's card stops saying Gave their place back, Publish tells Amara, and the place on the form is hers again`, async () => {
      assert.equal((await remove(who, "amara")).status, 200);
      await w.settle();
      const placed = await w.join.place(who, [{ uid: "amara", groupId: A }]);
      assert.equal(placed.body.placed, 1, JSON.stringify(placed.body));
      // Putting her back gives her the place on the form again (the allocate
      // route, since the small follow-ups), so the seat keeps no put-back
      // record: until then it recorded one and the place stayed given back.
      const seat = read(enrolmentPath("amara"));
      assert.deepEqual([seat.status, seat.groupId, "putBackAt" in seat, seat.allocatedEmailAt], ["active", A, false, undefined]);

      // The card reads the form, which says she holds the place again.
      const card = await cardOf(who, "amara");
      assert.deepEqual([card.row.fromForm.holdsPlace, "putBack" in card.row, card.gaveBack], [true, false, false]);

      const before = world.mail.length;
      const pressed = await w.join.publish(who);
      assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
      const sent = world.mail.slice(before).filter((mail) => !mail.subject.startsWith("[TEST]"));
      assert.ok(sent.some((mail) => mail.to === "amara@example.com"), JSON.stringify(sent.map((mail) => mail.to)));
      assert.ok(read(enrolmentPath("amara")).allocatedEmailAt instanceof Date);
      // Her application holds the place, with no reply, reason or day it went
      // (it was withdrawn, given back by the removal, before the follow-ups).
      assert.deepEqual(applicationOf("amara"), { status: "accepted", attendance: null, releaseReason: null, withdrawnAt: null });
    });
  }
});

// ---------------------------------------------------------------------------
// 5. The register reminder opens the register
// ---------------------------------------------------------------------------

/** Every address an email's links lead to, and its words, as its reader gets it. */
async function opened(mail) {
  const html = await render(mail.react);
  return {
    links: [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replace(/&amp;/g, "&")),
    // The button sits between hair spaces, written as numeric entities.
    text: textOf(html.replace(/<head[\s\S]*?<\/head>/i, "").replace(/&#\d+;/g, " ")),
  };
}

/** The register's own page for a group, as a whole address on the world's own site. */
const registerPage = (groupId) =>
  `${process.env.NEXT_PUBLIC_APP_URL}/learn/${encodeURIComponent(RUN.agi)}/group/${encodeURIComponent(groupId)}/register`;

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
  }
}

describe("5. the register reminder's \"Open the register\" goes to the register's own page", () => {
  test("the address it names is a page of the site", () => {
    assert.ok(existsSync(join(SRC, "app", "(app)", "learn", "[runId]", "group", "[groupId]", "register", "page.tsx")));
  });

  for (const [label, who] of CALLERS) {
    test(`as ${label}: Remind emails Grace a link to Group D's register, and to nothing else`, async () => {
      const pressed = await call(who, remindRoute.POST, { roundId: ROUND, programmeId: AGI }, { body: { groupId: D, sessionKey: "w03", emails: 1 } });
      assert.deepEqual([pressed.status, pressed.body.emailed], [200, 1], JSON.stringify(pressed.body));
      assert.deepEqual(world.mail.map((mail) => [mail.to, mail.subject]), [["grace@example.com", "Group D’s register isn’t pushed"]]);
      const mail = await opened(world.mail[0]);
      assert.deepEqual(mail.links, [registerPage(D), registerPage(D)]);
      assert.ok(mail.text.includes(`Open the register Or paste this into your browser: ${registerPage(D)} `), mail.text);
    });
  }

  test("the job's reminder links to the same page", async () => {
    world.db.seed("config/scheduler", switches({ reminders: true }));
    await runReminderJob(new Date("2026-11-18T09:00:00Z"));
    const reminders = world.mail.filter((mail) => mail.subject.endsWith("register isn’t pushed"));
    assert.ok(reminders.some((mail) => mail.to === "grace@example.com"), JSON.stringify(world.mail.map((mail) => mail.to)));
    const grace = await opened(reminders.find((mail) => mail.to === "grace@example.com"));
    assert.deepEqual(grace.links, [registerPage(D), registerPage(D)]);
    for (const mail of reminders) {
      for (const link of (await opened(mail)).links) assert.match(link, /\/group\/[^/]+\/register$/, `${mail.to}: ${link}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The hand-over panel lists who left and who was taken off apart
// ---------------------------------------------------------------------------

/** The Course run panel as the route answers `who`, and as the panel draws that answer. */
async function panelOf(who = "zach") {
  const answer = await call(who, routes.run.GET, { roundId: ROUND, programmeId: AGI });
  if (answer.status !== 200) return { status: answer.status, panel: null, text: "" };
  const html = renderToStaticMarkup(createElement(RunHandOver, { roundId: ROUND, programmeId: AGI, initial: answer.body.panel }));
  return { status: answer.status, panel: answer.body.panel, text: textOf(html) };
}

const names = (people) => people.map((person) => person.name);

describe("6. the hand-over panel lists who left and who was taken off apart from who still holds a seat", () => {
  test("the words, as the boards' voice was asked for them", () => {
    assert.deepEqual(
      [panelWords.LEFT_TITLE, panelWords.LEFT_NOTE, panelWords.TAKEN_OFF_TITLE, panelWords.TAKEN_OFF_NOTE],
      [
        "Left the programme",
        "They left by themselves, so their seat is free and their place is given back. There’s nothing to do.",
        "Taken off the programme",
        "They were taken off the programme on the board, so their seat is free and their place is given back. There’s nothing to do.",
      ],
    );
  });

  test("as an admin: Sam, who left, and Omar, whom staff took off, each have a list of their own and nothing to do", async () => {
    const { status, panel, text } = await panelOf("zach");
    assert.equal(status, 200);
    assert.deepEqual([names(panel.left), names(panel.takenOff)], [["Sam Whitfield"], ["Omar Haddad"]]);
    for (const name of ["Sam Whitfield", "Omar Haddad"]) assert.ok(!names(panel.gaveBack).includes(name), name);
    assert.ok(text.includes(`Left the programme (1) Sam Whitfield ${panelWords.LEFT_NOTE}`), text);
    assert.ok(text.includes(`Taken off the programme (1) Omar Haddad ${panelWords.TAKEN_OFF_NOTE}`), text);
    // Everybody else who no longer holds a place keeps the runbook's steps.
    assert.equal(text.split("Remove them from their group on the board").length - 1, panel.gaveBack.length > 0 ? 1 : 0);
  });

  test("once the programme's lead removes Amara and Dev leaves, the admin's panel lists each of them where they belong", async () => {
    assert.equal((await remove("claudia", "amara")).status, 200);
    await w.settle();
    assert.equal((await w.leave("dev")).status, 200);
    const { panel, text } = await panelOf("zach");
    assert.deepEqual([names(panel.left), names(panel.takenOff)], [["Dev Patel", "Sam Whitfield"], ["Amara Okafor", "Omar Haddad"]]);
    assert.ok(text.includes(`Left the programme (2) Dev Patel Sam Whitfield ${panelWords.LEFT_NOTE}`), text);
    assert.ok(text.includes(`Taken off the programme (2) Amara Okafor Omar Haddad ${panelWords.TAKEN_OFF_NOTE}`), text);
    for (const person of [...panel.left, ...panel.takenOff]) {
      assert.equal(person.applicationPath, `/admin/admissions/forms/${ROUND}/programmes/${AGI}/applications/${person.uid}`);
    }
  });

  test("somebody put back on the run after leaving holds their place again, and is in none of the lists of people who no longer hold one", async () => {
    const start = (await panelOf("zach")).panel;
    assert.equal((await w.leave("dev")).status, 200);
    assert.equal((await w.join.place("zach", [{ uid: "dev", groupId: A }])).body.placed, 1);
    const { panel } = await panelOf("zach");
    // Putting Dev back gives him his place on the form again (since the small
    // follow-ups), so he is counted on the run's list as before he left, and
    // not under "No longer hold a place", where the runbook's steps would have
    // told an admin to remove somebody they had just put back.
    for (const list of [panel.gaveBack, panel.left, panel.takenOff]) {
      assert.ok(!names(list).includes("Dev Patel"), JSON.stringify(names(list)));
    }
    assert.deepEqual([panel.holders, panel.onTheList], [start.holders, start.onTheList]);
  });

  test("the programme's lead and a member are refused the panel, as before", async () => {
    assert.equal((await panelOf("claudia")).status, 403);
    assert.equal((await panelOf("amara")).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 7. Three lines of copy without a dash
// ---------------------------------------------------------------------------

/** The register as its grid draws it, from the register route's own answer. */
function drawGrid(payload, groupId) {
  w.ui.attendance = {
    group: payload.group,
    sessions: payload.sessions,
    members: payload.members,
    notYetTold: payload.notYetTold,
    leavers: payload.leavers,
    records: payload.records,
    participantNotes: payload.participantNotes,
    canEditPushed: payload.canEditPushed,
    ending: payload.ending,
    loading: false,
    loaded: true,
    error: null,
    reload: () => {},
    mark: async () => {},
    edit: async () => ({}),
    push: async () => ({}),
    saveNote: async () => ({}),
  };
  return renderToStaticMarkup(createElement(w.components.AttendanceGrid, { groupId }));
}

describe("7. three lines of copy say what they say without a dash", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: Remove refuses a facilitator's seat in two plain sentences, and writes nothing`, async () => {
      world.db.seed(enrolmentPath("grace"), {
        runId: RUN.agi,
        courseId: COURSE.agi,
        uid: "grace",
        role: "facilitator",
        status: "active",
        groupId: D,
      });
      const before = snapshot();
      const refused = await remove(who, "grace");
      assert.deepEqual(
        [refused.status, refused.body.error],
        [409, "That's a facilitator enrolment. Unassign them in the group editor instead."],
      );
      assert.deepEqual(changedSince(before), []);
    });
  }

  test("the register's caption, and the label of a joiner's empty cells, as the grid draws them for the lead", async () => {
    world.db.poke(enrolmentPath("bea"), { joinedWeekNumber: 3 });
    const answer = await call("claudia", routes.register.GET, { groupId: A }, { course: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const html = drawGrid(answer.body, A);
    const caption = textOf((/<caption[^>]*>([\s\S]*?)<\/caption>/.exec(html) ?? [])[1] ?? "");
    assert.match(caption, /^Attendance for Group A: 4 members, 3 sessions so far\. Each cell cycles through present/, caption);
    assert.doesNotMatch(caption, /[\u2013\u2014]/);
    const labels = [...html.matchAll(/aria-label="(Not in the group yet[^"]*)"/g)].map((match) => match[1]);
    assert.ok(labels.length >= 1, "no cell of a week before Bea joined was drawn");
    // Bea's marks from before the week Bea joined stay on record, and the label says so.
    for (const said of labels) assert.match(said, /^Not in the group yet: joined in week 3(?:, recorded [A-Z][a-z ]+)?$/);
    assert.ok(labels.includes("Not in the group yet: joined in week 3, recorded Present"), JSON.stringify(labels));
  });
});
