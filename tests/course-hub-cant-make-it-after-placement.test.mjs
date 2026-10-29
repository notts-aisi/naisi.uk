/**
 * "I can’t make it" once somebody is in a group (Q12's other half), and what
 * their application page says then, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/admissions/forms/[roundId]/application/reply   the reply: the second door to the one leave
 *   DELETE /api/courses/runs/[runId]/enrol                    "Leave the programme": the first
 *   /applications/[roundId], and the list of applications     what the person reads
 *
 * ## What this guards
 *
 *  1. ONE ACT, TWO DOORS. Somebody whose place on the form is held and who is
 *     in a group Publish has told them about, replying "I can’t make it",
 *     leaves exactly as "Leave the programme" leaves: the same documents, in
 *     the same shape, with the same email, and their reason kept with their
 *     seat and never on the application. A second press, by either door after
 *     either, writes and sends nothing.
 *  2. WHAT LEAVING REFUSES, THE REPLY REFUSES IN ITS WORDS: after the run's
 *     last session, and a seat that is not theirs to leave (the run's own
 *     older form gave it, or its row names another programme). Nobody can
 *     make anybody else leave, and a view-as session and somebody signed out
 *     are refused.
 *  3. EVERYBODY ELSE KEEPS TODAY'S REPLY: somebody accepted and not placed,
 *     and somebody placed whom Publish has not told, give their place back on
 *     the form and touch nothing of the run. A seat that changes between the
 *     reply's read and the leave's falls back to that reply.
 *  4. THE APPLICATION PAGE in every state: before groups go out as it always
 *     was; in a group, no reply buttons, the way to the programme's page and
 *     what giving the place back now means (or whom to write to, or nothing
 *     once the run has ended); once left by either door, "Left the
 *     programme" and the day, and never that they told us they can't make
 *     it. The list of their applications says the same. An incubator's page
 *     never says group.
 *  5. WHAT EVERYBODY ELSE THEN SEES follows from leaving's records: another
 *     member of the group, the facilitators' register, the lead's grid,
 *     Overview and CSV, the lead's Applications list, who finished, the freed
 *     places page after week 1 and before it, as the lead and as an admin.
 *  6. THE LOG LINE carries no reason, by either door.
 *  7. THE TREE: one writer of a seat that has left, called by the two doors
 *     and nothing else, and one answer to "in a group", asked by the reply and
 *     the page and nothing else.
 *
 * Real: the routes, the application page and its read, the leave, the
 * lead's grid, Overview, CSV and who finished, the freed places page, the
 * email template. Faked: see `tests/lib/leavingWorld.mjs`. The application
 * system's handle is given the Admin SDK's `recursiveDelete`, which the
 * leave's sweep of the week's card calls: in production both halves are
 * handed the same Admin SDK, and the course routes' view of the store already
 * has it.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { walkSource } from "./lib/functionScan.mjs";
import {
  A,
  AGI,
  B,
  NOW,
  ROUND,
  RUN,
  TOLD_ON,
  applicationPath,
  enrolmentPath,
  formPath,
  makeLeavingWorld,
  rowPath,
  subscriptionPath,
  taskPath,
  textOf,
} from "./lib/leavingWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__cantMakeItAfterPlacement");
const { world, call, routes, lib, leave } = w;

const statusLoad = await w.loadTs(join("lib", "applications", "status", "load.ts"));
const { default: StatusPage } = await w.loadTs(join("features", "applications", "status", "StatusPage.tsx"));
const { renderApplicationStatus } = await w.loadTs(join("features", "applications", "status", "renderApplicationStatus.tsx"));
const routesOfTheForm = {
  list: await w.formRoute("programmes", "[programmeId]", "applications"),
  csv: await w.formRoute("programmes", "[programmeId]", "attendance", "export"),
  freed: await w.formRoute("programmes", "[programmeId]", "freed-places"),
};
const whoFinished = await w.loadTs(join("lib", "courses", "finishing", "whoFinished.ts"));
const record = await w.loadTs(join("lib", "courses", "finishing", "record.ts"));

const TITLE = "AGI Strategy Fellowship";
const HOME = `/learn/${RUN.agi}`;
/** The reason a reply carries, and the words it is kept in. */
const TIMES = { kind: "times", other: "" };
const TIMES_SAID = "The times don’t work for me";
const NOT_YOURS = "Leaving this course isn't something you can do yourself. Email the team and we'll sort it out with you.";
const ENDED = `${TITLE} has ended, so there’s nothing to leave. If you need something changed, email ai-safety@uonsu.com.`;

const read = (path) => world.db.read(path);
const at = (value) => (value instanceof Date ? value.toISOString() : value);
const programme = { roundId: ROUND, programmeId: AGI };

function reset() {
  w.reset();
  // The Admin SDK's sweep of a document and what is under it, on the handle
  // the reply route is given too (see the note at the top).
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

/** What every path that changed since `before` now holds. */
function writtenSince(before) {
  const now = snapshot();
  return Object.fromEntries(changedSince(before).map((path) => [path, now.get(path) ?? null]));
}

/** A person's own reply, as their page sends it. */
const reply = (who, body = { reply: "cant-make-it", reason: TIMES }, options = {}) =>
  call(who, routes.reply.POST, { roundId: ROUND }, { body, ...options });

/** A reply, and the email the leave sends after its answer. */
async function replies(who, body, options) {
  const answer = await reply(who, body, options);
  await w.settle();
  return answer;
}

/** The email handed to the mail door, as its reader reads it. */
async function emailText(sent) {
  const said = textOf(await render(sent.react));
  return said.slice(said.indexOf(sent.subject, 1));
}

async function mailOf() {
  return Promise.all(world.mail.map(async (sent) => [sent.to, sent.subject, sent.kind, await emailText(sent)]));
}

/**
 * Somebody the leaving world gives no application, holding a place on AGI
 * Strategy by their own ranking: a copy of Amara's, theirs.
 */
function holdsAPlace(uid, name) {
  const application = structuredClone(read(applicationPath("amara")));
  application.uid = uid;
  application.email = `${uid}@example.com`;
  application.displayName = name;
  for (const content of [application.draft, application.sent]) content.aboutYou.preferredName = name.split(" ")[0];
  world.db.seed(applicationPath(uid), application);
}

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

/** The person's own application, as stored: what the reply wrote. */
function applicationOf(uid) {
  const stored = read(applicationPath(uid));
  return {
    status: stored.status,
    attendance: stored.attendance?.answer ?? null,
    answeredAt: at(stored.attendance?.answeredAt ?? null),
    withdrawnAt: at(stored.withdrawnAt ?? null),
    releaseReason: stored.releaseReason ?? null,
  };
}

/** Their seat on the run, as stored. */
function seatOf(uid) {
  const seat = read(enrolmentPath(uid));
  return {
    status: seat.status,
    groupId: seat.groupId,
    told: seat.allocatedEmailAt instanceof Date ? at(seat.allocatedEmailAt) : null,
    droppedOutAt: at(seat.droppedOutAt ?? null),
    dropOutReason: seat.dropOutReason ?? null,
  };
}

/** The session the lead's pages read, with the reviewer flag the roles writer keeps. */
function sessionFor(uid) {
  return { ...w.sessionOf(uid), admissionsReviewer: read(`users/${uid}`)?.admissionsReviewer === true };
}

/** When the run's last session ends. */
const endOf = async () => record.readRunEndById(world.courseDb, RUN.agi, new Date());

// The page's words, built from the words module so a change there is one change.
// CHANGED ON PURPOSE (Zach, 29 Oct 2026, "can you make this time?"): after what
// giving the place back means, the page now says that a time that doesn't work
// is told on the programme's page instead, keeping the place. Nothing about the
// leave changed: only this page gained the sentence.
const AGI_TOLD = (group) =>
  "Your application AGI Strategy Fellowship Accepted Autumn 2026 · Fri 23 Oct You’re in AGI Strategy. 6 WEEKS · " +
  `starts w/c 26 Oct You’re in ${group}. Your programme’s page has your sessions and each week’s ` +
  "reading. Go to your programme Changed your mind? Giving your place back now means leaving " +
  `${group}. You can do that from your programme’s page. Only the time doesn’t work? Tell us on your ` +
  "programme’s page instead. You keep your place. Questions? ai-safety@uonsu.com";

// CHANGED ON PURPOSE (somebody who leaves keeps nothing): the card said "Your
// notes and the reading list are still on your programme’s page." between the
// day and "Changed your mind?". The programme's page now shows somebody who
// left only that they left, so the sentence is gone, and the card is held to
// its whole text without it.
const LEFT_CARD = (day) =>
  "Autumn 2026 · Fri 23 Oct Your application Left the programme You left AGI Strategy. " +
  `That was on ${day}. Thanks for coming along. ` +
  "Changed your mind? Email ai-safety@uonsu.com and we’ll see what we can do. Go to your programme";

const REMOVED_CARD = (day) =>
  "Autumn 2026 · Fri 23 Oct Your application Taken off the programme You’re no longer on AGI Strategy. " +
  `That was on ${day}. If you think that’s a mistake, email ai-safety@uonsu.com and we’ll see what we can do. ` +
  "Our events are open to everyone, so come along to one. See what’s on";

// ---------------------------------------------------------------------------
// 1. One act, two doors
// ---------------------------------------------------------------------------

describe("1. one act, two doors", () => {
  test("in a group Publish told her about, Amara's reply takes her out of it at once, and gives the place back in the same act", async () => {
    const before = snapshot();
    const answer = await replies("amara");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(
      [answer.body.ok, answer.body.changed, answer.body.application.status, answer.body.application.attendance.answer],
      [true, true, "withdrawn", "cant-make-it"],
    );
    assert.deepEqual(changedSince(before), [
      applicationPath("amara"),
      formPath,
      "courseAudit/auto",
      enrolmentPath("amara"),
      `courseGroups/${A}`,
      "subscriptionEvents/auto",
      subscriptionPath("amara"),
      taskPath("amara"),
    ].sort());
    // Off her group, with the day and her reason; the group and Publish's stamp kept.
    assert.deepEqual(seatOf("amara"), {
      status: "withdrawn",
      groupId: A,
      told: TOLD_ON.toISOString(),
      droppedOutAt: NOW.toISOString(),
      dropOutReason: TIMES_SAID,
    });
    assert.equal(read(`courseGroups/${A}`).memberCount, 3);
    // The place on the form, given back as "I can’t make it" gives it, with
    // her reason kept with her seat and not on the application.
    assert.deepEqual(applicationOf("amara"), {
      status: "withdrawn",
      attendance: "cant-make-it",
      answeredAt: NOW.toISOString(),
      withdrawnAt: NOW.toISOString(),
      releaseReason: null,
    });
    const counts = read(formPath).applicationCounts;
    assert.deepEqual([counts.accepted, counts.withdrawn], [3, 2]);
    // Off the cohort list, the week's card gone, one email, to her.
    assert.equal(read(subscriptionPath("amara")).subscribed, false);
    assert.equal(read(taskPath("amara")), undefined);
    assert.deepEqual(world.mail.map((sent) => [sent.to, sent.subject]), [["amara@example.com", "You've left AGI Strategy Fellowship"]]);
    // Her row on the run's own list is as the hand-over wrote it.
    assert.equal(before.get(rowPath("amara")), JSON.stringify(read(rowPath("amara"))));
  });

  test("by either door, the same records and the same email, word for word", async () => {
    const byDoor = async (door) => {
      reset();
      const before = snapshot();
      const answer =
        door === "the programme page"
          ? await leave("amara", { confirmName: TITLE, reason: TIMES_SAID })
          : await replies("amara");
      assert.equal(answer.status, 200, `${door}: ${JSON.stringify(answer.body)}`);
      return { written: writtenSince(before), mail: await mailOf() };
    };
    const programmePage = await byDoor("the programme page");
    const applicationPage = await byDoor("the application page");
    assert.deepEqual(Object.keys(programmePage.written).length, 8);
    assert.deepEqual(applicationPage.written, programmePage.written);
    assert.deepEqual(applicationPage.mail, programmePage.mail);
    assert.equal(programmePage.mail.length, 1);
  });

  test("a reason in their own words is kept as they wrote it, with their seat", async () => {
    assert.equal((await replies("amara", { reply: "cant-make-it", reason: { kind: "other", other: "  I start a placement in Leeds.  " } })).status, 200);
    assert.equal(seatOf("amara").dropOutReason, "I start a placement in Leeds.");
    assert.equal(applicationOf("amara").releaseReason, null);
  });

  test("the reply still asks why: with no reason it is refused before anything is read, and nothing is written", async () => {
    const before = snapshot();
    const answer = await reply("amara", { reply: "cant-make-it" });
    assert.deepEqual([answer.status, answer.body.error], [400, "Choose a reason from the list before you send this."]);
    assert.deepEqual(changedSince(before), []);
  });

  test("a second press writes and sends nothing, whichever door came first", async () => {
    for (const [first, then] of [
      ["reply", "reply"],
      ["reply", "leave"],
      ["leave", "reply"],
    ]) {
      reset();
      const press = (door) => (door === "reply" ? replies("amara") : leave("amara", { confirmName: TITLE, reason: TIMES_SAID }));
      assert.equal((await press(first)).status, 200, `${first} first`);
      const before = snapshot();
      const again = await press(then);
      assert.equal(again.status, 200, `${first}, then ${then}: ${JSON.stringify(again.body)}`);
      if (then === "reply") assert.equal(again.body.changed, false, `${first}, then ${then}`);
      assert.deepEqual(changedSince(before), [], `${first}, then ${then}`);
      assert.equal(world.mail.length, 1, `${first}, then ${then}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. What leaving refuses, the reply refuses in its words
// ---------------------------------------------------------------------------

describe("2. what leaving refuses, the reply refuses in its words", () => {
  test("after the run's last session: refused as leaving refuses, and her place and seat are as they were", async () => {
    mock.timers.setTime((await endOf()).endsAt.getTime());
    const before = snapshot();
    const answer = await replies("amara");
    assert.deepEqual([answer.status, answer.body.error], [409, ENDED]);
    // The leave door says the same words.
    assert.deepEqual([(await leave("amara", { confirmName: TITLE })).body.error], [ENDED]);
    assert.deepEqual(changedSince(before), []);
    assert.equal(world.mail.length, 0);
    assert.deepEqual([applicationOf("amara").status, seatOf("amara").status], ["accepted", "active"]);
  });

  test("a seat the run's own older form gave her is not hers to leave: refused in leaving's words", async () => {
    holdsAPlace("chloe", "Chloe Nguyen");
    const before = snapshot();
    const answer = await replies("chloe");
    assert.deepEqual([answer.status, answer.body.error], [409, NOT_YOURS]);
    assert.deepEqual([(await leave("chloe", { confirmName: TITLE })).body.error], [NOT_YOURS]);
    assert.deepEqual(changedSince(before), []);
    assert.equal(world.mail.length, 0);
  });

  test("a seat whose row came from another programme is no way out of this place: refused, and nothing is written", async () => {
    world.db.poke(rowPath("amara"), { "fromForm.programmeId": "technical-ai-safety" });
    const before = snapshot();
    const answer = await replies("amara");
    assert.deepEqual([answer.status, answer.body.error], [409, NOT_YOURS]);
    assert.deepEqual(changedSince(before), []);
  });

  test("the lead, a facilitator and an admin cannot make anybody leave: a reply is only ever about the caller's own place", async () => {
    const before = snapshot();
    const refused = {};
    for (const who of ["claudia", "sofia", "zach", "dev"]) {
      const answer = await replies(who, { reply: "cant-make-it", reason: TIMES });
      refused[who] = answer.status;
    }
    // Dev holds a place too: his reply takes Dev off, and nobody else.
    assert.deepEqual(refused, { claudia: 404, sofia: 404, zach: 404, dev: 200 });
    const changed = changedSince(before);
    assert.ok(changed.includes(enrolmentPath("dev")));
    for (const uid of ["amara", "bea", "tariq"]) assert.ok(!changed.includes(enrolmentPath(uid)), uid);
    assert.equal(seatOf("amara").status, "active");
  });

  test("a view-as session and somebody signed out are refused, and nothing is written", async () => {
    const before = snapshot();
    const viewAs = await replies("amara", undefined, { viewAs: true });
    const signedOut = await replies(null);
    assert.deepEqual([[viewAs.status, viewAs.body.error], [signedOut.status, signedOut.body.error]], [[403, "view-as"], [401, "Not signed in."]]);
    assert.deepEqual(changedSince(before), []);
  });
});

// ---------------------------------------------------------------------------
// 3. Everybody else keeps today's reply
// ---------------------------------------------------------------------------

describe("3. everybody else keeps today's reply", () => {
  test("accepted and not in a group (an accepted invitation): the place goes back on the form, and nothing of the run is touched", async () => {
    assert.equal((await reply("ines", { reply: "accept-invitation" })).status, 200);
    const before = snapshot();
    assert.equal((await replies("ines")).status, 200);
    assert.deepEqual(changedSince(before), [applicationPath("ines"), formPath].sort());
    assert.deepEqual(applicationOf("ines"), {
      status: "withdrawn",
      attendance: "cant-make-it",
      answeredAt: NOW.toISOString(),
      withdrawnAt: NOW.toISOString(),
      releaseReason: TIMES,
    });
    assert.equal(world.mail.length, 0);
    assert.deepEqual(await listLine("ines"), ["Place given back", "You’ve told us you can’t make it."]);
  });

  test("placed and not told: the reply gives the place back as before groups went out, and her seat is left where it is, untold", async () => {
    holdsAPlace("una", "Una Byrne");
    const seat = JSON.stringify(read(enrolmentPath("una")));
    const before = snapshot();
    assert.equal((await replies("una")).status, 200);
    assert.deepEqual(changedSince(before), [applicationPath("una"), formPath].sort());
    assert.equal(JSON.stringify(read(enrolmentPath("una"))), seat);
    assert.equal(applicationOf("una").releaseReason.kind, "times");
    assert.equal(world.mail.length, 0);
  });

  test("a seat moved between the reply's read and the leave's: nothing of the run is written, and the reply is the one before groups went out", async () => {
    const runTransaction = world.db.runTransaction;
    // The first transaction is the leave's. Just before it reads, an admin
    // moves her to Group B, which leaves her untold until Publish.
    world.db.runTransaction = async function moved(fn) {
      world.db.runTransaction = runTransaction;
      world.db.poke(enrolmentPath("amara"), { groupId: B, allocatedEmailAt: null });
      return runTransaction.call(world.db, fn);
    };
    try {
      const before = snapshot();
      const answer = await replies("amara");
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.deepEqual(changedSince(before), [applicationPath("amara"), enrolmentPath("amara"), formPath].sort());
      assert.deepEqual([seatOf("amara").status, seatOf("amara").groupId, seatOf("amara").told], ["active", B, null]);
      assert.equal(applicationOf("amara").releaseReason.kind, "times");
      assert.equal(world.mail.length, 0);
    } finally {
      world.db.runTransaction = runTransaction;
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The application page
// ---------------------------------------------------------------------------

describe("4. what the application page says, in each state", () => {
  test("before Publish has told her, as it always was: I’m coming and I can’t make it", async () => {
    // Una is placed in Group C, and Publish has not told her.
    holdsAPlace("una", "Una Byrne");
    const page = await ownPage("una");
    assert.equal(page.view.inGroup, undefined);
    assert.match(page.text, /I’m coming Optional\. It helps us plan groups\. I can’t make it This frees your place for someone else\./);
    assert.deepEqual(await listLine("una"), ["Accepted", "You’re in AGI Strategy."]);
  });

  test("in a group Publish told her about: no reply buttons, the way to her programme's page, and what giving the place back now means", async () => {
    const page = await ownPage("amara");
    assert.equal(page.text, AGI_TOLD("Group A"));
    assert.deepEqual(page.view.inGroup, { runId: RUN.agi, groupName: "Group A", leave: "open" });
    assert.match(page.html, new RegExp(`<a href="${HOME}" class="primary primary"><span>Go to your programme</span>`));
    assert.ok(!page.html.includes("<button"), "a reply button is still drawn");
    assert.ok(!page.text.includes("I can’t make it") && !page.text.includes("I’m coming"));
    assert.deepEqual(await listLine("amara"), ["Accepted", "You’re in AGI Strategy."]);
  });

  test("on a seat the team takes her off, the page says whom to write to", async () => {
    holdsAPlace("chloe", "Chloe Nguyen");
    const page = await ownPage("chloe");
    assert.deepEqual(page.view.inGroup, { runId: RUN.agi, groupName: "Group B", leave: "ask-the-team" });
    assert.match(
      page.text,
      /You’re in Group B\. Your programme’s page has your sessions and each week’s reading\. Go to your programme Changed your mind\? Email ai-safety@uonsu\.com and we’ll sort it out with you\. Questions\?/,
    );
    assert.match(page.html, /<a href="mailto:ai-safety@uonsu.com" class="link">ai-safety@uonsu.com<\/a> and we’ll sort it out with you\./);
  });

  test("once the run's last session is over there is nothing to give back: no line about it", async () => {
    mock.timers.setTime((await endOf()).endsAt.getTime() + 60_000);
    const page = await ownPage("amara");
    assert.equal(page.view.inGroup.leave, "ended");
    assert.ok(page.text.endsWith("You’re in Group A. Your programme’s page has your sessions and each week’s reading. Go to your programme Questions? ai-safety@uonsu.com"), page.text);
  });

  test("once she has left, by either door, the page and the list say she left and when, and never that she told us she can't make it", async () => {
    for (const door of ["the programme page", "the application page"]) {
      reset();
      if (door === "the programme page") await leave("amara");
      else await replies("amara");
      const page = await ownPage("amara");
      assert.equal(page.text, LEFT_CARD("Tue 17 Nov"), door);
      assert.equal(page.view.kind, "left", door);
      assert.match(page.html, new RegExp(`<a href="${HOME}" class="outlineSmall"><span>Go to your programme</span>`), door);
      assert.ok(!/can’t make it/.test(page.text), door);
      assert.deepEqual(await listLine("amara"), ["Left the programme", "You left AGI Strategy."], door);
    }
  });

  // Remove is staff taking somebody off, not leaving: the run closes to them
  // as it always has, and their page says nothing of a group or of leaving.
  // Since the follow-ups to Publish (October 2026, the walk's H5, the
  // owner's yes) Remove gives the place on the form back as leaving does, so
  // the page says they were taken off the programme, and when. Until then it
  // read as before groups went out ("I’m coming" and "I can’t make it", view
  // kind `place`): this test pinned that, and now pins the new page as
  // strictly, word for word.
  test("somebody staff took off the run reads that they were taken off, not that they left or said they can't make it", async () => {
    const removed = await call("claudia", routes.remove.POST, { runId: RUN.agi, uid: "tariq" }, { course: true });
    assert.equal(removed.status, 200);
    assert.deepEqual(
      [applicationOf("tariq").status, applicationOf("tariq").attendance, applicationOf("tariq").releaseReason],
      ["withdrawn", "cant-make-it", null],
    );
    const page = await ownPage("tariq");
    assert.equal(page.view.kind, "removed");
    assert.equal(page.view.inGroup, undefined);
    assert.equal(page.text, REMOVED_CARD("Tue 17 Nov"));
    assert.match(page.html, /<a href="\/events" class="outlineSmall"><span>See what’s on<\/span>/);
    assert.ok(!page.html.includes(HOME), "the run closes to somebody taken off it");
    assert.ok(!page.html.includes("<button"), "a reply button is still drawn");
    assert.ok(!page.text.includes("Left the programme") && !/can’t make it|I’m coming/.test(page.text));
    assert.deepEqual(await listLine("tariq"), ["Taken off the programme", "You’re no longer on AGI Strategy."]);
  });

  test("on an incubator: the same pages, and never the word group", async () => {
    world.db.poke(formPath, { [`programmes.${AGI}.kind`]: "incubator" });
    const told = await ownPage("amara");
    assert.deepEqual(told.view.inGroup, { runId: RUN.agi, groupName: null, leave: "open" });
    assert.match(
      told.text,
      /starts w\/c 26 Oct Your programme’s page has your sessions and each week’s reading\. Go to your programme Changed your mind\? Giving your place back now means leaving the programme\. You can do that from your programme’s page\./,
    );
    assert.equal((await replies("amara")).status, 200);
    assert.equal(seatOf("amara").status, "withdrawn");
    const left = await ownPage("amara");
    assert.equal(left.text, LEFT_CARD("Tue 17 Nov"));
    for (const text of [told.text, left.text]) assert.doesNotMatch(text, /group/i);
  });

  test("the form's own screen, as the page draws it for her: the told card, then the left card once she has gone", async () => {
    const screen = async () => {
      world.user = w.sessionOf("amara");
      return textOf(renderToStaticMarkup(await renderApplicationStatus({ roundId: ROUND, user: w.sessionOf("amara") })));
    };
    const before = snapshot();
    assert.ok((await screen()).includes("You’re in Group A. Your programme’s page has your sessions"));
    assert.deepEqual(changedSince(before), [], "drawing the page wrote something");
    await replies("amara");
    assert.ok((await screen()).includes("Left the programme You left AGI Strategy. That was on Tue 17 Nov."));
  });
});

// ---------------------------------------------------------------------------
// 5. What everybody else sees
// ---------------------------------------------------------------------------

describe("5. what everybody else sees of somebody who left by replying", () => {
  test("another member of her group: she is gone from the group's names", async () => {
    await replies("amara");
    const roster = await call("dev", routes.roster.GET, { groupId: A }, { course: true });
    assert.deepEqual(roster.body.members.map((member) => member.uid), ["bea", "dev", "tariq"]);
  });

  test("her facilitator's register lists her last, read only, with the marks she had and the day", async () => {
    await replies("amara");
    const answer = await call("sofia", routes.register.GET, { groupId: A }, { course: true });
    assert.deepEqual(answer.body.members.map((member) => member.uid), ["bea", "dev", "tariq"]);
    assert.deepEqual(answer.body.leavers[0], {
      uid: "amara",
      displayName: "Amara Okafor",
      left: "Left Tue 17 Nov",
      records: { w01: "present", w02: "present", w03: "present" },
    });
  });

  test("the lead and an admin: the grid says the day, and the Overview the day and what she said", async () => {
    await replies("amara");
    for (const viewer of [{ isAdmin: false, uid: "claudia" }, { isAdmin: true, uid: "zach" }]) {
      const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
      const grid = lib.attendance.buildRunAttendance(records, viewer, new Date());
      const amara = grid.groups.find((group) => group.id === A).people.find((person) => person.uid === "amara");
      assert.equal(amara.left, "Left Tue 17 Nov", viewer.uid);
      const overview = await lib.overview.buildProgrammeOverview(
        world.courseDb,
        records,
        viewer,
        { programmePath: `/admin/admissions/forms/${ROUND}/programmes/${AGI}`, courseId: "c", decisionsSentAt: read(formPath).decisionsSentAt },
        new Date(),
      );
      assert.deepEqual(
        overview.attention.filter((item) => item.kind === "left").map((item) => [item.title, item.detail])[0],
        ["Amara Okafor left on Tue 17 Nov", `Amara said: “${TIMES_SAID}” Amara’s off Group A’s register from week 4.`],
        viewer.uid,
      );
    }
  });

  test("the lead's attendance CSV says the day, in its Left column", async () => {
    await replies("amara");
    // Called directly: its answer is a file, which the world's request helper does not copy.
    world.user = w.sessionOf("claudia");
    const response = await routesOfTheForm.csv.POST(new Request("https://naisi.invalid/api", { method: "POST" }), {
      params: Promise.resolve(programme),
    });
    assert.equal(response.status, 200);
    const rows = (await response.text()).replace(/^\uFEFF/, "").trim().split(/\r?\n/).map((row) => row.split(","));
    const left = rows[0].indexOf("Left");
    assert.ok(left > 0, rows[0].join(","));
    assert.deepEqual(rows.find((row) => row[1] === "Amara Okafor").slice(left), ["2026-11-17"]);
    // Those still in the group read no day.
    assert.deepEqual(rows.find((row) => row[1] === "Dev Patel").slice(left), [""]);
  });

  test("the lead's Applications list: her place given back with I can’t make it, and her reason not on it", async () => {
    await replies("amara");
    const list = await call("claudia", routesOfTheForm.list.GET, programme);
    const row = list.body.board.rows.find((entry) => entry.uid === "amara");
    assert.deepEqual([row.withdrawn, row.gaveBack], [true, { said: "I can’t make it", reason: null }]);
  });

  test("who finished, once the run is over: she is under the people who left, with the day", async () => {
    await replies("amara");
    mock.timers.setTime((await endOf()).endsAt.getTime() + 60_000);
    const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
    const model = await whoFinished.loadWhoFinished(world.courseDb, records, { isAdmin: false, uid: "claudia" }, new Date());
    assert.equal(model.state, "open");
    assert.deepEqual(model.left.find((person) => person.uid === "amara"), {
      uid: "amara",
      name: "Amara Okafor",
      groupName: "Group A",
      left: "Left Tue 17 Nov",
    });
    assert.ok(!model.rows.some((row) => row.name === "Amara Okafor"));
  });

  test("after week 1 the freed place cannot be offered; in week 1 it can", async () => {
    const offerBoard = async () => (await lib.freed.loadOfferBoard(world.db, sessionFor("claudia"), ROUND, AGI, new Date())).board;
    const before = await offerBoard();
    await replies("amara");
    const after = await offerBoard();
    assert.equal(after.free, before.free + 1);
    assert.deepEqual(after.window, {
      open: false,
      sentence: "Freed places on AGI Strategy could be offered until Wed 4 Nov, the end of week 1. That has passed.",
    });
    // Thu 29 Oct, the run's first day: the window is open, and her place is free on it.
    reset();
    mock.timers.setTime(new Date("2026-10-29T09:00:00Z").getTime());
    const early = await offerBoard();
    await replies("amara");
    const freed = await offerBoard();
    assert.deepEqual([freed.free, freed.window.open], [early.free + 1, true]);
    assert.equal(seatOf("amara").droppedOutAt, "2026-10-29T09:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// 6. The log line
// ---------------------------------------------------------------------------

describe("6. the log line says what was done and never what she said", () => {
  test("by either door, with a reason: exactly these fields, and the reason nowhere in the log", async () => {
    for (const door of ["the programme page", "the application page"]) {
      reset();
      if (door === "the programme page") await leave("amara", { confirmName: TITLE, reason: TIMES_SAID });
      else await replies("amara");
      const logged = world.db.paths().filter((path) => path.startsWith("courseAudit/")).map(read);
      assert.deepEqual(
        logged.map((row) => ({ ...row, at: at(row.at) })),
        [
          {
            kind: "enrolment-dropout",
            runId: RUN.agi,
            groupId: A,
            subjectUid: "amara",
            actorUid: "amara",
            actorName: "Amara Okafor",
            targetLabel: "Autumn 2026",
            detail: "Left the course.",
            at: NOW.toISOString(),
          },
        ],
        door,
      );
      assert.ok(!JSON.stringify(logged).includes("times"), door);
      // It is kept with her seat, where her lead and admins read it.
      assert.equal(seatOf("amara").dropOutReason, TIMES_SAID, door);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. The tree
// ---------------------------------------------------------------------------

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });

/** A file addresses the seats when its code hands the collection's name to a database call. */
const ADDRESSES_SEATS = /\.collection\(\s*["'`]courseEnrolments["'`]\s*\)|\b(?:collection|doc)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*["'`]courseEnrolments["'`]/;
/** A write of a seat that has left by their own act. */
const WRITES_LEFT = /status:\s*["']withdrawn["']/;

/**
 * Every file that addresses the seats and writes a status of withdrawn: how
 * many such writes it holds, what shows where they go, and why. The one
 * leave is the only one that writes it to a seat.
 */
const WITHDRAWN_WRITERS = {
  "lib/courses/leaveRun.ts": {
    writes: 1,
    proof: 'status: "withdrawn" satisfies CourseEnrolmentStatus,',
    why: "the one leave: what leaving writes to the seat, for both doors",
  },
  "lib/firestore/courseDeletion.ts": {
    writes: 1,
    proof: 'status: "withdrawn", seatApplicationId: null,',
    why: "destroying a run releases the older admission applications that pointed at it, beside their seat pointer: never a seat",
  },
};

/** Every caller of the one leave, and why. */
const LEAVE_CALLERS = {
  "app/api/courses/runs/[runId]/enrol/route.ts": "the first door: Leave the programme, behind the course's title typed to confirm",
  "app/api/admissions/forms/[roundId]/application/reply/route.ts":
    "the second door: I can’t make it from somebody in a group Publish has told them about",
};

/** Every caller of the one answer to "in a group Publish has told them about", and why. */
const PLACE_READERS = {
  "app/api/admissions/forms/[roundId]/application/reply/route.ts": "whether the reply is leaving the programme",
  "lib/applications/status/load.ts": "what the person's own application page, and the list of their applications, say",
  "lib/applications/status/whenFree.ts": "whether the week a place painted is still theirs to change: until Publish has told them their group",
};

describe("7. the tree: one leave and one answer, each asked where this file says", () => {
  const files = [...walkSource(SRC)];
  const callers = (name) =>
    files.filter((file) => new RegExp(`\\b${name}\\(`).test(codeOf(file)) && !inSrc(file).endsWith(`/${name === "leaveRun" ? "leaveRun" : "placeOnRun"}.ts`)).map(inSrc).sort();

  test("the scan reads the tree: it finds the readers of seats it knows by name", () => {
    const readers = files.filter((file) => ADDRESSES_SEATS.test(codeOf(file))).map(inSrc);
    assert.ok(readers.length >= 25, `only ${readers.length} files address the seats`);
    for (const known of ["lib/courses/leaveRun.ts", "lib/courses/placeOnRun.ts", "features/courses/runAccess.ts"]) {
      assert.ok(readers.includes(known), known);
    }
  });

  test("only the one leave writes a seat that has left", () => {
    const writers = files.filter((file) => ADDRESSES_SEATS.test(codeOf(file)) && WRITES_LEFT.test(codeOf(file))).map(inSrc).sort();
    assert.deepEqual(
      writers,
      Object.keys(WITHDRAWN_WRITERS).sort(),
      "a file that addresses the seats writes a status of withdrawn and is not listed: if it is a seat, take the press to leaveRun; if not, list it with what shows where the write goes",
    );
    for (const [file, entry] of Object.entries(WITHDRAWN_WRITERS)) {
      const code = codeOf(join(SRC, ...file.split("/"))).replace(/\s+/g, " ");
      assert.equal(code.match(new RegExp(WRITES_LEFT.source, "g")).length, entry.writes, `${file}: a write of withdrawn was added or went`);
      assert.ok(code.includes(entry.proof), `${file} no longer shows where its write goes: ${entry.proof}`);
    }
  });

  test("the one leave is taken by the two doors and nothing else", () => {
    assert.deepEqual(callers("leaveRun"), Object.keys(LEAVE_CALLERS).sort());
  });

  test("the one answer to in a group is asked by the reply and the page and nothing else", () => {
    assert.deepEqual(callers("readPlaceOnRun"), Object.keys(PLACE_READERS).sort());
  });

  test("every entry carries its reason", () => {
    for (const [file, why] of Object.entries({ ...Object.fromEntries(Object.entries(WITHDRAWN_WRITERS).map(([key, entry]) => [key, entry.why])), ...LEAVE_CALLERS, ...PLACE_READERS })) {
      assert.ok(why.length >= 30, file);
    }
  });
});
