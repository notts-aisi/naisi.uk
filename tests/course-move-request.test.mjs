/**
 * A MEMBER ASKS TO CHANGE GROUP FOR THE REST OF THE PROGRAMME, AND AN ADMIN
 * DECIDES IT: the ask from the person's own form, the programme page's card
 * while it waits and after, withdraw, approve (which makes the move through
 * the staff move's own writer, in the same transaction), decline, a reply
 * without deciding, Take it, Dismiss, a request a staff move makes moot, one
 * request at a time across kinds, the Requests page's row and one request's
 * page, and the emails each press sends.
 *
 *   POST /api/courses/runs/[runId]/requests/move                  the person
 *   POST /api/courses/requests/[requestId]/move/approve           admins
 *   POST /api/courses/requests/[requestId]/move/decline           admins
 *   POST /api/courses/requests/[requestId]/move/reply             admins
 *   POST /api/courses/requests/[requestId]/move/take              admins
 *   POST /api/courses/requests/[requestId]/move/withdraw          the person
 *   POST /api/courses/requests/[requestId]/move/dismiss           the person
 *   /learn/[runId]/change-group                                   the person's form
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Chloe is in Group B (Tuesdays at
 * 6pm, Rahul and Sofia), whose week 3 session is tonight. Group C meets on
 * Wednesdays at 1pm (Tom), so a move there is from week 3. Group A meets on
 * Thursdays; Group D met yesterday for week 3. Zach is an admin; Claudia
 * leads the programme; Farah is another member of Group B.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { week } from "./lib/handoverWorld.mjs";
import { A, B, C, D, NOW, ROUND, AGI, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__moveRequest");
const { world, call } = w;
const askRoute = await w.courseRoute("runs", "[runId]", "requests", "move");
const visitAskRoute = await w.courseRoute("runs", "[runId]", "requests", "visit");
const decide = {};
for (const action of ["approve", "decline", "reply", "take", "withdraw", "dismiss"]) {
  decide[action] = await w.courseRoute("requests", "[requestId]", "move", action);
}
const moveRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "move");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { changeGroupFor, changeGroupPageFor } = await w.loadTs(join("lib", "courses", "moveRequest", "own.ts"));
const { anotherSessionFor } = await w.loadTs(join("lib", "courses", "visitRequest", "own.ts"));
const { loadMoveRequestPage } = await w.loadTs(join("lib", "courses", "moveRequest", "page.ts"));
const { loadRequestsPage } = await w.loadTs(join("lib", "courses", "requests", "load.ts"));
const { requestsWaitingFor, requestsWaitingOnRun } = await w.loadTs(join("lib", "courses", "requests", "home.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const changeGroupPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "change-group", "page.tsx"))).default;
const anotherPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "another-session", "page.tsx"))).default;

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const mailTo = (uid) => world.mail.filter((message) => message.to.startsWith(`${uid}@`));
const subjectsTo = (uid) => mailTo(uid).map((message) => message.subject);
const requestDocs = () => world.db.paths().filter((path) => path.startsWith("courseRequests/")).map((path) => ({ path, ...read(path) }));
const moveRequests = () => requestDocs().filter((doc) => doc.kind === "move");
const movedRows = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map(read)
    .filter((row) => row.kind === "member-moved");

const ask = (who, body) => call(who, askRoute.POST, { runId: RUN.agi }, { body, course: true });
const press = (who, action, requestId, body) => call(who, decide[action].POST, { requestId }, { body, course: true });

const WHY = "My Thursday lab runs all term.";

function runAndGroups() {
  const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
  const groups = world.db
    .paths()
    .filter((path) => path.startsWith("courseGroups/"))
    .map((path) => normalizeCourseGroup(path.slice("courseGroups/".length), read(path)))
    .filter((group) => group.runId === RUN.agi);
  return { run, groups };
}

async function viewOf(uid) {
  const { run } = runAndGroups();
  return changeGroupFor(world.courseDb, { user: w.sessionOf(uid), run, enrolment: seat(uid), now: new Date() });
}

async function visitViewOf(uid) {
  const { run, groups } = runAndGroups();
  return anotherSessionFor(world.courseDb, { user: w.sessionOf(uid), run, enrolment: seat(uid), groups, now: new Date() });
}

/** Chloe asks to move to Group C, and the request's id. */
async function chloeAsks(reason = WHY) {
  const answer = await ask("chloe", { toGroupId: C, reason });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await w.settle();
  return answer.body.request.id;
}

/** Group C full, by the staff move's own count. */
function fillGroup(groupId) {
  world.db.poke(`courseGroups/${groupId}`, { capacity: read(`courseGroups/${groupId}`).memberCount });
}

async function approvingOf(id) {
  const page = await loadMoveRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
  assert.equal(page.status, "ok");
  assert.ok(page.view.approving?.ok, JSON.stringify(page.view.approving));
  return page.view.approving.preview;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

describe("1. Asking", () => {
  test("the programme page's card offers it, and the form lists the groups with a place in the approved words", async () => {
    const view = await viewOf("chloe");
    assert.equal(view.offer, true);
    assert.equal(view.waiting, null);
    const page = await w.draw(changeGroupPage, "chloe", { runId: RUN.agi });
    assert.equal(page.to, null);
    assert.match(page.text, /Change group for good/);
    assert.match(page.text, /From the next week whose session hasn’t happened\. An admin decides\. Your work, its feedback and your attendance come with you\./);
    assert.match(page.text, /Groups with a place/);
    assert.match(page.text, /Group C · Wednesdays, 1pm to 3pm/);
    assert.match(page.text, /Tom/);
    assert.match(page.text, /Why \(needed\)/);
    assert.match(page.text, /Send the request/);
    assert.doesNotMatch(page.text, /Group B ·/, "never their own group");
    assert.equal(page.wrote, false);
  });

  test("under each group, why it is offered, from the times she gave on the form, the one-week form's own reader; nothing in a view-as session", async () => {
    // Chloe's application on the form, sent with Wednesday afternoons painted.
    const amara = world.db.paths().find((path) => path.startsWith("admissionApplications/") && path.endsWith("__amara"));
    const doc = read(amara);
    const content = { ...doc.sent, availability: week({ 3: [["12:00", "17:00"]] }) };
    world.db.seed(amara.replace(/__amara$/, "__chloe"), { ...doc, uid: "chloe", email: "chloe@example.com", displayName: "Chloe Nguyen", draft: content, sent: content });
    const { run } = runAndGroups();
    const pageOf = (viewingAs) => changeGroupPageFor(world.courseDb, { user: w.sessionOf("chloe"), run, enrolment: seat("chloe"), now: new Date(), viewingAs });
    const whyOf = (view, groupId) => view.form.choices.find((choice) => choice.groupId === groupId)?.why ?? null;
    const view = await pageOf(false);
    assert.equal(whyOf(view, C), "Why: you said you’re free Wednesday afternoons");
    assert.equal(whyOf(view, A), "Why: not a time you gave, but there’s room");
    const page = await w.draw(changeGroupPage, "chloe", { runId: RUN.agi });
    assert.match(page.text, /Why: you said you’re free Wednesday afternoons/);
    assert.doesNotMatch(page.text, /availability/);
    const viewingAs = await pageOf(true);
    assert.ok(viewingAs.form.choices.every((choice) => choice.why === null), "her application is not read in a view-as session");
  });

  test("the one-week form's foot says it can be asked for good instead", async () => {
    const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    // The link is its own element: the drawn text puts a space before the full stop.
    assert.match(page.text, /Need a different group every week\? Change group for good ?\./);
  });

  test("an admin with no place is sent back to the run's home", async () => {
    const page = await w.draw(changeGroupPage, "zach", { runId: RUN.agi });
    assert.equal(page.to, `/learn/${RUN.agi}`);
  });

  test("asking writes one request of the move kind and emails the admins in the approved words, never the person's own words", async () => {
    world.mail.length = 0;
    const id = await chloeAsks();
    const doc = read(`courseRequests/${id}`);
    assert.equal(doc.kind, "move");
    assert.equal(doc.runId, RUN.agi);
    assert.equal(doc.groupId, B);
    assert.equal(doc.sessionKey, "");
    assert.equal(doc.subjectUid, "chloe");
    assert.equal(doc.askedByUid, "chloe");
    assert.equal(doc.status, "waiting");
    assert.equal(doc.change.toGroupId, C);
    assert.equal(doc.change.fromWeek, null);
    assert.equal(doc.change.recordAsked, "");
    assert.equal(doc.reason, WHY);
    assert.equal(doc.adminsToldOn, "2026-11-17");
    // Nothing on her place or a group.
    assert.equal(seat("chloe").groupId, B);
    const toZach = mailTo("zach");
    assert.equal(toZach.length, 1);
    assert.equal(toZach[0].subject, "Chloe Nguyen asked to change group");
    const text = JSON.stringify(toZach[0]);
    assert.match(text, /Chloe Nguyen asked on Tue 17 Nov at 12pm to move from Group B to Group C for the rest of the programme\./);
    assert.match(text, /You get this because you decide requests\. You can switch it off on the Requests page\./);
    assert.doesNotMatch(text, /Thursday lab/);
    assert.equal(subjectsTo("chloe").length, 0);
    assert.equal(subjectsTo("tom").length, 0);
    assert.equal(subjectsTo("claudia").length, 0, "a programme's lead is told nothing");
  });

  test("an admin who switched the email off is not sent it", async () => {
    world.db.poke("users/zach", { requestEmails: { excused: false } });
    world.mail.length = 0;
    await chloeAsks();
    assert.equal(mailTo("zach").length, 0);
  });

  test("refusals, one sentence each and nothing written: no group, no reason, their own group, a group of no run, somebody who can ask nothing, a link, signed out", async () => {
    assert.equal((await ask("chloe", { reason: WHY })).body.error, "Choose a group first.");
    assert.equal((await ask("chloe", { toGroupId: C })).body.error, "Say why first: a line is enough.");
    assert.equal((await ask("chloe", { toGroupId: C, reason: "   " })).body.error, "Say why first: a line is enough.");
    assert.equal((await ask("chloe", { toGroupId: B, reason: WHY })).body.error, "That group can’t be chosen now. Choose another.");
    assert.equal((await ask("chloe", { toGroupId: "nope", reason: WHY })).body.error, "That group can’t be chosen now. Choose another.");
    const tom = await ask("tom", { toGroupId: B, reason: WHY });
    assert.equal(tom.status, 404);
    assert.equal(tom.body.error, "There’s no other group you can ask to move to now.");
    assert.equal((await ask("zach", { toGroupId: B, reason: WHY })).status, 404);
    assert.equal((await ask("una", { toGroupId: B, reason: WHY })).status, 404, "a seat Publish has not told");
    assert.equal((await ask("chloe", { toGroupId: C, reason: "see https://example.com" })).status, 400);
    assert.equal((await call(null, askRoute.POST, { runId: RUN.agi }, { body: { toGroupId: C, reason: WHY }, course: true })).status, 401);
    assert.equal(moveRequests().length, 0);
  });

  test("a full group is not offered, and an ask for it is refused; with every one full the form says so", async () => {
    fillGroup(C);
    let page = await w.draw(changeGroupPage, "chloe", { runId: RUN.agi });
    assert.doesNotMatch(page.text, /Group C ·/);
    const filled = await ask("chloe", { toGroupId: C, reason: WHY });
    assert.equal(filled.status, 409);
    assert.equal(filled.body.error, "That group has just filled up. Choose another.");
    const { groups } = runAndGroups();
    for (const group of groups) if (group.id !== B && !group.archived) fillGroup(group.id);
    page = await w.draw(changeGroupPage, "chloe", { runId: RUN.agi });
    assert.match(page.text, /No other group has a place right now\./);
    const none = await ask("chloe", { toGroupId: C, reason: WHY });
    assert.equal(none.body.error, "No other group has a place right now.");
    assert.equal(moveRequests().length, 0);
  });

  test("the daily cap: the first three asks of one London day email the admins, the fourth emails nobody and still waits", async () => {
    world.mail.length = 0;
    for (let n = 1; n <= 4; n += 1) {
      const id = await chloeAsks(`Ask ${n}.`);
      assert.equal(mailTo("zach").length, Math.min(n, 3), `after ask ${n}`);
      if (n < 4) assert.equal((await press("chloe", "withdraw", id)).status, 200);
      else assert.equal(read(`courseRequests/${id}`).status, "waiting");
    }
  });
});

describe("2. One request at a time, across kinds", () => {
  test("a move waiting: a second move and a one-week ask are refused, and neither way in is offered", async () => {
    await chloeAsks();
    const again = await ask("chloe", { toGroupId: A, reason: WHY });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "You already have a request waiting. Withdraw it to send another.");
    const visit = await call("chloe", visitAskRoute.POST, { runId: RUN.agi }, { body: { hostGroupId: C }, course: true });
    assert.equal(visit.status, 409);
    assert.equal(visit.body.error, "You already have a request waiting. Withdraw it to send another.");
    assert.equal(moveRequests().length, 1);
    assert.equal(requestDocs().filter((doc) => doc.kind === "visit").length, 0);
    assert.equal((await viewOf("chloe")).offer, false);
    assert.equal((await visitViewOf("chloe")).offer, null);
  });

  test("a one-week request waiting: a move is refused, and the card offers no button", async () => {
    const visit = await call("chloe", visitAskRoute.POST, { runId: RUN.agi }, { body: { hostGroupId: C }, course: true });
    assert.equal(visit.status, 200, JSON.stringify(visit.body));
    const move = await ask("chloe", { toGroupId: C, reason: WHY });
    assert.equal(move.status, 409);
    assert.equal(move.body.error, "You already have a request waiting. Withdraw it to send another.");
    assert.equal((await viewOf("chloe")).offer, false);
    const page = await w.draw(changeGroupPage, "chloe", { runId: RUN.agi });
    assert.match(page.text, /You already have a request waiting\. Withdraw it to send another\./);
    assert.equal(moveRequests().length, 0);
  });
});

describe("3. Waiting, withdraw and Take it", () => {
  test("the card says it waits in the approved words, and Withdraw the request writes it withdrawn and emails nobody", async () => {
    const id = await chloeAsks();
    const view = await viewOf("chloe");
    assert.equal(view.waiting.requestId, id);
    assert.equal(view.waiting.sent, "Sent today, 12pm");
    assert.equal(view.waiting.line, "You asked to move to Group C for good. An admin decides.");
    assert.equal(view.rows[0].title, "Move to Group C");
    assert.equal(view.rows[0].line, "Sent Tue 17 Nov, 12pm");
    assert.equal(view.rows[0].state, "waiting");
    world.mail.length = 0;
    assert.equal((await press("farah", "withdraw", id)).status, 403);
    const zach = await press("zach", "withdraw", id);
    assert.equal(zach.status, 403);
    assert.equal(zach.body.error, "That request isn’t yours to withdraw.");
    assert.equal((await press(null, "withdraw", id)).status, 401);
    const done = await press("chloe", "withdraw", id);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(read(`courseRequests/${id}`).status, "withdrawn");
    assert.equal(world.mail.length, 0);
    const after = await viewOf("chloe");
    assert.equal(after.waiting, null);
    assert.equal(after.offer, true, "a new one can be asked");
    assert.equal(after.rows[0].line, "Withdrawn by you, 12pm");
    const again = await press("chloe", "withdraw", id);
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "It’s already been withdrawn.");
  });

  test("Take it: an admin's alone, never the asker's or the lead's, and it emails nobody", async () => {
    const id = await chloeAsks();
    world.mail.length = 0;
    assert.equal((await press("chloe", "take", id)).status, 403);
    assert.equal((await press("claudia", "take", id)).status, 403);
    const taken = await press("zach", "take", id);
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
    assert.equal(read(`courseRequests/${id}`).handlingUid, "zach");
    assert.equal(world.mail.length, 0);
    const rows = (await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date())).view.rows.filter((row) => row.kind === "move");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, "handling");
    assert.equal(rows[0].about, "Group B to Group C");
  });
});

describe("4. Approving makes the move through the staff move's own writer, in the same transaction", () => {
  test("the page says what approving does in the staff move's own words; the press writes the move and the decision and sends the staff move's emails", async () => {
    const id = await chloeAsks();
    const page = await loadMoveRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.equal(page.view.state, "waiting");
    assert.equal(page.view.reason, WHY, "the person's words, for the admin on this page");
    assert.match(page.view.asksFor.words, /^Group C · Wednesdays, 1pm to 3pm$/);
    assert.ok(page.view.approving.ok, JSON.stringify(page.view.approving));
    assert.equal(page.view.approving.preview.weekNumber, 3);
    assert.match(page.view.approving.button, /^Approve and email \d people$/);
    assert.equal((await loadMoveRequestPage(world.courseDb, w.sessionOf("claudia"), id, new Date())).status, "none");
    const { emails, weekNumber } = page.view.approving.preview;

    world.mail.length = 0;
    const wrongCount = await press("zach", "approve", id, { weekNumber, emailCount: emails + 1 });
    assert.equal(wrongCount.status, 409);
    assert.equal(wrongCount.body.emails, emails);
    const wrongWeek = await press("zach", "approve", id, { weekNumber: 4, emailCount: emails });
    assert.equal(wrongWeek.status, 409);
    assert.equal(wrongWeek.body.weekNumber, 3);
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal(seat("chloe").groupId, B, "nothing written on a refused press");
    assert.equal(world.mail.length, 0);

    const done = await press("zach", "approve", id, { weekNumber, emailCount: emails, reply: "Welcome to Group C." });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.status, "approved");
    assert.equal(done.body.weekNumber, 3);
    await w.settle();
    const doc = read(`courseRequests/${id}`);
    assert.equal(doc.status, "approved");
    assert.equal(doc.decidedByUid, "zach");
    assert.equal(doc.reply, "Welcome to Group C.");
    assert.equal(doc.change.fromWeek, 3);
    assert.equal(seat("chloe").groupId, C);
    assert.equal(world.mail.length, emails);
    const toChloe = mailTo("chloe");
    assert.equal(toChloe.length, 1);
    assert.equal(toChloe[0].subject, "You’re moving to Group C");
    const text = JSON.stringify(toChloe[0]);
    assert.match(text, /Your request is approved\./);
    assert.match(text, /From week 3 you’re in Group C/);
    assert.match(text, /Zach says: “Welcome to Group C\.”/);
    assert.deepEqual(subjectsTo("tom"), ["Chloe Nguyen joins Group C from week 3"]);
    assert.deepEqual(subjectsTo("rahul"), ["Chloe Nguyen leaves Group B from week 3"]);
    assert.equal(subjectsTo("claudia").length, 0);
    for (const row of movedRows()) assert.doesNotMatch(JSON.stringify(row), /Thursday lab/, "the person's words go into no group's history");

    const view = await viewOf("chloe");
    assert.equal(view.approved.line, "You’re in Group C from week 3. Your work, its feedback and your attendance came with you.");
    assert.equal(view.approved.by, "Approved by Zach, Tue 17 Nov, 12pm: “Welcome to Group C.”");
    assert.equal(view.rows[0].line, "Approved by Zach, Tue 17 Nov, 12pm");
    at("2026-11-18T13:00:00Z");
    assert.equal((await viewOf("chloe")).approved, null, "it goes once their first session with the new group starts");
    at("2026-11-17T12:00:00Z");
    assert.equal(movedRows().length, 2, "one move: a row on each group");
    world.mail.length = 0;
    assert.equal((await press("zach", "approve", id, { weekNumber, emailCount: emails })).body.error, "This request has been decided already.");
    assert.equal(movedRows().length, 2, "a second approval moves nobody again");
    assert.equal(world.mail.length, 0);
  });

  test("the move an approval writes is the staff move's own with no reason, byte for byte: the place and both groups' history rows", async () => {
    const id = await chloeAsks();
    const preview = await approvingOf(id);
    await press("zach", "approve", id, { weekNumber: preview.weekNumber, emailCount: preview.emails });
    const approvedSeat = JSON.stringify(read(seatPath("chloe")));
    const historyOf = () => movedRows().map((row) => JSON.stringify({ ...row, id: undefined })).sort();
    const approvedHistory = historyOf();
    const approvedCounts = [read(`courseGroups/${B}`).memberCount, read(`courseGroups/${C}`).memberCount];

    w.reset();
    const shown = await call("zach", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { toGroupId: C, preview: true }, course: true });
    const saved = await call(
      "zach",
      moveRoute.POST,
      { roundId: ROUND, programmeId: AGI, uid: "chloe" },
      { body: { toGroupId: C, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails }, course: true },
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(JSON.stringify(read(seatPath("chloe"))), approvedSeat);
    assert.deepEqual(historyOf(), approvedHistory);
    assert.deepEqual([read(`courseGroups/${B}`).memberCount, read(`courseGroups/${C}`).memberCount], approvedCounts);
  });

  test("a group that filled since the ask is refused in the staff move's own sentence, with nothing written and nobody emailed", async () => {
    const id = await chloeAsks();
    const preview = await approvingOf(id);
    fillGroup(C);
    const page = await loadMoveRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.equal(page.view.approving.ok, false);
    assert.match(page.view.approving.error, /^Group C is full: \d+ of \d+\. Raise its capacity on the Groups tab first\.$/);
    world.mail.length = 0;
    const refused = await press("zach", "approve", id, { weekNumber: preview.weekNumber, emailCount: preview.emails });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /^Group C is full/);
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal(seat("chloe").groupId, B);
    assert.equal(movedRows().length, 0);
    assert.equal(world.mail.length, 0);
  });

  test("a group whose week the staff move's rule refuses (Group D met for week 3 yesterday): it can be asked, the page says the rule's sentence, and approving is refused with nothing written", async () => {
    const answer = await ask("chloe", { toGroupId: D, reason: WHY });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const id = answer.body.request.id;
    const page = await loadMoveRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.equal(page.view.approving.ok, false);
    assert.match(page.view.approving.error, /^Group D has already met for week 3, so Chloe can’t join it for that week\./);
    const refused = await press("zach", "approve", id, { weekNumber: 3, emailCount: 3 });
    assert.equal(refused.status, 409);
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal(seat("chloe").groupId, B);
  });

  test("a withdraw that lands first leaves the approval nothing to do: no move, no email", async () => {
    const id = await chloeAsks();
    const preview = await approvingOf(id);
    await press("chloe", "withdraw", id);
    world.mail.length = 0;
    const late = await press("zach", "approve", id, { weekNumber: preview.weekNumber, emailCount: preview.emails });
    assert.equal(late.status, 409);
    assert.equal(late.body.error, "This request was withdrawn.");
    assert.equal(seat("chloe").groupId, B);
    assert.equal(world.mail.length, 0);
  });
});

describe("4b. The approved line, and a refusal inside the move's own transaction", () => {
  test("approved, then moved again before the new group's first session: the line about the first move is gone", async () => {
    const id = await chloeAsks();
    const preview = await approvingOf(id);
    assert.equal((await press("zach", "approve", id, { weekNumber: preview.weekNumber, emailCount: preview.emails })).status, 200);
    assert.ok((await viewOf("chloe")).approved, "said while she is in Group C");
    // A staff move to Group A from week 4, before Group C's week 3 session on Wednesday.
    world.db.poke(seatPath("chloe"), { groupId: A, groupsByWeek: [{ groupId: B, fromWeek: 1 }, { groupId: C, fromWeek: 3 }, { groupId: A, fromWeek: 4 }] });
    assert.equal((await viewOf("chloe")).approved, null, "never names a group she is no longer in");
  });

  for (const [what, poke, sentence] of [
    ["withdrawn", { status: "withdrawn", withdrawnAt: new Date("2026-11-17T12:00:00Z") }, "This request was withdrawn."],
    ["decided by another admin", { status: "approved", decidedByUid: "sofia", decidedAt: new Date("2026-11-17T12:00:00Z") }, "This request has been decided already."],
  ]) {
    test(`${what} after the first check and before the move's own transaction: refused inside it, nothing written, nobody emailed`, async () => {
      const id = await chloeAsks();
      const preview = await approvingOf(id);
      const db = world.courseDb;
      const original = db.runTransaction;
      let calls = 0;
      // The first transaction is the request's own check; the request changes before any later one runs.
      db.runTransaction = function (fn, ...rest) {
        calls += 1;
        if (calls === 2) world.db.poke(`courseRequests/${id}`, poke);
        return original.call(this, fn, ...rest);
      };
      world.mail.length = 0;
      let answer;
      try {
        answer = await press("zach", "approve", id, { weekNumber: preview.weekNumber, emailCount: preview.emails });
      } finally {
        db.runTransaction = original;
      }
      assert.ok(calls >= 2, "the move's own transaction ran");
      assert.equal(answer.status, 409, JSON.stringify(answer.body));
      assert.equal(answer.body.error, sentence);
      assert.equal(seat("chloe").groupId, B);
      assert.equal(read(seatPath("chloe")).groupsByWeek, undefined);
      assert.equal(movedRows().length, 0);
      assert.equal(read(`courseRequests/${id}`).change.fromWeek, null);
      assert.equal(world.mail.length, 0);
    });
  }
});

describe("5. Declining, replying and dismissing", () => {
  test("declining needs a reply, moves nobody, emails the person the approved words, and the card says so until dismissed", async () => {
    const id = await chloeAsks();
    assert.equal((await press("zach", "decline", id, {})).status, 400);
    world.mail.length = 0;
    const done = await press("zach", "decline", id, { reply: "Group C is full most weeks." });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(read(`courseRequests/${id}`).status, "declined");
    assert.equal(seat("chloe").groupId, B);
    assert.deepEqual(subjectsTo("chloe"), ["About your request to change group"]);
    const text = JSON.stringify(mailTo("chloe")[0]);
    assert.match(text, /Your request to move to Group C wasn’t approved\./);
    assert.match(text, /Zach says: “Group C is full most weeks\.”/);
    assert.match(text, /You’re still in Group B\./);
    assert.match(text, /Open your programme page/);
    assert.equal(world.mail.length, 1);
    const view = await viewOf("chloe");
    assert.equal(view.declined.line, "Your request to move to Group C wasn’t approved. Zach: “Group C is full most weeks.”");
    assert.equal(view.rows[0].line, "Declined by Zach, Tue 17 Nov, 12pm");
    assert.equal(view.rows[0].state, "declined");
    const late = await press("chloe", "withdraw", id);
    assert.equal(late.status, 409);
    assert.equal(late.body.error, "It’s already been decided, so it can’t be withdrawn now.", "a request an admin decided is not withdrawn");
    assert.equal(read(`courseRequests/${id}`).status, "declined");
    world.mail.length = 0;
    assert.equal((await press("farah", "dismiss", id)).status, 403);
    assert.equal((await press("zach", "dismiss", id)).status, 403);
    assert.equal((await press("chloe", "dismiss", id)).status, 200);
    assert.equal((await viewOf("chloe")).declined, null);
    assert.equal((await press("chloe", "dismiss", id)).body.error, "There’s nothing to dismiss.");
    assert.equal(world.mail.length, 0);
  });

  test("the declined message goes by itself a week after the decision", async () => {
    const id = await chloeAsks();
    await press("zach", "decline", id, { reply: "Not now." });
    at("2026-11-24T11:59:00Z");
    assert.ok((await viewOf("chloe")).declined);
    at("2026-11-24T12:00:00Z");
    assert.equal((await viewOf("chloe")).declined, null);
  });

  test("a reply without deciding keeps it waiting, emails the person, and the card shows it; it can be sent again", async () => {
    const id = await chloeAsks();
    world.mail.length = 0;
    const replied = await press("zach", "reply", id, { reply: "Could Group A work instead?" });
    assert.equal(replied.status, 200, JSON.stringify(replied.body));
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.deepEqual(subjectsTo("chloe"), ["About your request to change group"]);
    const text = JSON.stringify(mailTo("chloe")[0]);
    assert.match(text, /Zach replied to your request to move to Group C\./);
    assert.match(text, /Zach says: “Could Group A work instead\?”/);
    assert.match(text, /It’s still waiting for a decision\./);
    assert.equal((await viewOf("chloe")).waiting.reply, "Zach: “Could Group A work instead?”");
    assert.equal((await press("zach", "reply", id, { reply: "Any news?" })).status, 200);
    assert.equal(read(`courseRequests/${id}`).change.replies.length, 2);
    assert.equal((await press("chloe", "withdraw", id)).status, 200, "a request with a reply can still be withdrawn");
  });
});

describe("6. A staff move makes a waiting request moot, and it closes by the one answer, with no email", () => {
  test("staff move her to Group C, the group she asked for: the move request goes from the card, the list and the counts, its page says why, and nothing is decided or written", async () => {
    const id = await chloeAsks();
    const shown = await call("zach", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { toGroupId: C, preview: true }, course: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    world.mail.length = 0;
    const saved = await call(
      "zach",
      moveRoute.POST,
      { roundId: ROUND, programmeId: AGI, uid: "chloe" },
      { body: { toGroupId: C, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails }, course: true },
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    await w.settle();
    // Only the staff move's own emails: nothing about the request.
    assert.equal(world.mail.length, shown.body.preview.emails);
    assert.ok(world.mail.every((message) => !/request/i.test(message.subject)));
    const view = await viewOf("chloe");
    assert.equal(view.waiting, null);
    assert.equal(view.rows.length, 0);
    assert.equal((await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date())).view.rows.filter((row) => row.kind === "move").length, 0);
    assert.equal((await requestsWaitingFor(world.courseDb, w.sessionOf("zach"), new Date())).moves, 0);
    const page = await loadMoveRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.equal(page.view.state, "gone");
    assert.equal(page.view.closed, "Chloe has been moved since asking, so this request closed by itself. Nobody was emailed.");
    assert.equal(page.view.canDecide, false);
    world.mail.length = 0;
    assert.equal((await press("zach", "decline", id, { reply: "Moved already." })).status, 409);
    assert.equal((await press("chloe", "withdraw", id)).body.error, "That request has closed, so it can’t be withdrawn now.");
    assert.equal(read(`courseRequests/${id}`).status, "waiting", "nothing is written to close it");
    assert.equal(world.mail.length, 0);
  });

  test("a staff move from week 3 takes her one-week request for week 3 with it, by the one-week kind's own answer", async () => {
    const visit = await call("chloe", visitAskRoute.POST, { runId: RUN.agi }, { body: { hostGroupId: C }, course: true });
    assert.equal(visit.status, 200, JSON.stringify(visit.body));
    const shown = await call("zach", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { toGroupId: C, preview: true }, course: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    const saved = await call(
      "zach",
      moveRoute.POST,
      { roundId: ROUND, programmeId: AGI, uid: "chloe" },
      { body: { toGroupId: C, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails }, course: true },
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = await visitViewOf("chloe");
    assert.equal(after.waiting, null);
    assert.equal(read(`courseRequests/${visit.body.request.id}`).status, "waiting", "nothing written");
    assert.equal((await viewOf("chloe")).offer, true, "nothing of hers waits now");
  });
});

describe("7. Who each press refuses, and who sees what", () => {
  test("approve, decline, reply and take: the asker, a programme's lead, another member and somebody signed out are refused, and nothing is written", async () => {
    const id = await chloeAsks();
    const preview = await approvingOf(id);
    world.mail.length = 0;
    for (const who of ["chloe", "claudia", "farah", null]) {
      const expected = who === null ? 401 : 403;
      assert.equal((await press(who, "approve", id, { weekNumber: preview.weekNumber, emailCount: preview.emails })).status, expected, `approve as ${who}`);
      assert.equal((await press(who, "decline", id, { reply: "No." })).status, expected, `decline as ${who}`);
      assert.equal((await press(who, "reply", id, { reply: "Hello." })).status, expected, `reply as ${who}`);
      assert.equal((await press(who, "take", id)).status, expected, `take as ${who}`);
    }
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal(read(`courseRequests/${id}`).handlingUid ?? null, null);
    assert.equal(seat("chloe").groupId, B);
    assert.equal(world.mail.length, 0);
  });

  test("an admin is told a missing request is missing; anybody else one 403", async () => {
    assert.equal((await press("zach", "approve", "nothing-here", { weekNumber: 3, emailCount: 1 })).status, 404);
    assert.equal((await press("claudia", "approve", "nothing-here", { weekNumber: 3, emailCount: 1 })).status, 403);
    assert.equal((await press("chloe", "withdraw", "nothing-here")).status, 403);
  });

  test("the Requests page and Home: one row in Moves and visits and one count for an admin, nothing for the programme's lead, never the person's words", async () => {
    const id = await chloeAsks();
    const loaded = await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date());
    const rows = loaded.view.rows.filter((row) => row.kind === "move");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].about, "Group B to Group C");
    assert.doesNotMatch(JSON.stringify(rows), /Thursday lab/);
    const home = await requestsWaitingFor(world.courseDb, w.sessionOf("zach"), new Date());
    assert.equal(home.moves, 1);
    const lead = await loadRequestsPage(world.courseDb, w.sessionOf("claudia"), new Date());
    if (lead.status === "ok") assert.equal(lead.view.rows.filter((row) => row.kind === "move").length, 0);
  });
});

describe("8. One answer to whether a request to change group still waits, for every reader", () => {
  /** What every reader says of Chloe's request now. */
  async function everyReader(id) {
    const zach = w.sessionOf("zach");
    const view = await viewOf("chloe");
    const rows = (await loadRequestsPage(world.courseDb, zach, new Date())).view.rows.filter((row) => row.kind === "move");
    const home = await requestsWaitingFor(world.courseDb, zach, new Date());
    const head = await requestsWaitingOnRun(world.courseDb, zach, RUN.agi, { excused: true });
    const page = await loadMoveRequestPage(world.courseDb, zach, id, new Date());
    return {
      card: view?.waiting?.requestId === id,
      ownRow: (view?.rows ?? []).some((row) => row.id === id),
      list: rows.some((row) => row.id === id),
      home: home.moves,
      head,
      page: page.view.state,
      closed: page.view.closed,
    };
  }

  test("while nothing has changed, every reader says it waits", async () => {
    const id = await chloeAsks();
    assert.deepEqual(await everyReader(id), { card: true, ownRow: true, list: true, home: 1, head: 1, page: "waiting", closed: null });
  });

  const STATES = [
    ["the group she asked for no longer meets", () => world.db.poke(`courseGroups/${C}`, { archived: true }), "Group C no longer meets, so this request closed by itself. Nobody was emailed."],
    ["the group she asked from no longer meets", () => world.db.poke(`courseGroups/${B}`, { archived: true }), "Group B no longer meets, so this request closed by itself. Nobody was emailed."],
    [
      "she now facilitates a group of the run",
      () => world.db.poke(`courseGroups/${A}`, { facilitatorUids: [...read(`courseGroups/${A}`).facilitatorUids, "chloe"] }),
      "Chloe no longer holds a place that can be moved, so this request closed by itself. Nobody was emailed.",
    ],
    ["her seat reads as one Publish has not told", () => world.db.poke(seatPath("chloe"), { allocatedEmailAt: null }), "Chloe no longer holds a place that can be moved, so this request closed by itself. Nobody was emailed."],
    ["she was taken off the run", () => world.db.poke(seatPath("chloe"), { status: "removed" }), "Chloe no longer holds a place that can be moved, so this request closed by itself. Nobody was emailed."],
    ["she left the run", () => world.db.poke(seatPath("chloe"), { status: "withdrawn" }), "Chloe no longer holds a place that can be moved, so this request closed by itself. Nobody was emailed."],
    [
      "she was moved on the allocation board and back",
      () => world.db.poke(seatPath("chloe"), { groupsByWeek: [{ groupId: B, fromWeek: 1 }, { groupId: A, fromWeek: 3 }, { groupId: B, fromWeek: 4 }] }),
      "Chloe has been moved since asking, so this request closed by itself. Nobody was emailed.",
    ],
    ["the run is over", () => world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" }), "The programme is over, so this request closed by itself. Nobody was emailed."],
  ];

  for (const [what, change, sentence] of STATES) {
    test(`${what}: every reader says it closed, every press is refused, nothing is written and nobody is emailed`, async () => {
      const id = await chloeAsks();
      change();
      world.mail.length = 0;
      const said = await everyReader(id);
      assert.equal(said.card, false, "the card");
      assert.equal(said.ownRow, false, "Your requests");
      assert.equal(said.list, false, "the Requests page");
      assert.equal(said.home, 0, "Home's count");
      assert.equal(said.head, 0, "the programme head's count");
      assert.equal(said.page, "gone", "the request's page");
      assert.equal(said.closed, sentence);
      for (const action of ["decline", "reply"]) {
        const answer = await press("zach", action, id, { reply: "Sorry." });
        assert.equal(answer.status, 409, `${action}: ${JSON.stringify(answer.body)}`);
        assert.equal(answer.body.error, sentence);
      }
      assert.equal((await press("zach", "take", id)).body.error, sentence);
      assert.equal((await press("zach", "approve", id, { weekNumber: 3, emailCount: 3 })).status, 409);
      assert.equal((await press("chloe", "withdraw", id)).body.error, "That request has closed, so it can’t be withdrawn now.");
      assert.equal(read(`courseRequests/${id}`).status, "waiting", "nothing is written to close it");
      assert.equal(world.mail.length, 0);
    });
  }
});
