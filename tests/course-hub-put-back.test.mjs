/**
 * Putting somebody back on a run gives them their place on the form again.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST    /api/courses/runs/[runId]/allocate                   putting somebody back (a placement on the board)
 *   POST    /api/courses/runs/[runId]/enrolments/[uid]/remove    taking them off first
 *   DELETE  /api/courses/runs/[runId]/enrol                      leaving first, "Leave the programme"
 *   POST    /api/admissions/forms/[roundId]/application/reply    "I can’t make it", before and after
 *   GET     /api/courses/runs/[runId]/allocation                 the board's card
 *   POST    /api/courses/runs/[runId]/allocation/publish(/test)
 *   GET     /api/admissions/forms/[roundId]/programmes/[programmeId]/run   the Course run panel
 *   "Your application" (`loadStatus`, drawn by `StatusPage`), the list of
 *   applications, whether somebody holds a place (`loadHoldsPlace`, which My
 *   programmes and Home ask), and the term's tally with its free places
 *
 * ## What this guards
 *
 *  1. PUTTING SOMEBODY BACK GIVES THEM THEIR PLACE ON THE FORM AGAIN, in the
 *     transaction that brings their seat back, when the place went back by
 *     Remove, by leaving, or by their own "I can’t make it" before a removal:
 *     the application holds the place with no reply, no reason and no day it
 *     went, and the form's counts move back. The seat keeps no record that it
 *     was put back, because the form says they hold the place. Nobody is
 *     emailed by it. As an admin and as the programme's lead.
 *  2. EVERY PAGE SAYS THEY HOLD A PLACE AGAIN, each through the reading it
 *     already makes, never a second rule: their own page and the list of their
 *     applications (a place, then their group once Publish tells them, word for
 *     word the page they had before), whether they hold a place, the board's
 *     card, the hand-over panel, and the term's tally and its free places.
 *     Before this, each said they had given the place back, and their page
 *     said "You’ve told us you can’t make it." to somebody who never said it.
 *  3. NOTHING ELSE IS GIVEN: an application withdrawn some other way keeps its
 *     standing and the seat records the put back as before (the card and
 *     Publish still follow it); a run's track lead, whom a row from the form is
 *     not served, is answered as before and changes nothing; moving somebody
 *     who never left writes nothing on the form.
 *  4. AFTERWARDS IT IS A PLACE LIKE ANY OTHER: "I can’t make it" before the
 *     next Publish gives it back with the reason, the card says "Gave their
 *     place back" and Publish leaves them out; after Publish it is the one
 *     leave.
 *
 * The People tab's side is in `tests/course-hub-people-tab.test.mjs`.
 *
 * Built on `tests/lib/leavingWorld.mjs`: week 3 of AGI Strategy's run, the
 * clock at noon on Tue 17 Nov 2026 in London. Amara, Dev and Bea are in
 * Group A, told, and hold their places through the form; Una is placed in
 * Group C and not told; Yusuf is the run's track lead.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, B, C, NOW, ROUND, RUN, applicationPath, enrolmentPath, formPath, makeLeavingWorld, textOf } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__putBack");
const { world, call, routes } = w;

const statusLoad = await w.loadTs(join("lib", "applications", "status", "load.ts"));
const { default: StatusPage } = await w.loadTs(join("features", "applications", "status", "StatusPage.tsx"));
const fit = await w.loadTs(join("features", "courses", "allocationFit.ts"));
const { loadTermTally } = await w.loadTs(join("lib", "applications", "editor", "load.ts"));
const { freePlaces } = await w.loadTs(join("lib", "applications", "decisions.ts"));
const { loadForm } = await w.loadTs(join("lib", "applications", "repo.ts"));

const CALLERS = [
  ["an admin", "zach"],
  ["the programme's lead", "claudia"],
];
const TIMES = { kind: "times", other: "" };

const read = (path) => world.db.read(path);
const at = (value) => (value instanceof Date ? value.toISOString() : value);

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  // The Admin SDK's sweep of a document and what is under it, on the handle
  // the reply route is given too.
  world.db.recursiveDelete = async (ref) => ref.delete();
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

const remove = async (who, uid) => {
  const answer = await call(who, routes.remove.POST, { runId: RUN.agi, uid }, { course: true });
  await w.settle();
  return answer;
};

/** A placement on the board, as the board sends one: putting somebody back is one of these. */
const putBack = (who, uid, groupId) => w.join.place(who, [{ uid, groupId }]);

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

/** The person's own application, as stored: what says where their place stands. */
function applicationOf(uid) {
  const stored = read(applicationPath(uid));
  return {
    status: stored.status,
    attendance: stored.attendance?.answer ?? null,
    releaseReason: stored.releaseReason ?? null,
    withdrawnAt: at(stored.withdrawnAt ?? null),
  };
}

const HOLDING = { status: "accepted", attendance: null, releaseReason: null, withdrawnAt: null };

/** Their seat on the run, as stored. */
function seatOf(uid) {
  const seat = read(enrolmentPath(uid));
  return {
    status: seat.status,
    groupId: seat.groupId,
    told: seat.allocatedEmailAt instanceof Date,
    putBack: "putBackAt" in seat ? at(seat.putBackAt) : "absent",
  };
}

const formCounts = () => ({ ...read(formPath).applicationCounts });

/** What somebody's own application page says, as the page's read and the page draw it. */
async function ownPage(uid) {
  const loaded = await statusLoad.loadStatus(world.db, ROUND, uid, new Date());
  const html = renderToStaticMarkup(createElement(StatusPage, { roundId: ROUND, view: loaded.view, viewingAs: false }));
  return { view: loaded.view, text: textOf(html) };
}

/** The chip and sentence the list of their applications draws for this form. */
async function listLine(uid) {
  const said = (await statusLoad.loadListWords(world.db, uid, [ROUND], new Date())).get(ROUND);
  return said ? [said.chip, said.sentence] : null;
}

/** Whether they hold a place: the one bit My programmes and Home ask before saying anybody is on nothing. */
const holdsAPlaceNow = (uid) => statusLoad.loadHoldsPlace(world.db, uid, [ROUND], new Date());

/** What one card on the board says, by the card's own rule, from the board route's answer. */
async function cardOf(who, uid) {
  const shown = (await w.join.board(who)).body;
  const groups = shown.groups.map((group) => ({ id: group.id, sessionLabel: group.sessionLabel }));
  const row = shown.people.find((each) => each.uid === uid);
  const gaveBack = fit.cardFit(row, groups.find((group) => group.id === row.groupId) ?? null, groups).gaveBack;
  return [row.fromForm.holdsPlace, "putBack" in row, gaveBack];
}

/** The Course run panel as the route answers an admin: its counts, and every list that names somebody. */
async function panelLists() {
  const answer = await call("zach", routes.run.GET, { roundId: ROUND, programmeId: AGI });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  const names = (people) => people.map((person) => person.name);
  const { panel } = answer.body;
  return {
    holders: panel.holders,
    onTheList: panel.onTheList,
    named: [...names(panel.toHandOver), ...names(panel.notAccepted)],
    noLongerHold: [...names(panel.gaveBack), ...names(panel.left), ...names(panel.takenOff)],
  };
}

/** AGI Strategy's places held and free, by the term's own tally. */
async function places() {
  const form = await loadForm(world.db, ROUND);
  const tally = await loadTermTally(world.db, form);
  return { held: tally.programmes[AGI].placed, free: freePlaces(form, tally, AGI) };
}

/** The group facilitators Publish writes to beside the people it places, in this world. */
const FACILITATORS = ["grace@example.com", "rahul@example.com", "sofia@example.com", "tom@example.com"];

/** A press of Publish, and the people placed it emailed their group, besides the test and the facilitators. */
async function publishes(who) {
  const before = world.mail.length;
  const pressed = await w.join.publish(who);
  assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
  const sent = world.mail.slice(before).filter((mail) => !mail.subject.startsWith("[TEST]")).map((mail) => mail.to);
  return sent.filter((to) => !FACILITATORS.includes(to)).sort();
}

/** Amara's page while she holds a place and before Publish tells her a group, word for word. */
const PLACE_BEFORE_GROUPS =
  "Your application AGI Strategy Fellowship Accepted Autumn 2026 · Fri 23 Oct You’re in AGI Strategy. " +
  "6 WEEKS · starts w/c 26 Oct You’ll be in a small group with a facilitator, on campus. Before you start, we’ll " +
  "email you your group and when it meets. I’m coming Optional. It helps us plan groups. I can’t make it This " +
  "frees your place for someone else. Questions? ai-safety@uonsu.com";

// ---------------------------------------------------------------------------
// 1. The place on the form is theirs again
// ---------------------------------------------------------------------------

describe("1. putting somebody back gives them their place on the form again", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: Amara, taken off and put back, holds her place again, and the form's counts with it`, async () => {
      const counts = formCounts();
      assert.equal((await remove(who, "amara")).status, 200);
      assert.deepEqual(applicationOf("amara").status, "withdrawn", "Remove gave her place back");
      const mailBefore = world.mail.length;

      const placed = await putBack(who, "amara", A);
      assert.deepEqual([placed.status, placed.body.placed, placed.body.rejected], [200, 1, []], JSON.stringify(placed.body));
      assert.deepEqual(applicationOf("amara"), HOLDING);
      assert.deepEqual(formCounts(), counts, "the form's counts are as they were before she was taken off");
      assert.deepEqual(seatOf("amara"), { status: "active", groupId: A, told: false, putBack: "absent" });
      assert.equal(world.mail.length, mailBefore, "putting somebody back emails nobody");
    });

    test(`as ${label}: Dev, who left by Leave the programme, put back, holds his place again`, async () => {
      const counts = formCounts();
      assert.equal((await w.leave("dev")).status, 200);
      assert.deepEqual([applicationOf("dev").status, applicationOf("dev").attendance], ["withdrawn", "cant-make-it"]);

      assert.equal((await putBack(who, "dev", A)).body.placed, 1);
      assert.deepEqual(applicationOf("dev"), HOLDING);
      assert.deepEqual(formCounts(), counts);
      assert.deepEqual(seatOf("dev"), { status: "active", groupId: A, told: false, putBack: "absent" });
    });
  }

  test("Una, who said she can’t make it before she was taken off, holds the place again, and her reason goes with the reply", async () => {
    // Una holds a place now, is placed in Group C and not told, and says "I
    // can’t make it" with a reason; then the lead removes her, as the
    // runbook's first step says, which gives nothing back a second time.
    holdsAPlace("una", "Una Byrne");
    assert.equal((await replies("una")).status, 200);
    assert.deepEqual(applicationOf("una").releaseReason, TIMES);
    assert.equal((await remove("claudia", "una")).status, 200);
    const counts = formCounts();

    assert.equal((await putBack("claudia", "una", C)).body.placed, 1);
    assert.deepEqual(applicationOf("una"), HOLDING);
    assert.deepEqual(formCounts(), { ...counts, accepted: counts.accepted + 1, withdrawn: counts.withdrawn - 1 });
    assert.equal(seatOf("una").putBack, "absent");
  });

  test("a second placement in the same group writes nothing more", async () => {
    await remove("zach", "amara");
    await putBack("zach", "amara", A);
    const before = snapshot();
    const again = await putBack("zach", "amara", A);
    assert.deepEqual([again.status, again.body.placed], [200, 0]);
    assert.deepEqual(changedSince(before), []);
  });
});

// ---------------------------------------------------------------------------
// 2. Every page says so, through the reading it already makes
// ---------------------------------------------------------------------------

describe("2. every page says they hold a place again", () => {
  test("before the next Publish: her page, the list of her applications, whether she holds a place, the board, the panel and the term's tally", async () => {
    const start = await places();
    const startPanel = await panelLists();
    await remove("zach", "amara");
    assert.deepEqual(await places(), { held: start.held - 1, free: start.free + 1 }, "Remove freed her place");
    await putBack("zach", "amara", A);

    const page = await ownPage("amara");
    assert.deepEqual([page.view.kind, page.view.inGroup ?? null], ["place", null]);
    assert.equal(page.text, PLACE_BEFORE_GROUPS);
    assert.doesNotMatch(page.text, /told us you can’t make it|Place given back|no longer on|Taken off/);
    assert.deepEqual(await listLine("amara"), ["Accepted", "You’re in AGI Strategy."]);
    // My programmes and Home say a member is on nothing only when this is no.
    assert.equal(await holdsAPlaceNow("amara"), true);
    for (const who of ["zach", "claudia"]) {
      assert.deepEqual(await cardOf(who, "amara"), [true, false, false], `${who}'s board`);
    }
    // The panel counts her among the people holding a place who are on the
    // run's list, as before she was taken off, and names her nowhere.
    const panel = await panelLists();
    assert.deepEqual(panel, startPanel);
    assert.ok(!JSON.stringify(panel).includes("Amara"), JSON.stringify(panel));
    // Her place is held again, so it is not free for somebody else.
    assert.deepEqual(await places(), start);
  });

  test("after the next Publish: she is emailed her group, and her page is word for word the page she had before she was taken off", async () => {
    const before = await ownPage("amara");
    assert.equal(before.view.inGroup.groupName, "Group A");
    await remove("claudia", "amara");
    await putBack("claudia", "amara", A);
    // Una is placed and not told in this world, so Publish tells her too.
    assert.deepEqual(await publishes("claudia"), ["amara@example.com", "una@example.com"]);
    const after = await ownPage("amara");
    assert.equal(after.text, before.text);
    assert.deepEqual(after.view.inGroup, before.view.inGroup);
    assert.deepEqual(await listLine("amara"), ["Accepted", "You’re in AGI Strategy."]);
  });

  test("Dev, put back after leaving, is counted on the run's list in the panel and in none of its lists of people who no longer hold a place", async () => {
    const start = await panelLists();
    assert.equal((await w.leave("dev")).status, 200);
    assert.ok((await panelLists()).noLongerHold.includes("Dev Patel"), "leaving put Dev under Left the programme");
    await putBack("zach", "dev", A);
    assert.deepEqual(await panelLists(), start);
    assert.equal(await holdsAPlaceNow("dev"), true);
  });
});

// ---------------------------------------------------------------------------
// 3. Nothing else is given
// ---------------------------------------------------------------------------

describe("3. nothing else is given", () => {
  test("an application withdrawn some other way is left as it is, and the seat records the put back as before", async () => {
    assert.equal((await w.leave("bea")).status, 200);
    // Taken out of the term by something other than a reply: withdrawn, and
    // no "I can’t make it" on record, so the form holds no place given back.
    world.db.poke(applicationPath("bea"), { attendance: null });
    const application = applicationOf("bea");
    const counts = formCounts();

    assert.equal((await putBack("zach", "bea", A)).body.placed, 1);
    assert.deepEqual(applicationOf("bea"), application);
    assert.deepEqual(formCounts(), counts);
    assert.equal(seatOf("bea").putBack, NOW.toISOString());
    // The card and Publish follow the seat, as they did before the form could give a place again.
    assert.deepEqual(await cardOf("zach", "bea"), [false, true, false]);
    assert.deepEqual(await publishes("zach"), ["bea@example.com", "una@example.com"]);
  });

  test("a place given back on another programme is not this run's to give", async () => {
    // Wen holds a place on Technical AI Safety and gives it back. A seat on
    // AGI Strategy's run whose row says it came from AGI Strategy, taken off,
    // is then put back: the place Wen gave back is not that seat's.
    world.db.seed(`courseApplications/${RUN.agi}__wen`, {
      runId: RUN.agi,
      courseId: read(`courseRuns/${RUN.agi}`).courseId,
      uid: "wen",
      displayName: "Wen Li",
      status: "accepted",
      fromForm: { roundId: ROUND, programmeId: AGI },
    });
    world.db.seed(enrolmentPath("wen"), {
      runId: RUN.agi,
      courseId: read(`courseRuns/${RUN.agi}`).courseId,
      uid: "wen",
      role: "learner",
      status: "removed",
      groupId: null,
      selfEnrolled: false,
      joinedWeekNumber: 1,
    });
    assert.equal((await replies("wen")).status, 200);
    const application = applicationOf("wen");
    assert.deepEqual([application.status, application.attendance], ["withdrawn", "cant-make-it"]);
    const counts = formCounts();

    assert.equal((await putBack("zach", "wen", A)).body.placed, 1);
    assert.deepEqual([applicationOf("wen"), formCounts()], [application, counts]);
    assert.equal(seatOf("wen").putBack, NOW.toISOString());
  });

  test("a run's track lead, whom a row from the form is not served, is answered as before and changes nothing", async () => {
    await remove("zach", "amara");
    const before = snapshot();
    const refused = await putBack("yusuf", "amara", A);
    assert.deepEqual([refused.status, refused.body.placed, refused.body.rejected], [200, 0, [{ uid: "amara", reason: "not-accepted" }]]);
    assert.deepEqual(changedSince(before), []);
    assert.equal(applicationOf("amara").status, "withdrawn");
  });

  test("moving somebody who never left writes nothing on the form", async () => {
    const application = applicationOf("dev");
    const counts = formCounts();
    assert.equal((await putBack("claudia", "dev", B)).body.placed, 1);
    assert.deepEqual([applicationOf("dev"), formCounts()], [application, counts]);
    assert.deepEqual(seatOf("dev"), { status: "active", groupId: B, told: false, putBack: "absent" });
  });
});

// ---------------------------------------------------------------------------
// 4. Afterwards it is a place like any other
// ---------------------------------------------------------------------------

describe("4. afterwards it is a place like any other", () => {
  test("“I can’t make it” before the next Publish gives it back with the reason, the card says so, and Publish leaves her out", async () => {
    await remove("zach", "amara");
    await putBack("zach", "amara", A);
    assert.equal((await replies("amara")).status, 200);
    assert.deepEqual(applicationOf("amara"), { status: "withdrawn", attendance: "cant-make-it", releaseReason: TIMES, withdrawnAt: NOW.toISOString() });
    assert.deepEqual(await cardOf("zach", "amara"), [false, false, true]);
    // Publish tells Una, who is still to be told, and leaves Amara out.
    assert.deepEqual(await publishes("zach"), ["una@example.com"]);
    assert.equal(seatOf("amara").told, false);
  });

  test("after Publish, “I can’t make it” is the one leave again", async () => {
    await remove("zach", "amara");
    await putBack("zach", "amara", A);
    await publishes("zach");
    assert.equal((await replies("amara")).status, 200);
    assert.equal(seatOf("amara").status, "withdrawn");
    assert.deepEqual(
      [applicationOf("amara").status, applicationOf("amara").attendance, applicationOf("amara").releaseReason],
      ["withdrawn", "cant-make-it", null],
    );
    assert.deepEqual(await listLine("amara"), ["Left the programme", "You left AGI Strategy."]);
  });
});
