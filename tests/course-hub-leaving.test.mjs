/**
 * Leaving a programme's run (Q12, board wk-left-phone), and what everybody
 * else then sees of somebody who left, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /learn/[runId]                                          the programme page: the way out, and once left, wk-left-phone
 *   /learn/[runId]/leave                                    the confirmation
 *   DELETE /api/courses/runs/[runId]/enrol                  the leave itself
 *   /learn/[runId]/notes, /learn/[runId]/reading            the same page, for somebody who left
 *   /learn                                                  My programmes, and its card for a run they left
 *   GET  /api/courses/groups/[groupId]/attendance           the facilitators' register (the stage two walk's G3)
 *   POST /api/courses/runs/[runId]/enrolments/[uid]/remove  Remove, which now records the day
 *   POST /api/courses/runs/[runId]/allocate                 putting somebody back
 *
 * ## What this guards
 *
 *  1. THE WAY OUT is drawn where the press works: for somebody taking part
 *     whose seat the form gave them, or who took an open run's seat, and for
 *     nobody else. The confirmation says what leaving does, who reads the
 *     reason, and asks for the course's title; before its script arrives its
 *     button is dead.
 *  2. LEAVING A RUN THE FORM PLACED YOU ON refuses a wrong title, then writes
 *     exactly this: the seat withdrawn with the day and the reason (the group
 *     and Publish's stamp kept), the group's count, the place on the form
 *     given back as "I can’t make it" gives it (no reason on the application),
 *     the form's counts, the cohort list, the week's card in their tasks, one
 *     log line, and one email to them and nobody else. A second press does
 *     nothing. A place already given back is left alone. The place is free on
 *     the form at once, and after week 1 nobody can be offered it. Publish
 *     waits for nobody who left.
 *  3. NOBODY ELSE LEAVES: a placement Publish has not told is no seat; a seat
 *     that came from the run's own older form is not this person's to leave;
 *     staff, an admin, somebody signed out and a view-as session are refused.
 *     An open run's seat is left as it always was, and touches no form.
 *  4. WHAT THEY READ AFTER, which is that they left and nothing else:
 *     their programme page says they left and when, with the line about what
 *     to do if it was a mistake, whatever their records hold; the notes and
 *     reading list pages say the same and show none of what they wrote,
 *     which stays in the records; My programmes has a card for each run they
 *     left by themselves that says only that; none of the group's people,
 *     updates, sessions or registers; and the group, its facilitator, the
 *     lead and admins keep reading the notes they shared.
 *  5. EVERYBODY ELSE: the group's names leave them out; their facilitators'
 *     register lists them read only with the marks they had and the day, and
 *     refuses a mark for them; the lead's grid and Overview say the day and
 *     what they said; the register and the grid agree for every group, for
 *     the lead, an admin and each facilitator.
 *  6. REMOVE records the day; somebody who left by themselves is not removed
 *     (refused with the day they left, nothing written, so their day stays);
 *     somebody removed is not shown the page that says they left.
 *  7. PUTTING SOMEBODY BACK clears the day, the reason and Publish's stamp, so
 *     they read the run again only once Publish has told them.
 *  8. NOBODY LEAVES ONCE THE RUN'S LAST SESSION IS OVER, the moment who
 *     finished opens: the link goes, the confirmation sends them to the run's
 *     home, and the press is refused with a sentence, writing nothing and
 *     sending nothing, for a placed seat and an open run's alike.
 *
 * Real: the routes, the pages (server components) rendered to HTML, the access
 * gate, the form's own reply decision and writer, the lead's grid and
 * Overview, the email template. Faked: see `tests/lib/leavingWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import {
  A,
  AGI,
  AMARA_SAID,
  B,
  C,
  D,
  NOW,
  OPEN_GROUP,
  OPEN_RUN,
  ROUND,
  RUN,
  SAM_LEFT,
  TOLD_ON,
  applicationPath,
  enrolmentPath,
  formPath,
  makeLeavingWorld,
  registerPath,
  rowPath,
  subscriptionPath,
  taskPath,
  textOf,
} from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__courseHubLeaving");
const { world, call, routes, pages, components, lib, ui, leave, draw } = w;
const freedPlacesRoute = await w.formRoute("programmes", "[programmeId]", "freed-places");

const TITLE = "AGI Strategy Fellowship";
const HOME = `/learn/${RUN.agi}`;
/** Who finished's own answer to when a run is over. */
const runEnd = await w.loadTs(join("lib", "courses", "finishing", "record.ts"));
/** The one reader of a group's shared notes, and the shapes it is handed. */
const sharedNotes = await w.loadTs(join("lib", "courses", "sharedNotes", "readers.ts"));
const runs = await w.loadTs(join("lib", "firestore", "courses.ts"));
const groupDocs = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every document, by path, as it stands. */
function snapshot() {
  return new Map(world.db.paths().map((path) => [path, JSON.stringify(world.db.read(path))]));
}

/** The paths that changed, appeared or went since `before`, with a log line's own id folded. */
function changedSince(before) {
  const now = snapshot();
  const paths = new Set([...before.keys(), ...now.keys()]);
  return [...paths]
    .filter((path) => before.get(path) !== now.get(path))
    .map((path) => path.replace(/auto-\d+$/, "auto"))
    .sort();
}

const read = (path) => world.db.read(path);
const at = (value) => (value instanceof Date ? value.toISOString() : value);

/** The session a page reads, with the reviewer flag the roles writer keeps. */
function sessionFor(uid) {
  return { ...w.sessionOf(uid), admissionsReviewer: read(`users/${uid}`)?.admissionsReviewer === true };
}

/** The lead's grid, as the Attendance tab works it out. */
async function grid(viewer = { isAdmin: false }) {
  const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
  return lib.attendance.buildRunAttendance(records, viewer, new Date());
}

/** The people who left each group, on the lead's grid: `[uid, left]`. */
async function gridLeavers(viewer) {
  const model = await grid(viewer);
  return Object.fromEntries(
    model.groups.map((group) => [group.id, group.people.filter((person) => person.left).map((person) => [person.uid, person.left])]),
  );
}

/** The Overview's items about somebody who left, as the lead reads them. */
async function overviewLeft(viewer = { isAdmin: false, uid: "claudia" }) {
  const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
  const model = await lib.overview.buildProgrammeOverview(
    world.courseDb,
    records,
    viewer,
    { programmePath: `/admin/admissions/forms/${ROUND}/programmes/${AGI}`, courseId: "c", decisionsSentAt: read(formPath).decisionsSentAt },
    new Date(),
  );
  return {
    items: model.attention.filter((item) => item.kind === "left").map((item) => [item.title, item.detail]),
    people: model.people,
  };
}

/** A register as somebody reads it. */
const register = (who, groupId = A) => call(who, routes.register.GET, { groupId }, { course: true });

/** The register as its grid draws it, from the route's own answer. */
function drawGrid(payload, groupId = A) {
  ui.attendance = {
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
  const html = renderToStaticMarkup(createElement(components.AttendanceGrid, { groupId }));
  return { html, text: textOf(html) };
}

/** The email that was handed to the mail door, as its reader reads it. */
async function emailText(sent) {
  const said = textOf(await render(sent.react));
  // The preheader's filler comes first; the message starts at its heading.
  return said.slice(said.indexOf(sent.subject, 1));
}

const home = (who, runId = RUN.agi) => draw(pages.home, who, { runId });
const confirmation = (who, runId = RUN.agi) => draw(pages.leave, who, { runId });

// ---------------------------------------------------------------------------
// 1. The way out
// ---------------------------------------------------------------------------

describe("1. the way out: the link at the foot, and the confirmation", () => {
  test("the programme page draws “Leave the programme” where the press works, and nowhere else", async () => {
    const asked = {};
    for (const [who, runId] of [
      ["amara", RUN.agi],
      ["dev", RUN.agi],
      ["kai", OPEN_RUN],
      ["chloe", RUN.agi],
      ["sofia", RUN.agi],
      ["zach", RUN.agi],
    ]) {
      const drawn = await home(who, runId);
      asked[who] = drawn.to ?? ui.runHome?.canLeave;
      assert.equal(drawn.wrote, false, `${who}: a page wrote`);
    }
    assert.deepEqual(asked, {
      // Placed by the form, and told: their seat is theirs to leave.
      amara: true,
      dev: true,
      // The open run's own seat.
      kai: true,
      // She applied to the run itself: leaving is the team's to do.
      chloe: false,
      // A facilitator and an admin read the run and hold no seat on it.
      sofia: false,
      zach: false,
    });
    // Placed and not told, the lead (who reads the run through her
    // programme's tabs) and somebody signed out are not shown the run at all.
    assert.equal((await home("una")).to, "/learn");
    assert.equal((await home("claudia")).to, "/learn");
    assert.equal((await home(null)).to, "/learn");
  });

  test("the run home draws the link at its foot, from the overview route's own answer, only when told to", async () => {
    const overview = await call("dev", routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(overview.status, 200);
    ui.overview = { data: overview.body, error: null, reload: () => {} };
    const drawnWith = (canLeave) =>
      renderToStaticMarkup(
        createElement(components.RunHome, { runId: RUN.agi, isAdmin: false, canEmailCohort: false, pitching: null, canLeave }),
      );
    assert.match(drawnWith(true), new RegExp(`<div class="foot"><a href="${HOME}/leave" class="footLink">Leave the programme</a></div>`));
    assert.ok(!drawnWith(false).includes("Leave the programme"));
  });

  test("the confirmation, word for word, with its button dead before its script arrives", async () => {
    const drawn = await confirmation("amara");
    assert.equal(drawn.to, null);
    assert.equal(
      drawn.text,
      "AGI Strategy Leave the programme " +
        "Leave AGI Strategy? " +
        "You’ll leave Group A straight away and give your place back. " +
        // CHANGED ON PURPOSE (somebody who leaves keeps nothing, and the group
        // keeps their notes): this line said they keep their notes and the
        // reading list, which the page that says they left no longer shows.
        "Your marks so far stay on your group’s register, and the notes you shared stay with the group. " +
        "After you leave, your programme’s page shows only that you left. The weekly emails stop. " +
        "You can’t undo this yourself. If you change your mind, email ai-safety@uonsu.com and we’ll see what we can do. " +
        "Why are you leaving? (optional) " +
        "Only Claudia, who leads AGI Strategy, and admins read this. " +
        "Type AGI Strategy Fellowship to confirm " +
        "Leave AGI Strategy Stay",
    );
    assert.match(drawn.html, new RegExp(`<a href="${HOME}" class="back">`));
    // Real, labelled controls; uncontrolled, so nothing typed before the
    // script arrives is lost.
    assert.match(drawn.html, /<label class="label" for="leave-reason">Why are you leaving\? \(optional\)<\/label>/);
    assert.match(drawn.html, /<textarea id="leave-reason" name="reason" class="field textarea" maxLength="500" rows="3" aria-describedby="leave-reason-readers"><\/textarea>/);
    assert.match(drawn.html, /<input id="leave-confirm" class="field" autoComplete="off" spellCheck="false" name="confirmName"\/>/);
    assert.match(drawn.html, /<button type="submit" class="leave" disabled="">Leave AGI Strategy<\/button>/);
    assert.match(drawn.html, new RegExp(`<a href="${HOME}" class="stay">Stay</a>`));
    assert.equal(drawn.wrote, false);
  });

  test("once its script has arrived the button still waits for the course's title", async () => {
    ui.hydrated = true;
    const html = renderToStaticMarkup(
      createElement(components.LeaveForm, {
        runId: RUN.agi,
        courseTitle: TITLE,
        name: "AGI Strategy",
        readers: "Only Claudia, who leads AGI Strategy, and admins read this.",
        reasonMax: 500,
      }),
    );
    assert.match(html, /<button type="submit" class="leave" disabled="">Leave AGI Strategy<\/button>/);
  });

  test("an open run's confirmation names its group, and only admins read the reason", async () => {
    const drawn = await confirmation("kai", OPEN_RUN);
    assert.equal(
      drawn.text,
      "Pre-course Leave the programme Leave Pre-course? " +
        "You’ll leave Tuesday drop-in straight away and give your place back. " +
        // CHANGED ON PURPOSE, as above. An open run's groups share no notes
        // (`runSharesGroupNotes`), so its line names none.
        "Your marks so far stay on your group’s register. " +
        "After you leave, your programme’s page shows only that you left. The weekly emails stop. " +
        "You can’t undo this yourself. If you change your mind, email ai-safety@uonsu.com and we’ll see what we can do. " +
        "Why are you leaving? (optional) Only admins read this. " +
        "Type Pre-course to confirm Leave Pre-course Stay",
    );
  });

  test("a programme with no lead says the programme’s lead", async () => {
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: null });
    assert.match((await confirmation("amara")).text, /Only the programme’s lead and admins read this\./);
  });

  test("the confirmation is only for somebody who can leave", async () => {
    const sent = {};
    for (const who of ["una", "chloe", "sofia", "zach", "claudia", null]) sent[who ?? "signed out"] = (await confirmation(who)).to;
    // Back to the programme page, which decides the rest (it sends Una and
    // Claudia on to their programmes); somebody signed out has no session to
    // read a run with.
    assert.deepEqual(sent, {
      una: HOME,
      chloe: HOME,
      sofia: HOME,
      zach: HOME,
      claudia: HOME,
      "signed out": "/learn",
    });
    // And once somebody has left, theirs goes to the page that says so.
    assert.equal((await leave("amara")).status, 200);
    assert.equal((await confirmation("amara")).to, HOME);
  });
});

// ---------------------------------------------------------------------------
// 2. Leaving a run the form placed you on
// ---------------------------------------------------------------------------

describe("2. leaving a run the application form placed you on", () => {
  test("a wrong title is refused, and nothing is written or sent", async () => {
    const before = snapshot();
    for (const confirmName of ["AGI Strategy", "agi strategy fellowship", ` ${TITLE}`, ""]) {
      const answer = await leave("amara", { confirmName, reason: AMARA_SAID });
      assert.deepEqual([answer.status, answer.body], [400, { error: "That doesn't match the course title. Type it exactly to confirm." }], confirmName);
    }
    assert.deepEqual(changedSince(before), []);
    assert.equal(world.mail.length, 0);
  });

  test("leaving writes the seat, the group's count, the place on the form, the list, the card, one log line, and nothing else", async () => {
    const before = snapshot();
    const answer = await leave("amara");
    assert.deepEqual([answer.status, answer.body], [200, { ok: true, feedbackUrl: "" }]);

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

    // The seat: withdrawn, the day and the reason, the group and Publish's stamp kept.
    const seat = read(enrolmentPath("amara"));
    assert.deepEqual(
      [seat.status, at(seat.droppedOutAt), seat.dropOutReason, seat.groupId, at(seat.allocatedEmailAt)],
      ["withdrawn", NOW.toISOString(), AMARA_SAID, A, TOLD_ON.toISOString()],
    );
    assert.equal(read(`courseGroups/${A}`).memberCount, 3);
    // A seat the form gave was never counted by the open runs' counter.
    assert.equal(read(`courseRuns/${RUN.agi}`).enrolledCount, JSON.parse(before.get(`courseRuns/${RUN.agi}`)).enrolledCount);

    // The place on the form, given back as "I can’t make it" gives it, with no reason on the application.
    const application = read(applicationPath("amara"));
    assert.equal(application.status, "withdrawn");
    assert.equal(at(application.withdrawnAt), NOW.toISOString());
    assert.deepEqual(
      { answer: application.attendance.answer, answeredAt: at(application.attendance.answeredAt) },
      { answer: "cant-make-it", answeredAt: NOW.toISOString() },
    );
    assert.equal(application.releaseReason, undefined);
    assert.equal(JSON.stringify(application.result), JSON.stringify(JSON.parse(before.get(applicationPath("amara"))).result), "decision day's result is untouched");
    const counts = read(formPath).applicationCounts;
    assert.deepEqual([counts.accepted, counts.withdrawn], [3, 2]);
    // Her row on the run's own list stays as the hand-over wrote it.
    assert.equal(before.get(rowPath("amara")), JSON.stringify(read(rowPath("amara"))));

    // Off the cohort list, the week's card gone from her tasks.
    assert.equal(read(subscriptionPath("amara")).subscribed, false);
    assert.equal(read(taskPath("amara")), undefined);

    // One log line, naming her and her group.
    // CHANGED ON PURPOSE (the privacy review for version 7, its item 7): the
    // log of course actions outlives the account and says what was done, so
    // it no longer copies what she said. Her reason is kept with her seat
    // alone (above), for the programme's lead and admins.
    const logged = world.db.paths().filter((path) => path.startsWith("courseAudit/")).map(read);
    assert.equal(logged.length, 1);
    assert.deepEqual(
      [logged[0].kind, logged[0].runId, logged[0].groupId, logged[0].subjectUid, logged[0].actorUid, logged[0].detail],
      ["enrolment-dropout", RUN.agi, A, "amara", "amara", "Left the course."],
    );
    assert.ok(!JSON.stringify(logged[0]).includes(AMARA_SAID), "the log line copies her reason");
  });

  test("she is emailed, word for word, and nobody else is", async () => {
    await leave("amara");
    assert.deepEqual(
      world.mail.map((sent) => [sent.to, sent.subject, sent.kind]),
      [["amara@example.com", "You've left AGI Strategy Fellowship", "course-enrolment"]],
    );
    assert.equal(
      await emailText(world.mail[0]),
      "You've left AGI Strategy Fellowship " +
        "That's you off the list, Amara " +
        "You're no longer on AGI Strategy Fellowship (Autumn 2026), and your place has gone back to the group. The weekly emails will stop. " +
        "Thanks for giving it a go. If you'd like to join a future cohort, keep an eye on the courses page: applying again is welcome and counts for nothing against you. " +
        "Nothing else is needed from you. " +
        "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com",
    );
    // The reason she gave is never in it.
    assert.ok(!(await emailText(world.mail[0])).includes("Too much"));
  });

  test("a second press writes nothing and sends nothing", async () => {
    await leave("amara");
    const before = snapshot();
    const again = await leave("amara");
    assert.deepEqual([again.status, again.body], [200, { ok: true, feedbackUrl: "" }]);
    assert.deepEqual(changedSince(before), []);
    assert.equal(world.mail.length, 1);
  });

  // CHANGED ON PURPOSE (the privacy review for version 7, its item 7): the log
  // line no longer says whether a reason was given, as it no longer carries
  // one; it is the same line with a reason and without.
  test("with no reason, none is kept, and the log line is the one a leave with a reason writes", async () => {
    await leave("amara", { confirmName: TITLE });
    assert.equal(read(enrolmentPath("amara")).dropOutReason, null);
    const logged = world.db.paths().filter((path) => path.startsWith("courseAudit/")).map(read);
    assert.equal(logged[0].detail, "Left the course.");
    assert.deepEqual((await overviewLeft()).items[0], ["Amara Okafor left on Tue 17 Nov", "Amara’s off Group A’s register from week 4."]);
  });

  test("a place already given back on the form is left as it was", async () => {
    world.db.poke(applicationPath("amara"), {
      status: "withdrawn",
      withdrawnAt: new Date("2026-11-02T09:00:00Z"),
      attendance: { answer: "cant-make-it", answeredAt: new Date("2026-11-02T09:00:00Z") },
      releaseReason: { kind: "times", other: "" },
    });
    const application = JSON.stringify(read(applicationPath("amara")));
    const counts = JSON.stringify(read(formPath).applicationCounts);
    assert.equal((await leave("amara")).status, 200);
    assert.equal(JSON.stringify(read(applicationPath("amara"))), application);
    assert.equal(JSON.stringify(read(formPath).applicationCounts), counts);
    assert.equal(read(enrolmentPath("amara")).status, "withdrawn");
  });

  test("a place on another programme is not this run's to give back", async () => {
    // Her place stands on Technical AI Safety, whatever her row on this run says.
    const application = read(applicationPath("amara"));
    world.db.poke(applicationPath("amara"), { result: { ...application.result, programmeId: "technical-ai-safety" } });
    const before = JSON.stringify(read(applicationPath("amara")));
    const counts = JSON.stringify(read(formPath).applicationCounts);
    assert.equal((await leave("amara")).status, 200);
    assert.equal(JSON.stringify(read(applicationPath("amara"))), before);
    assert.equal(JSON.stringify(read(formPath).applicationCounts), counts);
  });

  test("somebody in a group with no place on the form leaves the run, and the form is not touched", async () => {
    const before = snapshot();
    assert.equal((await leave("freya", { confirmName: TITLE })).status, 200);
    const changed = changedSince(before);
    assert.ok(!changed.some((path) => path.startsWith("admission")), changed.join(", "));
    assert.equal(read(enrolmentPath("freya")).status, "withdrawn");
  });

  test("the place is free on the form at once, named as given back, and after week 1 nobody can be offered it", async () => {
    const before = await lib.freed.loadOfferBoard(world.db, sessionFor("claudia"), ROUND, AGI, new Date());
    await leave("amara");
    const after = await lib.freed.loadOfferBoard(world.db, sessionFor("claudia"), ROUND, AGI, new Date());
    assert.deepEqual([before.ok, after.ok], [true, true]);
    assert.equal(after.board.free, before.board.free + 1);
    assert.equal(after.board.gaveBack, "Amara Okafor and Nina Petrova gave theirs back.");
    assert.deepEqual(after.board.window, {
      open: false,
      sentence: "Freed places on AGI Strategy could be offered until Wed 4 Nov, the end of week 1. That has passed.",
    });
    // And the press that would offer it is refused for the window, before anybody is written to.
    const unchanged = snapshot();
    const offered = await call("claudia", freedPlacesRoute.POST, { roundId: ROUND, programmeId: AGI }, {
      body: { picks: [{ uid: "omar", groupId: D }], replyBy: "2026-11-20", invitations: 1 },
    });
    assert.deepEqual(
      [offered.status, offered.body.error],
      [409, "Freed places on AGI Strategy could be offered until Wed 4 Nov, the end of week 1. That has passed."],
    );
    assert.deepEqual(changedSince(unchanged), []);
  });

  test("Publish waits for nobody who left, and writes to none of them", async () => {
    await leave("amara");
    const pressed = await w.join.publish("claudia");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual(pressed.body.unplaced, []);
    assert.ok(!world.mail.slice(1).some((sent) => sent.to === "amara@example.com" || sent.to === "sam@example.com"));
    // The seat she left is still the one she left.
    assert.equal(read(enrolmentPath("amara")).status, "withdrawn");
  });
});

// ---------------------------------------------------------------------------
// 3. Nobody else leaves
// ---------------------------------------------------------------------------

describe("3. nobody else leaves, and an open run is left as it always was", () => {
  test("a placement Publish has not told is no seat: refused as none, and nothing is written or sent", async () => {
    const before = snapshot();
    const answer = await leave("una", { confirmName: TITLE });
    assert.deepEqual([answer.status, answer.body], [404, { error: "You're not signed up for this course." }]);
    assert.deepEqual(changedSince(before), []);
    assert.equal(world.mail.length, 0);
  });

  test("somebody who applied to the run itself is told to ask the team", async () => {
    const before = snapshot();
    const answer = await leave("chloe", { confirmName: TITLE });
    assert.deepEqual(
      [answer.status, answer.body],
      [409, { error: "Leaving this course isn't something you can do yourself. Email the team and we'll sort it out with you." }],
    );
    assert.deepEqual(changedSince(before), []);
  });

  test("staff, an admin, somebody signed out and a view-as session are refused, and nothing is written", async () => {
    const before = snapshot();
    const refused = {};
    for (const who of ["sofia", "claudia", "zach", null]) {
      const answer = await leave(who, { confirmName: TITLE });
      refused[who ?? "signed out"] = [answer.status, answer.body.error];
    }
    const viewAs = await leave("amara", undefined, RUN.agi, { viewAs: true });
    refused["view-as"] = [viewAs.status, viewAs.body.error];
    const ASK = "Leaving this course isn't something you can do yourself. Email the team and we'll sort it out with you.";
    assert.deepEqual(refused, {
      sofia: [409, ASK],
      claudia: [409, ASK],
      zach: [409, ASK],
      "signed out": [401, "Not signed in."],
      "view-as": [403, "view-as"],
    });
    assert.deepEqual(changedSince(before), []);
    assert.equal(world.mail.length, 0);
  });

  test("an open run: the seat goes back to its group and its run's count, and no form is touched", async () => {
    const before = snapshot();
    const answer = await leave("kai", { confirmName: "Pre-course" }, OPEN_RUN);
    assert.deepEqual([answer.status, answer.body], [200, { ok: true, feedbackUrl: "" }]);
    assert.deepEqual(changedSince(before), [
      "courseAudit/auto",
      enrolmentPath("kai", OPEN_RUN),
      `courseGroups/${OPEN_GROUP}`,
      `courseRuns/${OPEN_RUN}`,
      "subscriptionEvents/auto",
      subscriptionPath("kai", OPEN_RUN),
    ].sort());
    assert.equal(read(enrolmentPath("kai", OPEN_RUN)).status, "withdrawn");
    assert.equal(read(`courseGroups/${OPEN_GROUP}`).memberCount, 0);
    assert.equal(read(`courseRuns/${OPEN_RUN}`).enrolledCount, 0);
    assert.deepEqual(world.mail.map((sent) => [sent.to, sent.subject]), [["kai@example.com", "You've left Pre-course"]]);
    // He reads the page that says he left.
    assert.match((await home("kai", OPEN_RUN)).text, /^My programmes Pre-course You left Pre-course That was on Tue 17 Nov\. Thanks for coming along\./);
  });
});

// ---------------------------------------------------------------------------
// 4. What they read after
// ---------------------------------------------------------------------------

// CHANGED ON PURPOSE (somebody who leaves keeps nothing, and the group keeps
// their notes). Until then the page that says somebody left also listed what
// stayed theirs (their notes and reflections, the reading list, their marks)
// and the site's events, and the notes and reading list pages showed them.
// Now it says only that they left and when, with the line about what to do if
// it was a mistake, and those two pages say the same. Each old pin of a value
// on the page is replaced by the page's whole text, held against worlds in
// which every one of those values would have shown, and by the list of what
// it may no longer show.
describe("4. what somebody who left reads", () => {
  const LEFT_PAGE =
    "My programmes AGI Strategy " +
    "You left AGI Strategy That was on Tue 17 Nov. Thanks for coming along. " +
    "Changed your mind? Email ai-safety@uonsu.com and we’ll see what we can do.";

  /** Everything of Amara's, of Group A's or of the site's that the page showed before, and may not now. */
  const NOT_SHOWN = [
    "What stays here",
    "Your notes and reflections",
    "reading list",
    "Your marks",
    "Present",
    "Clearer than I expected.",
    "Reread section 3 before the session.",
    "Rated",
    "Racing to the precipice",
    "Still around",
    "Events are open to everyone.",
    "Pizza and board games",
    "Movie night",
    "Group A",
    "Dev Patel",
    AMARA_SAID,
  ];
  const showsNothingElse = (drawn, where) => {
    for (const words of NOT_SHOWN) assert.ok(!drawn.text.includes(words), `${where} shows “${words}”: ${drawn.text}`);
  };
  /** Where the page's links go, in order. */
  const linksOf = (drawn) => [...drawn.html.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);

  test("Amara's programme page says Amara left and when, and nothing else", async () => {
    await leave("amara");
    const drawn = await home("amara");
    assert.equal(drawn.to, null);
    assert.equal(drawn.text, LEFT_PAGE);
    showsNothingElse(drawn, "Amara's programme page");
    assert.equal(ui.runHome, null, "the cohort's page is not drawn for her");
    assert.match(drawn.html, /<a href="\/learn" class="back">/);
    assert.match(drawn.html, /<a href="mailto:ai-safety@uonsu.com" class="mail">ai-safety@uonsu.com<\/a>/);
    // Back to My programmes and the society's address: no way to Amara's notes,
    // the reading list or an event.
    assert.deepEqual(linksOf(drawn), ["/learn", "mailto:ai-safety@uonsu.com"]);
    assert.equal(drawn.wrote, false);
  });

  test("it is the same page whatever Amara's records hold: another day, every week published, a register changed, no events", async () => {
    // Amara left on Fri 6 Nov: the day is the one thing on the page that moves.
    mock.timers.setTime(new Date("2026-11-06T10:00:00Z").getTime());
    await leave("amara");
    mock.timers.setTime(NOW.getTime());
    const leftOnFriday = LEFT_PAGE.replace("Tue 17 Nov", "Fri 6 Nov");
    assert.equal((await home("amara")).text, leftOnFriday);
    for (let n = 4; n <= 6; n += 1) world.db.poke(`courseRuns/${RUN.agi}/weeks/w0${n}`, { published: true });
    world.db.poke(registerPath(A, 2), { pushedAt: null });
    for (const id of ["pizza", "movie"]) world.db.poke(`events/${id}`, { status: "draft" });
    const drawn = await home("amara");
    assert.equal(drawn.text, leftOnFriday);
    showsNothingElse(drawn, "Amara's programme page");
  });

  test("the notes' address shows the page that says Amara left, and none of what Amara wrote, which stays in the records", async () => {
    await leave("amara");
    const drawn = await draw(pages.notes, "amara", { runId: RUN.agi });
    assert.equal(drawn.to, null, "Amara is sent somewhere else instead of being told of leaving");
    assert.equal(drawn.text, LEFT_PAGE);
    showsNothingElse(drawn, "the notes' address");
    assert.deepEqual(linksOf(drawn), ["/learn", "mailto:ai-safety@uonsu.com"]);
    assert.equal(drawn.wrote, false);
    // What Amara wrote is where it was, for the programme's lead and admins.
    const note = read(`courseProgress/${RUN.agi}__amara__m_w1_reading`);
    assert.deepEqual([note.rating, note.publicComment, note.privateNote], [4, "Clearer than I expected.", "Reread section 3 before the session."]);
  });

  test("the reading list's address shows the same page, and no reading", async () => {
    await leave("amara");
    const drawn = await draw(pages.reading, "amara", { runId: RUN.agi });
    assert.equal(drawn.to, null, "Amara is sent somewhere else instead of being told of leaving");
    assert.equal(drawn.text, LEFT_PAGE);
    showsNothingElse(drawn, "the reading list's address");
    assert.deepEqual(linksOf(drawn), ["/learn", "mailto:ai-safety@uonsu.com"]);
    assert.equal(drawn.wrote, false);
  });

  test("she is no longer shown the group's people, its updates, its sessions or its registers", async () => {
    await leave("amara");
    const asked = {};
    for (const [name, handler, params] of [
      ["roster", routes.roster.GET, { groupId: A }],
      ["updates", routes.updates.GET, { runId: RUN.agi }],
      ["sessions and the week", routes.overview.GET, { runId: RUN.agi }],
      ["register", routes.register.GET, { groupId: A }],
    ]) {
      asked[name] = (await call("amara", handler, params, { course: true })).status;
    }
    assert.deepEqual(asked, { roster: 403, updates: 403, "sessions and the week": 403, register: 403 });
    // And no page of the run's but the one that says Amara left.
    assert.equal((await draw(pages.progress, "amara", { runId: RUN.agi })).to, "/learn");
  });

  test("the run's gate lets Amara through to the page that says Amara left, and nobody without a seat", async () => {
    await leave("amara");
    const through = {};
    for (const who of ["amara", "omar", "una", null]) {
      through[who ?? "signed out"] = (await draw(pages.layout, who, { runId: RUN.agi })).to;
    }
    assert.deepEqual(through, {
      amara: null,
      omar: "/learn",
      una: "/learn",
      "signed out": `/login?next=${encodeURIComponent(HOME)}`,
    });
  });

  test("the notes and reading list pages open to nobody else either, and somebody taking part still reads their own", async () => {
    await leave("amara");
    for (const Page of [pages.notes, pages.reading]) {
      const sent = {};
      for (const who of ["sofia", "zach", "omar", "una", null]) sent[who ?? "signed out"] = (await draw(Page, who, { runId: RUN.agi })).to;
      assert.deepEqual(sent, { sofia: HOME, zach: HOME, omar: HOME, una: HOME, "signed out": "/learn" });
    }
  });

  // MOVED, not dropped: these two pages are still what somebody taking part
  // reads, so what the leaver's pins held of them is held for Dev, in Group A
  // beside Amara: Dev's notes and nobody else's, word for word, and every
  // published week's readings as the group reads them, its own copy of a week
  // over the run's, and no week that is not published.
  test("somebody taking part reads their own notes, and the reading list as their group reads it", async () => {
    await leave("amara");
    const notes = await draw(pages.notes, "dev", { runId: RUN.agi });
    assert.equal(
      notes.text,
      "AGI Strategy Your notes and reflections Your notes and reflections " +
        "Week 1: Week 1 readings Racing to the precipice Your note: Dev's own note, which nobody else reads.",
    );
    assert.match(notes.html, new RegExp(`<a href="${HOME}" class="back">`));
    assert.equal(notes.wrote, false);

    const reading = await draw(pages.reading, "dev", { runId: RUN.agi });
    const week = (n, title) =>
      `Week ${n}: ${title} ${n === 1 ? "Racing to the precipice" : `Week ${n} reading`} Reading · 25 min ` +
      `Week ${n} slides Link · Optional Before the session Note Bring one question about week ${n}.`;
    assert.equal(
      reading.text,
      "AGI Strategy The reading list The reading list " +
        `${week(1, "Week 1 readings")} ${week(2, "Week 2 readings")} ${week(3, "Who decides what AGI means")}`,
    );
    assert.match(reading.html, /<a href="https:\/\/example.com\/readings\/week-1" class="readingLink" target="_blank" rel="noopener noreferrer">Racing to the precipice<\/a>/);
    assert.ok(!reading.text.includes("Week 4"), "a week not published is not listed");
    assert.equal(reading.wrote, false);
    // The group's own copy of a week is the one Dev reads.
    world.db.seed(`courseGroups/${A}/weeks/w02`, {
      ...read(`courseRuns/${RUN.agi}/weeks/w02`),
      title: "Group A's week 2",
      materials: [{ id: "m_a_only", type: "link", title: "Group A's own link", url: "https://example.com/a" }],
    });
    assert.match((await draw(pages.reading, "dev", { runId: RUN.agi })).text, /Week 2: Group A's week 2 Group A's own link Link Week 3/);
  });

  test("My programmes has a card for each run somebody left by themselves that says only that, and leads to that run's page", async () => {
    const cardsOf = async (who) => {
      const drawn = await draw(pages.programmes, who, {});
      assert.equal(drawn.to, null);
      assert.equal(drawn.wrote, false);
      // The card is a div inside its link, never an article: Chromium gives a
      // link wrapped round an article no accessible name, and the browser spec
      // reads the card by its name.
      return {
        cards: [...drawn.html.matchAll(/<a href="([^"]+)" class="leftLink"><div class="[^"]*\bleftCard\b[^"]*"><h3 class="leftTitle">([^<]*)<\/h3><\/div><\/a>/g)].map(
          (match) => [match[1], match[2]],
        ),
        text: drawn.text,
      };
    };
    // A card is drawn exactly where the run's own page says somebody left.
    // Sam's row is the older kind, whose stamp leaving cleared: the run's
    // page does not open to Sam, and My programmes draws Sam no card either.
    assert.equal((await home("sam")).to, "/learn");
    assert.deepEqual((await cardsOf("sam")).cards, []);
    // Before Amara leaves there is none; after, the card says only that Amara left.
    assert.deepEqual((await cardsOf("amara")).cards, []);
    await leave("amara");
    const amara = await cardsOf("amara");
    assert.deepEqual(amara.cards, [[HOME, "You left AGI Strategy"]]);
    // The list of runs leaves the run out, and Amara is not told of being on no
    // course: Amara was on one, and the card says what became of it.
    assert.ok(amara.text.endsWith("You left AGI Strategy"), amara.text);
    assert.ok(!amara.text.includes("not on a course yet"), amara.text);
    for (const words of ["Group A", "Present", "Clearer than I expected.", AMARA_SAID]) {
      assert.ok(!amara.text.includes(words), `My programmes shows Amara “${words}”`);
    }
    // An account that no longer stands is shown neither: Amara's seat is still
    // shown by Publish's stamp, so only the gate's own question can
    // tell, and the run's page and the list answer it the same way.
    world.db.poke("users/amara", { role: "pending" });
    assert.equal((await home("amara")).to, "/learn");
    assert.deepEqual((await cardsOf("amara")).cards, [], "an account that no longer stands is drawn a card");
    world.db.poke("users/amara", { role: "member" });
    assert.deepEqual((await cardsOf("amara")).cards, [[HOME, "You left AGI Strategy"]]);
    // In a view-as session the list makes no claim and reads nothing, as it
    // makes none about a place (tests/applications-view-as-own-application):
    // an admin viewing the site as Amara is drawn no card.
    world.viewAs = true;
    try {
      assert.deepEqual((await cardsOf("amara")).cards, []);
    } finally {
      world.viewAs = false;
    }
    // An open run's seat left by its holder is a card too, named by its course.
    assert.equal((await leave("kai", { confirmName: "Pre-course" }, OPEN_RUN)).status, 200);
    assert.deepEqual((await cardsOf("kai")).cards, [[`/learn/${OPEN_RUN}`, "You left Pre-course"]]);
    // Nobody else has one: somebody taking part, somebody staff removed (the
    // run closes to them), somebody placed and not told, staff, an admin.
    const removed = await call("claudia", routes.remove.POST, { runId: RUN.agi, uid: "tariq" }, { course: true });
    assert.equal(removed.status, 200);
    for (const who of ["dev", "tariq", "una", "sofia", "claudia", "zach"]) {
      assert.deepEqual((await cardsOf(who)).cards, [], `${who} is shown a run they did not leave`);
    }
    // Signed out, the page reads no runs at all.
    assert.deepEqual((await cardsOf(null)).cards, []);
  });

  test("the group keeps the notes Amara shared: its people, its facilitator, the lead and an admin read them, and Amara does not", async () => {
    const SHARED = "Section 3 answers the question the first two raise.";
    world.db.seed("courseGroupSharedNotes/note-amara", {
      runId: RUN.agi,
      groupId: A,
      weekNumber: 1,
      authorUid: "amara",
      body: SHARED,
      createdAt: new Date("2026-11-02T10:00:00Z"),
    });
    await leave("amara");
    const run = runs.normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
    const groups = [A, B, C, D].map((id) => groupDocs.normalizeCourseGroup(id, read(`courseGroups/${id}`)));
    const groupA = (sections) =>
      (sections ?? []).filter((section) => section.groupId === A).flatMap((section) => section.notes.map((note) => [note.writerName, note.body]));
    const amaras = [["Amara Okafor", SHARED]];
    // A week's page, as its readers read it: somebody still in Group A, and
    // the group's facilitator.
    for (const who of ["dev", "sofia"]) {
      const page = await sharedNotes.sharedNotesForWeekPage(world.courseDb, w.sessionOf(who), run, groups, "Claudia");
      assert.deepEqual(groupA(page?.sections), amaras, `${who} no longer reads what Amara shared`);
    }
    // The programme's Attendance tab: its lead and an admin.
    for (const who of ["claudia", "zach"]) {
      const sections = await sharedNotes.sharedNotesForAttendance(world.courseDb, w.sessionOf(who), run, groups, "Claudia");
      assert.deepEqual(groupA(sections), amaras, `${who} no longer reads what Amara shared`);
    }
    // Amara reads none of the group's notes now, Amara's own among them.
    const nowLeft = await sharedNotes.sharedNotesForWeekPage(world.courseDb, w.sessionOf("amara"), run, groups, "Claudia");
    assert.deepEqual(groupA(nowLeft?.sections), [], "somebody who left still reads the group's notes");
    // And leaving deleted nothing of it.
    assert.deepEqual(read("courseGroupSharedNotes/note-amara"), {
      runId: RUN.agi,
      groupId: A,
      weekNumber: 1,
      authorUid: "amara",
      body: SHARED,
      createdAt: new Date("2026-11-02T10:00:00Z"),
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Everybody else
// ---------------------------------------------------------------------------

describe("5. what everybody else sees of somebody who left", () => {
  test("another member of her group: she is gone from the group's names", async () => {
    await leave("amara");
    const roster = await call("dev", routes.roster.GET, { groupId: A }, { course: true });
    assert.equal(roster.status, 200);
    assert.deepEqual(roster.body.members.map((member) => member.uid), ["bea", "dev", "tariq"]);
  });

  test("her facilitators' register lists her read only, with the marks she had and the day she left", async () => {
    await leave("amara");
    const answer = await register("sofia");
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.members.map((member) => member.uid), ["bea", "dev", "tariq"]);
    assert.deepEqual(answer.body.leavers, [
      { uid: "amara", displayName: "Amara Okafor", left: "Left Tue 17 Nov", records: { w01: "present", w02: "present", w03: "present" } },
      { uid: "sam", displayName: "Sam Whitfield", left: "Left Fri 6 Nov", records: { w01: "present", w02: "absent" } },
    ]);
    // Her marks are not in the register's own, so nothing counts her or chases her.
    for (const marks of Object.values(answer.body.records)) assert.ok(!("amara" in marks) && !("sam" in marks));

    const drawn = drawGrid(answer.body);
    assert.match(drawn.text, /Tariq Mensah ✓ \+ ✕ \+ ✕ \+ Amara Okafor Left Tue 17 Nov ✓ ✓ ✓ Sam Whitfield Left Fri 6 Nov ✓ ✕ Week 3 register/);
    assert.match(drawn.text, /2 people who left the group are listed last, read only, with the marks they had\./);
    // Read only: her cells are pictures with words, never buttons.
    assert.match(drawn.html, /<span class="cellButton cellLocked isPresent" role="img" aria-label="Amara Okafor, week 1: Present\. Left Tue 17 Nov\.">✓<\/span>/);
    assert.match(drawn.html, /<span class="leftBlank" role="img" aria-label="Sam Whitfield, week 3: no mark\. Left Fri 6 Nov\."><\/span>/);
    assert.ok(!/<button[^>]*aria-label="(?:Amara Okafor|Sam Whitfield), week/.test(drawn.html));
    // The column tallies count the three still in the group.
    assert.match(drawn.text, /Week 1 Thu 29 Oct Week 1 readings 3\/3/);
  });

  test("a mark for somebody who left is refused", async () => {
    // Group D's week 3 register is saved and not finished.
    await leave("freya", { confirmName: TITLE });
    const before = snapshot();
    const answer = await call(
      "grace",
      routes.register.POST,
      { groupId: D },
      { body: { sessionKey: "w03", marks: [{ uid: "freya", status: "present" }] }, course: true },
    );
    assert.equal(answer.status, 400, JSON.stringify(answer.body));
    assert.deepEqual(changedSince(before), []);
    // She is listed, read only, with the marks she had.
    assert.deepEqual((await register("grace", D)).body.leavers, [
      { uid: "freya", displayName: "Freya Thompson", left: "Left Tue 17 Nov", records: { w01: "present", w02: "absent", w03: "absent" } },
    ]);
  });

  test("the lead's grid and Overview: the day she left, and what she said", async () => {
    await leave("amara");
    const model = await grid();
    const a = model.groups.find((group) => group.id === A);
    const amara = a.people.find((person) => person.uid === "amara");
    assert.deepEqual(
      [amara.name, amara.left, amara.cells.map((cell) => cell.mark ?? cell.state), amara.came, amara.of],
      ["Amara Okafor", "Left Tue 17 Nov", ["present", "present", "present", "after", "after", "after"], 3, 3],
    );
    const overview = await overviewLeft();
    assert.deepEqual(overview.items, [
      ["Amara Okafor left on Tue 17 Nov", `Amara said: “${AMARA_SAID}” Amara’s off Group A’s register from week 4.`],
      ["Sam Whitfield left on Fri 6 Nov", "Sam said: “Too much on this term.” Sam’s off Group A’s register from week 3."],
      ["Omar Haddad left", "Omar’s off Group B’s register."],
    ]);
    assert.deepEqual(overview.people, { takingPart: 9, left: 3, line: "3 left. Places can’t be offered after week 1." });
  });

  test("the register and the grid agree about who left each group and when, for the lead, an admin and each facilitator", async () => {
    await leave("amara");
    await leave("freya", { confirmName: TITLE });
    const facilitatorOf = { [A]: "sofia", [B]: "rahul", [C]: "tom", [D]: "grace" };
    for (const viewer of [{ isAdmin: false }, { isAdmin: true }]) {
      const fromGrid = await gridLeavers(viewer);
      for (const groupId of [A, B, C, D]) {
        for (const who of [facilitatorOf[groupId], viewer.isAdmin ? "zach" : "claudia"]) {
          const answer = await register(who, groupId);
          assert.equal(answer.status, 200, `${who} on ${groupId}`);
          assert.deepEqual(
            answer.body.leavers.map((leaver) => [leaver.uid, leaver.left]),
            fromGrid[groupId],
            `${who}'s register of ${groupId} against the grid`,
          );
        }
      }
    }
    assert.deepEqual(await gridLeavers({ isAdmin: false }), {
      [A]: [["amara", "Left Tue 17 Nov"], ["sam", "Left Fri 6 Nov"]],
      [B]: [["omar", "Left"]],
      [C]: [],
      [D]: [["freya", "Left Tue 17 Nov"]],
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Remove records the day
// ---------------------------------------------------------------------------

describe("6. Remove records the day somebody was taken off", () => {
  const remove = (who, uid) => call(who, routes.remove.POST, { runId: RUN.agi, uid }, { course: true });

  test("the lead removes Tariq: the day is on his row, and the grid, the Overview and the register all say it", async () => {
    assert.equal((await remove("claudia", "tariq")).status, 200);
    const row = read(enrolmentPath("tariq"));
    assert.deepEqual([row.status, row.groupId, at(row.droppedOutAt), row.allocatedEmailAt], ["removed", null, NOW.toISOString(), undefined]);
    assert.deepEqual((await gridLeavers())[A], [["sam", "Left Fri 6 Nov"], ["tariq", "Left Tue 17 Nov"]]);
    assert.deepEqual((await overviewLeft()).items[0], ["Tariq Mensah left on Tue 17 Nov", "Tariq’s off Group A’s register from week 4."]);
    assert.deepEqual(
      (await register("sofia")).body.leavers.map((leaver) => [leaver.uid, leaver.left]),
      [["sam", "Left Fri 6 Nov"], ["tariq", "Left Tue 17 Nov"]],
    );
  });

  // CHANGED ON PURPOSE (the board's Remove, October 2026): somebody who left
  // by themselves is not removed. Until then Remove turned their seat into a
  // removal that kept the day they left, which closed the run to them and
  // took back the page that says they left. The route now refuses it in a
  // sentence that says they left and when, for an admin and for the lead,
  // and writes nothing: the day, the status and the grid's line stay as they
  // were. Held for both doors in tests/course-publish-place-given-back.test.mjs.
  test("somebody who left is not removed: the route says when they left, writes nothing, and the day stays", async () => {
    for (const who of ["zach", "claudia"]) {
      const before = snapshot();
      const refused = await remove(who, "sam");
      assert.deepEqual(
        [refused.status, refused.body.error],
        [409, "They left on Fri 6 Nov, so their seat is already free and there’s nothing to remove."],
        who,
      );
      assert.deepEqual(changedSince(before), [], who);
    }
    const row = read(enrolmentPath("sam"));
    assert.deepEqual([row.status, at(row.droppedOutAt)], ["withdrawn", SAM_LEFT.toISOString()]);
    assert.deepEqual((await gridLeavers())[A], [["sam", "Left Fri 6 Nov"]]);
  });

  test("somebody staff took off an open run is not shown the page that says they left", async () => {
    const removed = await call("zach", routes.remove.POST, { runId: OPEN_RUN, uid: "kai" }, { course: true });
    assert.equal(removed.status, 200);
    assert.equal((await home("kai", OPEN_RUN)).to, "/learn");
  });

  test("somebody removed is not shown the page that says they left, at any of its addresses", async () => {
    assert.equal((await remove("claudia", "tariq")).status, 200);
    assert.equal((await home("tariq")).to, "/learn");
    for (const Page of [pages.notes, pages.reading, pages.leave]) {
      assert.equal((await draw(Page, "tariq", { runId: RUN.agi })).to, HOME);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Putting somebody back
// ---------------------------------------------------------------------------

describe("7. putting somebody who left back", () => {
  test("an admin places her again: the day, the reason and Publish's stamp go, so she waits for Publish", async () => {
    await leave("amara");
    const placed = await call("zach", routes.allocate.POST, { runId: RUN.agi }, { body: { placements: [{ uid: "amara", groupId: A }] }, course: true });
    assert.equal(placed.status, 200, JSON.stringify(placed.body));
    const row = read(enrolmentPath("amara"));
    assert.deepEqual(
      [row.status, row.groupId, row.droppedOutAt, row.dropOutReason, row.allocatedEmailAt],
      ["active", A, null, null, undefined],
    );
    // Untold again: the run reads to her as it did before Publish told her.
    assert.equal((await home("amara")).to, "/learn");
    // Publish tells her, and the run is hers again.
    assert.equal((await w.join.publish("zach")).status, 200);
    assert.equal(at(read(enrolmentPath("amara")).allocatedEmailAt), NOW.toISOString());
    assert.equal((await home("amara")).to, null);
    assert.equal(ui.runHome.canLeave, true);
  });
});

// ---------------------------------------------------------------------------
// 8. Once the run's last session is over
// ---------------------------------------------------------------------------

describe("8. once the run's last session is over, nobody leaves", () => {
  /** When a run's last session ends, as who finished reads it. */
  const endOf = async (runId) => runEnd.readRunEndById(world.courseDb, runId, new Date());
  const ENDED = (name) => `${name} has ended, so there’s nothing to leave. If you need something changed, email ai-safety@uonsu.com.`;

  test("the line is the run's last session: a minute before it ends the way out is there, and from its end it is not", async () => {
    const end = await endOf(RUN.agi);
    assert.equal(end.lastDay, "Wed 9 Dec");
    mock.timers.setTime(end.endsAt.getTime() - 60_000);
    assert.equal((await home("amara")).to ?? ui.runHome?.canLeave, true);
    assert.equal((await confirmation("amara")).to, null);
    mock.timers.setTime(end.endsAt.getTime());
    assert.equal((await home("amara")).to ?? ui.runHome?.canLeave, false);
    assert.equal((await confirmation("amara")).to, HOME);
  });

  test("after it no page draws the way out, for a placed seat or an open run's, and the confirmation sends them home", async () => {
    const asked = {};
    for (const [who, runId] of [
      ["amara", RUN.agi],
      ["dev", RUN.agi],
      ["kai", OPEN_RUN],
    ]) {
      mock.timers.setTime((await endOf(runId)).endsAt.getTime() + 24 * 3600_000);
      const drawn = await home(who, runId);
      asked[who] = [drawn.to ?? ui.runHome?.canLeave, (await confirmation(who, runId)).to];
      assert.equal(drawn.wrote, false, `${who}: a page wrote`);
    }
    assert.deepEqual(asked, {
      amara: [false, HOME],
      dev: [false, HOME],
      kai: [false, `/learn/${OPEN_RUN}`],
    });
  });

  test("the press is refused with a sentence, and nothing is written or sent: no seat, no place on the form, no email", async () => {
    for (const [who, runId, title, name] of [
      ["amara", RUN.agi, TITLE, TITLE],
      ["kai", OPEN_RUN, "Pre-course", "Pre-course"],
    ]) {
      mock.timers.setTime((await endOf(runId)).endsAt.getTime());
      const before = snapshot();
      const answer = await leave(who, { confirmName: title, reason: AMARA_SAID }, runId);
      assert.deepEqual([answer.status, answer.body], [409, { error: ENDED(name) }], who);
      assert.deepEqual(changedSince(before), [], who);
    }
    assert.equal(world.mail.length, 0);
    // The place on the form is still held, and the seat still taken.
    assert.deepEqual([read(applicationPath("amara")).status, read(enrolmentPath("amara")).status], ["accepted", "active"]);
    assert.equal(read(enrolmentPath("kai", OPEN_RUN)).status, "active");
  });

  test("somebody who left before the end is answered the same after it, and nothing changes", async () => {
    assert.equal((await leave("amara")).status, 200);
    const mailed = world.mail.length;
    mock.timers.setTime((await endOf(RUN.agi)).endsAt.getTime() + 24 * 3600_000);
    const before = snapshot();
    const answer = await leave("amara");
    assert.deepEqual([answer.status, answer.body], [409, { error: ENDED(TITLE) }]);
    assert.deepEqual(changedSince(before), []);
    assert.equal(world.mail.length, mailed);
  });
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

describe("the words", () => {
  // CHANGED ON PURPOSE (somebody who leaves keeps nothing): this test held the
  // words of the reading list's link on the page that says somebody left.
  // That link is gone, and so are the other words of what stayed theirs, so
  // it now holds that none of them is among the words of leaving, where a
  // page could pick one up again, and what the confirmation says instead.
  test("the words of what stayed theirs are gone, and the confirmation says what stays and with whom", () => {
    for (const name of [
      "WHAT_STAYS",
      "NOTES_LINK",
      "readingListLink",
      "YOUR_MARKS",
      "markRowLabel",
      "NOT_MARKED",
      "DID_NOT_HAPPEN",
      "STILL_AROUND",
      "EVENTS_OPEN",
    ]) {
      assert.ok(!(name in lib.words), `${name} is back among the words of leaving`);
    }
    const all = JSON.stringify(Object.values(lib.words).map((value) => (typeof value === "function" ? value.toString() : value)));
    for (const words of ["What stays here", "The reading list for", "Still around", "Events are open", "you keep your notes"]) {
      assert.ok(!all.includes(words), `the words of leaving say “${words}” again`);
    }
    assert.deepEqual(lib.words.leaveLines("Group A", true), [
      "You’ll leave Group A straight away and give your place back.",
      "Your marks so far stay on your group’s register, and the notes you shared stay with the group. " +
        "After you leave, your programme’s page shows only that you left. The weekly emails stop.",
      "You can’t undo this yourself. If you change your mind, email ai-safety@uonsu.com and we’ll see what we can do.",
    ]);
    // A run whose groups share no notes names none.
    assert.equal(
      lib.words.leaveLines(null, false)[1],
      "Your marks so far stay on your group’s register. After you leave, your programme’s page shows only that you left. The weekly emails stop.",
    );
  });

  test("never a dash, and never the words the boards forbid for somebody who left", () => {
    const all = JSON.stringify(Object.values(lib.words).map((value) => (typeof value === "function" ? value.toString() : value)));
    // Built from their codes, so this file carries neither character.
    const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
    assert.ok(!dashes.test(all));
    assert.ok(!all.toLowerCase().includes(["dropped", "out"].join(" ")));
  });
});
