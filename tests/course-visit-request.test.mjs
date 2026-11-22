/**
 * A MEMBER ASKS TO GO TO ANOTHER GROUP'S SESSION FOR A WEEK, AND AN ADMIN
 * DECIDES IT: the ask from the person's own form, the card while it waits and
 * after, withdraw, approve (which arranges the visit through the staff visit's
 * own writer, in the same transaction), decline, a reply without deciding,
 * Take it, Dismiss, a request that closes by itself, the Requests page's row
 * and one request's page, and the emails each press sends.
 *
 *   POST /api/courses/runs/[runId]/requests/visit                 the person
 *   POST /api/courses/requests/[requestId]/visit/approve          admins
 *   POST /api/courses/requests/[requestId]/visit/decline          admins
 *   POST /api/courses/requests/[requestId]/visit/reply            admins
 *   POST /api/courses/requests/[requestId]/visit/take             admins
 *   POST /api/courses/requests/[requestId]/visit/withdraw         the person
 *   POST /api/courses/requests/[requestId]/visit/dismiss          the person
 *   /learn/[runId]/another-session                                the person's form
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Chloe is in Group B, whose week 3
 * session is tonight; the one other session she can be offered that week is
 * Group C's, Wed 18 Nov at 1pm (Tom). Zach is an admin.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { A, B, C, NOW, ROUND, AGI, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitRequest");
const { world, call } = w;
const askRoute = await w.courseRoute("runs", "[runId]", "requests", "visit");
const decide = {};
for (const action of ["approve", "decline", "reply", "take", "withdraw", "dismiss"]) {
  decide[action] = await w.courseRoute("requests", "[requestId]", "visit", action);
}
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { anotherSessionFor } = await w.loadTs(join("lib", "courses", "visitRequest", "own.ts"));
const { loadVisitRequestPage } = await w.loadTs(join("lib", "courses", "visitRequest", "page.ts"));
const { loadRequestsPage } = await w.loadTs(join("lib", "courses", "requests", "load.ts"));
const { requestsWaitingFor } = await w.loadTs(join("lib", "courses", "requests", "home.ts"));
const kinds = await w.loadTs(join("lib", "courses", "requests", "kinds.ts"));
const excusedAskRoute = await w.courseRoute("groups", "[groupId]", "excused");
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const anotherPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "another-session", "page.tsx"))).default;

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const mailTo = (uid) => world.mail.filter((message) => message.to.startsWith(`${uid}@`));
const subjectsTo = (uid) => mailTo(uid).map((message) => message.subject);
const requestDocs = () => world.db.paths().filter((path) => path.startsWith("courseRequests/")).map((path) => ({ path, ...read(path) }));
const visitRequests = () => requestDocs().filter((doc) => doc.kind === "visit");

const ask = (who, body) => call(who, askRoute.POST, { runId: RUN.agi }, { body, course: true });
const press = (who, action, requestId, body) => call(who, decide[action].POST, { requestId }, { body, course: true });

async function viewOf(uid) {
  const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
  const groups = world.db
    .paths()
    .filter((path) => path.startsWith("courseGroups/"))
    .map((path) => normalizeCourseGroup(path.slice("courseGroups/".length), read(path)))
    .filter((group) => group.runId === RUN.agi);
  return anotherSessionFor(world.courseDb, { user: w.sessionOf(uid), run, enrolment: seat(uid), groups, now: new Date() });
}

/** Chloe asks for Group C's session, and the request's id. */
async function chloeAsks(reason = "Group B's room is closed tonight.") {
  const answer = await ask("chloe", { hostGroupId: C, reason });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await w.settle();
  return answer.body.request.id;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

describe("1. Asking", () => {
  test("the card offers week 3, and the form lists Group C's session with its places left", async () => {
    const view = await viewOf("chloe");
    assert.deepEqual(view.offer, { weekNumber: 3, homeGroupId: B, sessionKey: "w03" });
    assert.equal(view.waiting, null);
    const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    assert.equal(page.to, null);
    assert.match(page.text, /Another session this week/);
    assert.match(page.text, /You stay in Group B\. An admin approves it\. Week 3’s work is due at the session you go to\./);
    assert.match(page.text, /Group sessions in week 3/);
    assert.match(page.text, /Group C · Wed 18 Nov, 1pm to 3pm/);
    assert.match(page.text, /places? left/);
    assert.match(page.text, /Anything to add \(optional\)/);
    assert.match(page.text, /Please don’t include medical details or anything about your health\. A few words are enough\./);
    assert.match(page.text, /Send the request/);
    assert.match(page.text, /One request at a time\. You can withdraw it until it’s decided\./);
    assert.equal(page.wrote, false);
  });

  test("an admin with no place is sent back to the run's home", async () => {
    const page = await w.draw(anotherPage, "zach", { runId: RUN.agi });
    assert.equal(page.to, `/learn/${RUN.agi}`);
  });

  test("asking writes one request of the visit kind and emails the admins in the approved words, never the person's own words", async () => {
    world.mail.length = 0;
    const id = await chloeAsks();
    const doc = read(`courseRequests/${id}`);
    assert.equal(doc.kind, "visit");
    assert.equal(doc.runId, RUN.agi);
    assert.equal(doc.groupId, B);
    assert.equal(doc.sessionKey, "w03");
    assert.equal(doc.subjectUid, "chloe");
    assert.equal(doc.askedByUid, "chloe");
    assert.equal(doc.status, "waiting");
    assert.deepEqual(doc.change.weekNumber, 3);
    assert.equal(doc.change.hostGroupId, C);
    assert.equal(doc.change.hostSessionKey, "w03");
    assert.deepEqual(doc.change.asked, { dateKey: "2026-11-18", startTimeLocal: "13:00" });
    assert.equal(doc.reason, "Group B's room is closed tonight.");
    assert.equal(doc.adminsToldOn, "2026-11-17");
    // Nothing on her place or any register.
    assert.equal(seat("chloe").visits, undefined);
    const toZach = mailTo("zach");
    assert.equal(toZach.length, 1);
    assert.equal(toZach[0].subject, "Chloe Nguyen asked to go to Group C’s session for week 3");
    const text = JSON.stringify(toZach[0]);
    assert.match(text, /Chloe Nguyen asked on Tue 17 Nov at 12pm to go to Group C’s week 3 session \(Wed 18 Nov, 1pm\) instead of Group B’s\./);
    assert.match(text, /You get this because you decide requests\. You can switch it off on the Requests page\./);
    assert.doesNotMatch(text, /room is closed/);
    assert.equal(subjectsTo("chloe").length, 0);
    assert.equal(subjectsTo("tom").length, 0);
  });

  test("an admin who switched the email off is not sent it", async () => {
    world.db.poke("users/zach", { requestEmails: { excused: false } });
    world.mail.length = 0;
    await chloeAsks();
    assert.equal(mailTo("zach").length, 0);
  });

  test("one request at a time: a second ask is refused and writes nothing; the card then offers nothing", async () => {
    await chloeAsks();
    const again = await ask("chloe", { hostGroupId: C });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "You already have a request waiting. Withdraw it to send another.");
    assert.equal(visitRequests().length, 1);
    const view = await viewOf("chloe");
    assert.equal(view.offer, null);
    assert.ok(view.waiting);
  });

  test("a request of another kind, or of no run, is no request waiting", async () => {
    world.db.seed("courseRequests/teamAsk", { kind: "team-message", runId: "", subjectUid: "chloe", askedByUid: "chloe", status: "waiting" });
    world.db.seed("courseRequests/excusedElsewhere", { kind: "excused", runId: RUN.other, subjectUid: "chloe", askedByUid: "chloe", status: "waiting", change: { weeks: [] } });
    const view = await viewOf("chloe");
    assert.ok(view.offer, "nothing of another kind counts");
    assert.equal((await ask("chloe", { hostGroupId: C })).status, 200);
  });

  test("a full session is shown and not choosable, and an ask for it is refused", async () => {
    world.db.poke(`courseGroups/${C}`, { capacity: 1 });
    const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    assert.match(page.text, /Full this week/);
    assert.match(page.text, /No other session has a place this week\./);
    const answer = await ask("chloe", { hostGroupId: C });
    assert.equal(answer.status, 409);
    assert.equal(answer.body.error, "No other session has a place this week.");
    assert.equal(visitRequests().length, 0);
  });

  test("refusals: nothing chosen, a group the form does not offer, somebody who can ask nothing, a link in the reason, signed out", async () => {
    assert.deepEqual((await ask("chloe", {})).body.error, "Choose a session first.");
    assert.equal((await ask("chloe", { hostGroupId: B })).body.error, "That session can’t be chosen now. Choose another.");
    const tom = await ask("tom", { hostGroupId: B });
    assert.equal(tom.status, 404);
    assert.equal(tom.body.error, "There’s no session this week you can ask to swap now.");
    const zach = await ask("zach", { hostGroupId: B });
    assert.equal(zach.status, 404);
    assert.equal((await ask("chloe", { hostGroupId: C, reason: "see https://example.com" })).status, 400);
    assert.equal((await call(null, askRoute.POST, { runId: RUN.agi }, { body: { hostGroupId: C }, course: true })).status, 401);
    assert.equal(visitRequests().length, 0);
  });

  test("their own session this week started: week 3 is no longer offered, and the form offers their next week", async () => {
    at("2026-11-17T18:30:00Z");
    const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    // Week 4 is now their next session: it is offered instead.
    assert.match(page.text, /Group sessions in week 4/);
  });
});

describe("2. Waiting, withdraw and Take it", () => {
  test("the card says it waits, with when it was sent, and Withdraw the request writes it withdrawn and emails nobody", async () => {
    const id = await chloeAsks();
    const view = await viewOf("chloe");
    assert.equal(view.waiting.requestId, id);
    assert.equal(view.waiting.sent, "Sent today, 12pm");
    assert.equal(view.waiting.line, "You asked to go to Group C’s session on Wed 18 Nov, 1pm. An admin decides.");
    assert.equal(view.rows[0].title, "Group C for week 3");
    assert.equal(view.rows[0].line, "Sent Tue 17 Nov, 12pm");
    world.mail.length = 0;
    assert.equal((await press("farah", "withdraw", id)).status, 403);
    const done = await press("chloe", "withdraw", id);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(read(`courseRequests/${id}`).status, "withdrawn");
    assert.equal(world.mail.length, 0);
    const after = await viewOf("chloe");
    assert.equal(after.waiting, null);
    assert.ok(after.offer, "a new one can be asked");
    assert.deepEqual(after.withdrawn, { requestId: id, line: "You withdrew your request to go to Group C." }, "read on the server, so the press's own re-read keeps it");
    at("2026-11-17T20:30:00Z");
    assert.equal((await viewOf("chloe")).withdrawn, null, "it goes once that week's session has ended");
    at("2026-11-17T12:00:00Z");
    assert.equal(after.rows[0].line, "Withdrawn by you, 12pm");
    const again = await press("chloe", "withdraw", id);
    assert.equal(again.body.error, "It’s already been decided, so it can’t be withdrawn now.");
  });

  test("Take it: an admin's alone, never the asker's, and it emails nobody", async () => {
    const id = await chloeAsks();
    world.mail.length = 0;
    assert.equal((await press("chloe", "take", id)).status, 403);
    assert.equal((await press("claudia", "take", id)).status, 403);
    const taken = await press("zach", "take", id);
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
    assert.equal(read(`courseRequests/${id}`).handlingUid, "zach");
    assert.equal((await press("zach", "take", id)).body.error, "You have it already.");
    assert.equal(world.mail.length, 0);
    const rows = (await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date())).view.rows.filter((row) => row.kind === "visit");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, "handling");
  });
});

describe("3. Approving arranges the visit in the same transaction", () => {
  test("the page says what approving does with the staff visit's own words, and the press writes the visit and the decision and sends the three emails", async () => {
    const id = await chloeAsks();
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.equal(page.status, "ok");
    assert.equal(page.view.state, "waiting");
    assert.ok(page.view.approving.ok, JSON.stringify(page.view.approving));
    assert.match(page.view.approving.button, /^Approve and email \d people$/);
    assert.equal((await loadVisitRequestPage(world.courseDb, w.sessionOf("claudia"), id, new Date())).status, "none");
    const emails = page.view.approving.preview.emails;

    world.mail.length = 0;
    const wrong = await press("zach", "approve", id, { emailCount: emails + 1 });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.emails, emails);
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal(seat("chloe").visits, undefined, "nothing written on a refused press");

    const done = await press("zach", "approve", id, { emailCount: emails, reply: "Enjoy Group C." });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    await w.settle();
    const doc = read(`courseRequests/${id}`);
    assert.equal(doc.status, "approved");
    assert.equal(doc.decidedByUid, "zach");
    assert.equal(doc.reply, "Enjoy Group C.");
    const visits = seat("chloe").visits;
    assert.equal(visits.length, 1);
    assert.equal(visits[0].weekNumber, 3);
    assert.equal(visits[0].groupId, C);
    assert.equal(visits[0].arrangedByUid, "zach");
    assert.equal(world.mail.length, emails);
    const toChloe = mailTo("chloe");
    assert.equal(toChloe.length, 1);
    assert.equal(toChloe[0].subject, "You’re going to Group C’s session on Wed 18 Nov");
    const text = JSON.stringify(toChloe[0]);
    assert.match(text, /Your request is approved\. For week 3 you’re with Group C:/);
    assert.match(text, /Zach says: “Enjoy Group C\.”/);
    assert.ok(mailTo("tom").length === 1, "the host's facilitator");

    const view = await viewOf("chloe");
    assert.equal(view.rows[0].line.startsWith("Approved by Zach, Tue 17 Nov, 12pm"), true);
    assert.equal((await press("zach", "approve", id, { emailCount: emails })).body.error, "This request has been decided already.");
  });

  test("the visit an approval writes is the staff visit's own, byte for byte, and both groups' history rows likewise", async () => {
    const id = await chloeAsks();
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    await press("zach", "approve", id, { emailCount: page.view.approving.preview.emails });
    const approvedVisits = JSON.stringify(read(seatPath("chloe")).visits);
    const historyOf = () =>
      world.db
        .paths()
        .filter((path) => path.startsWith("courseAudit/"))
        .map(read)
        .filter((row) => row.kind === "member-visits")
        .map((row) => JSON.stringify({ ...row, id: undefined }))
        .sort();
    const approvedHistory = historyOf();

    w.reset();
    const shown = await call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { weekNumber: 3, hostGroupId: C, preview: true }, course: true });
    const saved = await call(
      "zach",
      visitRoute.POST,
      { roundId: ROUND, programmeId: AGI, uid: "chloe" },
      { body: { weekNumber: 3, hostGroupId: C, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null }, course: true },
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(JSON.stringify(read(seatPath("chloe")).visits), approvedVisits);
    assert.deepEqual(historyOf(), approvedHistory);
  });

  test("a session that filled since the ask is approved only with the warning shown", async () => {
    const id = await chloeAsks();
    world.db.poke(`courseGroups/${C}`, { capacity: 1 });
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.ok(page.view.approving.preview.overLimit);
    const emails = page.view.approving.preview.emails;
    const unwarned = await press("zach", "approve", id, { emailCount: emails });
    assert.equal(unwarned.status, 409);
    assert.equal(unwarned.body.overLimit, true);
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    const warned = await press("zach", "approve", id, { emailCount: emails, overLimit: true });
    assert.equal(warned.status, 200, JSON.stringify(warned.body));
  });

  test("a withdraw that lands first leaves the approval nothing to do: no visit, no email", async () => {
    const id = await chloeAsks();
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    await press("chloe", "withdraw", id);
    world.mail.length = 0;
    const late = await press("zach", "approve", id, { emailCount: page.view.approving.preview.emails });
    assert.equal(late.status, 409);
    assert.equal(seat("chloe").visits, undefined);
    assert.equal(world.mail.length, 0);
  });

  test("staff arranging a visit that week while her request waits are told to decide it first", async () => {
    await chloeAsks();
    const shown = await call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { weekNumber: 3, hostGroupId: C, preview: true }, course: true });
    assert.equal(shown.status, 409);
    assert.equal(shown.body.error, "Chloe asked to go to another group’s session in week 3. Decide that request first, on the Requests page.");
  });
});

describe("4. Declining, replying and dismissing", () => {
  test("declining needs a reply, writes no visit, emails the person the approved words, and the card says so until dismissed", async () => {
    const id = await chloeAsks();
    assert.equal((await press("zach", "decline", id, {})).status, 400);
    world.mail.length = 0;
    const done = await press("zach", "decline", id, { reply: "Group C is full that day." });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(read(`courseRequests/${id}`).status, "declined");
    assert.equal(seat("chloe").visits, undefined);
    assert.deepEqual(subjectsTo("chloe"), ["About your request for week 3"]);
    const text = JSON.stringify(mailTo("chloe")[0]);
    assert.match(text, /Your request to go to Group C’s session for week 3 wasn’t approved\./);
    assert.match(text, /Zach says: “Group C is full that day\.”/);
    assert.match(text, /You’re with Group B as usual on Tue 17 Nov, 6pm\./);
    assert.equal(world.mail.length, 1);
    const view = await viewOf("chloe");
    assert.equal(view.declined.line, "Your request to go to Group C on Wed 18 Nov wasn’t approved. Zach: “Group C is full that day.”");
    assert.equal(view.rows[0].line, "Declined by Zach, Tue 17 Nov, 12pm");
    world.mail.length = 0;
    assert.equal((await press("farah", "dismiss", id)).status, 403);
    assert.equal((await press("chloe", "dismiss", id)).status, 200);
    assert.equal((await viewOf("chloe")).declined, null);
    assert.equal(world.mail.length, 0);
  });

  test("the declined message goes by itself once that week's session has passed", async () => {
    const id = await chloeAsks();
    await press("zach", "decline", id, { reply: "Not this week." });
    at("2026-11-17T20:30:00Z");
    assert.equal((await viewOf("chloe")).declined, null);
  });

  test("a reply without deciding keeps it waiting, emails the person, and the card shows it; it can be sent again", async () => {
    const id = await chloeAsks();
    world.mail.length = 0;
    const replied = await press("zach", "reply", id, { reply: "Could you join Group B online instead?" });
    assert.equal(replied.status, 200, JSON.stringify(replied.body));
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.deepEqual(subjectsTo("chloe"), ["About your request for week 3"]);
    const text = JSON.stringify(mailTo("chloe")[0]);
    assert.match(text, /Zach replied to your request to go to Group C’s session for week 3\./);
    assert.match(text, /It’s still waiting for a decision\./);
    assert.doesNotMatch(text, /You’ll get an email when it’s decided/, "a request that closes by itself sends nothing");
    assert.equal((await viewOf("chloe")).waiting.reply, "Zach: “Could you join Group B online instead?”");
    assert.equal((await press("zach", "reply", id, { reply: "Any news?" })).status, 200);
    assert.equal(read(`courseRequests/${id}`).change.replies.length, 2);
    assert.equal((await press("chloe", "withdraw", id)).status, 200, "a request with a reply can still be withdrawn");
  });
});

describe("5. A request nobody decided in time closes by itself", () => {
  test("once the earlier of the two sessions has started: off the card and the Requests page, a closed row, nothing approvable, nobody emailed", async () => {
    const id = await chloeAsks();
    world.mail.length = 0;
    at("2026-11-17T18:05:00Z");
    const view = await viewOf("chloe");
    assert.equal(view.waiting, null);
    const row = view.rows.find((each) => each.id === id);
    assert.equal(row.state, "closed");
    assert.equal(row.line, "Not decided before Tue 17 Nov, 6pm");
    const rows = (await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date())).view.rows.filter((each) => each.kind === "visit");
    assert.equal(rows.length, 0);
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    assert.equal(page.view.state, "closed");
    assert.equal(page.view.canDecide, false);
    assert.equal((await press("zach", "decline", id, { reply: "Too late." })).status, 409);
    assert.equal((await press("chloe", "withdraw", id)).body.error, "That request has closed, so it can’t be withdrawn now.");
    assert.equal(read(`courseRequests/${id}`).status, "waiting", "nothing is written to close it");
    assert.equal(world.mail.length, 0);
  });

  test("the host's session called off: it can't go ahead, said on the card with Withdraw", async () => {
    await chloeAsks();
    const group = read(`courseGroups/${C}`);
    world.db.poke(`courseGroups/${C}`, { sessionChanges: { ...(group.sessionChanges ?? {}), w03: { kind: "cancelled", reason: "Away.", dateKey: "2026-11-18", byUid: "zach", at: new Date() } } });
    const view = await viewOf("chloe");
    assert.equal(view.waiting.line, "Group C’s session on Wed 18 Nov isn’t happening, so this request can’t go ahead. Withdraw it, or choose another session.");
    assert.equal((await press("chloe", "withdraw", view.waiting.requestId)).status, 200);
  });
});

describe("6. Who each press refuses, and the daily cap", () => {
  test("approve, decline, reply and take: the asker, a programme's lead, another member and somebody signed out are refused, and nothing is written", async () => {
    const id = await chloeAsks();
    const page = await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date());
    const emails = page.view.approving.preview.emails;
    world.mail.length = 0;
    for (const who of ["chloe", "claudia", "farah", null]) {
      const expected = who === null ? 401 : 403;
      assert.equal((await press(who, "approve", id, { emailCount: emails })).status, expected, `approve as ${who}`);
      assert.equal((await press(who, "decline", id, { reply: "No." })).status, expected, `decline as ${who}`);
      assert.equal((await press(who, "reply", id, { reply: "Hello." })).status, expected, `reply as ${who}`);
      assert.equal((await press(who, "take", id)).status, expected, `take as ${who}`);
    }
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
    assert.equal(read(`courseRequests/${id}`).handlingUid ?? null, null);
    assert.equal(seat("chloe").visits, undefined);
    assert.equal(world.mail.length, 0);
  });

  test("withdraw and dismiss: an admin is told it is not theirs, another member and somebody signed out are refused", async () => {
    const id = await chloeAsks();
    const zach = await press("zach", "withdraw", id);
    assert.equal(zach.status, 403);
    assert.equal(zach.body.error, "That request isn’t yours to withdraw.");
    assert.equal((await press(null, "withdraw", id)).status, 401);
    assert.equal((await press("farah", "dismiss", id)).status, 403);
    assert.equal(read(`courseRequests/${id}`).status, "waiting");
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

describe("7. One answer to whether a request still waits", () => {
  // Freya (Group D) asks in week 4, whose own session is Mon 23 Nov at 6pm,
  // for Group A's Thu 19 Nov at 6pm: the host's session comes first.
  async function freyaAsks() {
    const answer = await ask("freya", { hostGroupId: A });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    await w.settle();
    return answer.body.request.id;
  }
  /** What every reader says of the request now: true where it still waits. */
  async function everyReader(id) {
    const said = {};
    const view = await viewOf("freya");
    said.card = view.waiting?.requestId === id;
    said.yourRequests = view.rows.find((row) => row.id === id)?.state === "waiting";
    const rows = (await loadRequestsPage(world.courseDb, w.sessionOf("zach"), new Date())).view.rows;
    said.requestsPage = rows.some((row) => row.id === id);
    said.requestPage = (await loadVisitRequestPage(world.courseDb, w.sessionOf("zach"), id, new Date())).view.state === "waiting";
    said.homeCount = (await requestsWaitingFor(world.courseDb, w.sessionOf("zach"), new Date())).visits === 1;
    const staff = await call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "freya" }, { body: { weekNumber: 4, hostGroupId: B, preview: true }, course: true });
    said.staffVisit = staff.body?.error === "Freya asked to go to another group’s session in week 4. Decide that request first, on the Requests page.";
    // Last, as an ask that is not refused writes a new request.
    const again = await ask("freya", { hostGroupId: B });
    said.oneAtATime = again.body?.error === "You already have a request waiting. Withdraw it to send another.";
    return said;
  }
  const allAre = (said, value) => assert.deepEqual(Object.fromEntries(Object.keys(said).map((key) => [key, value])), said);

  test("a minute before the host's session starts: every reader says it waits", async () => {
    const id = await freyaAsks();
    at("2026-11-19T17:59:00Z");
    allAre(await everyReader(id), true);
  });

  test("at the host's start: every reader says it closed, and every press is refused for it", async () => {
    const id = await freyaAsks();
    at("2026-11-19T18:00:00Z");
    allAre(await everyReader(id), false);
    for (const [action, body] of [["approve", { emailCount: 3 }], ["decline", { reply: "x" }], ["reply", { reply: "x" }], ["take", undefined]]) {
      const answer = await press("zach", action, id, body);
      assert.equal(answer.status, 409, action);
      assert.match(answer.body.error, /closed by itself/, action);
    }
    assert.equal((await press("freya", "withdraw", id)).body.error, "That request has closed, so it can’t be withdrawn now.");
  });

  test("the host's register then says the session did not happen: every reader says it waits again, it can't go ahead, and Withdraw works", async () => {
    const id = await freyaAsks();
    at("2026-11-19T20:30:00Z");
    world.db.seed(registerPath(A, 4), { runId: RUN.agi, groupId: A, weekNumber: 4, occurrence: 1, held: false, records: {} });
    allAre(await everyReader(id), true);
    const view = await viewOf("freya");
    assert.equal(view.waiting.line, "Group A’s session on Thu 19 Nov isn’t happening, so this request can’t go ahead. Withdraw it, or choose another session.");
    // Approve is refused for the session, never for the request having closed.
    const approve = await press("zach", "approve", id, { emailCount: 3 });
    assert.equal(approve.status, 409);
    assert.doesNotMatch(approve.body.error, /closed by itself/);
    assert.equal((await press("zach", "reply", id, { reply: "Sorry about that." })).status, 200);
    assert.equal((await press("freya", "withdraw", id)).status, 200);
    assert.equal(read(`courseRequests/${id}`).status, "withdrawn");
  });
});

describe("8. A programme's lead, a request to be excused, and kinds the page does not know", () => {
  test("a lead arranging a visit for a week the person's request waits about is told the week is with the admins, and nothing of the request", async () => {
    await chloeAsks();
    const lead = await call("claudia", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { weekNumber: 3, hostGroupId: C, preview: true }, course: true });
    assert.equal(lead.status, 409, JSON.stringify(lead.body));
    assert.equal(lead.body.error, "Week 3 for Chloe is with the admins at the moment. Ask an admin to arrange this visit.");
  });

  test("asking to be excused from a week whose request to go to another session waits is refused, and writes nothing", async () => {
    await chloeAsks();
    const before = requestDocs().length;
    const excused = await call("chloe", excusedAskRoute.POST, { groupId: B }, {
      body: { sessionKeys: ["w03"], reason: "A clash.", inPerson: true, ownOnline: true, otherOnline: true },
      course: true,
    });
    assert.equal(excused.status, 409, JSON.stringify(excused.body));
    assert.equal(excused.body.error, "You already have a request waiting. Withdraw it to send another.");
    assert.equal(requestDocs().length, before);
    // A later week is asked as before.
    const later = await call("chloe", excusedAskRoute.POST, { groupId: B }, {
      body: { sessionKeys: ["w04"], reason: "A clash.", inPerson: true, ownOnline: true, otherOnline: true },
      course: true,
    });
    assert.equal(later.status, 200, JSON.stringify(later.body));
  });

  test("a made-up kind lands in no section and in no count of one kind, and the tabs count every row", () => {
    const rows = [
      { kind: "register-correction", state: "waiting" },
      { kind: "excused", state: "waiting" },
      { kind: "visit", state: "handling" },
      { kind: "made-up", state: "waiting" },
      { kind: "made-up", state: "replied" },
      { kind: "visit", state: "approved" },
    ];
    for (const kind of Object.values(kinds.REQUEST_KINDS)) {
      assert.ok(kinds.rowsOfKind(rows, kind).every((row) => row.kind === kind), kind);
    }
    assert.deepEqual(kinds.openByKind(rows), { corrections: 1, excused: 1, visits: 1, moves: 0, messages: 0, access: 0 });
    assert.deepEqual(kinds.tabCounts(rows), { waiting: 3, handling: 1, done: 2 }, "a later kind's own decided state is done");
    assert.equal(kinds.isDone("replied"), true);
  });

  test("Home and the Requests page take each kind by itself", () => {
    const source = (rel) => readFileSync(join(import.meta.dirname, "..", "src", rel), "utf8");
    assert.doesNotMatch(source("app/(app)/dashboard/HomeAdmin.tsx"), /requestsWaiting - /, "no count worked out by subtraction");
    assert.match(source("features/courses/requests/RequestsList.tsx"), /const shown = rowsOfKind\(inTab, REQUEST_KINDS\.corrections\);/);
    assert.match(source("lib/courses/requests/home.ts"), /\.\.\.openByKind\(loaded\.view\.rows\)/);
  });
});
