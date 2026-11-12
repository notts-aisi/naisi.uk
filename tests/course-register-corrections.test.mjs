/**
 * When a register is wrong: correcting a finished register's line and its
 * whole column, whether a session happened, and asking for a correction.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PATCH /api/courses/groups/[groupId]/attendance            (a line, with a reason)
 *   POST  /api/courses/groups/[groupId]/attendance/column     (the whole column)
 *   POST  /api/courses/groups/[groupId]/attendance/requests   (ask for a correction)
 *   POST  /api/courses/requests/[requestId]/{withdraw,approve,decline,take}
 *   GET   /api/courses/groups/[groupId]/attendance            (each line's story, each request)
 *   loadRequestsPage, loadRequestPage, loadGroupAttendance    (the pages' loaders)
 *
 * ## What this guards
 *
 *  1. WHO CORRECTS: admins, the programme's lead and the run's track leads.
 *     A facilitator of the group is told to ask; anybody else is refused.
 *  2. A REASON, always: an old page that sends none is told in one plain
 *     sentence; whether it happened is the column's, never a line's.
 *  3. WHAT A CORRECTION WRITES, in one transaction: the line, who set it
 *     (`how: "correction"`), that it was corrected (`corrected`), the figures
 *     in full, and a history row with what it said before (and who set it),
 *     after, why, and the request it came from. Nobody is emailed.
 *  4. WHO READS WHAT: a facilitator never reads a reason somebody else gave;
 *     a member reads only the day their line was corrected.
 *  5. REQUESTS: ask, withdraw, take, approve (in the same transaction as the
 *     correction, refused when the line has changed), decline with a reply.
 *  6. THE COLUMN: held online, moved to another session, cleared, didn't
 *     happen, did happen; each with a preview that changes nothing.
 *  7. THE PAGES' LOADERS: the Requests page, one request's page, the group's
 *     attendance across every week.
 *
 * Real: the routes and every library under them. Stubbed: the session, the
 * Admin SDK handle, the view-as guard and the mail door.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, B, C, RUN, leadSeed } from "./lib/leadWorld.mjs";

const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { static documentId() { return '__name__'; } }",
);
const made = makeWorld("__registerCorrections", [["firebase-admin/firestore", FIRESTORE]]);
const { world, reset, call, everything, courseRoute, loadTs, sessionOf } = made;
const join_ = await loadJoin(made);
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const columnRoute = await courseRoute("groups", "[groupId]", "attendance", "column");
const askRoute = await courseRoute("groups", "[groupId]", "attendance", "requests");
const cantMakeIt = await courseRoute("groups", "[groupId]", "cant-make-it");
const reportRoute = await courseRoute("groups", "[groupId]", "session-report");
const overviewRoute = await courseRoute("runs", "[runId]", "overview");
const actions = {
  withdraw: await courseRoute("requests", "[requestId]", "withdraw"),
  approve: await courseRoute("requests", "[requestId]", "approve"),
  decline: await courseRoute("requests", "[requestId]", "decline"),
  take: await courseRoute("requests", "[requestId]", "take"),
};
const words = await loadTs("lib/courses/registerCorrection/words.ts");
const pageWords = await loadTs("lib/courses/registerCorrection/pageWords.ts");
const columnLib = await loadTs("lib/courses/registerCorrection/column.ts");
const coverWords = await loadTs("lib/courses/registerCover/words.ts");
const attendanceLib = await loadTs("lib/firestore/courseAttendance.ts");
const requestsLib = await loadTs("lib/firestore/courseRequests.ts");
const auditLib = await loadTs("lib/firestore/courseAudit.ts");
const history = await loadTs("lib/courses/groupHistory/load.ts");
const loaders = await loadTs("lib/courses/requests/load.ts");
const requestsHome = await loadTs("lib/courses/requests/home.ts");
const attendanceLoader = await loadTs("lib/courses/groupAttendance/load.ts");
const changeWords = await loadTs("lib/courses/sessionChange/words.ts");
const groupPageWords = await loadTs("lib/courses/groupPage/words.ts");
const changeModel = await loadTs("lib/courses/sessionChange/model.ts");
/** A file under src, as text. */
const sourceOf = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const PLACED_ON = new Date("2026-10-27T17:38:00Z");
/** Group B's week 1 session: Tue 3 Nov, 6pm to 8pm in London (GMT). */
const DURING_W1 = new Date("2026-11-03T18:12:00Z");
/** The morning after week 2 (Tue 10 Nov): week 1 is finished, week 2 met and nobody took it. */
const LATER = new Date("2026-11-11T10:05:00Z");
mock.timers.enable({ apis: ["Date"], now: PLACED_ON });
const at = (when) => mock.timers.setTime(new Date(when).getTime());

const W1 = `courseAttendance/${RUN.agi}__${B}__w01`;
const W2 = `courseAttendance/${RUN.agi}__${B}__w02`;
const stored = (path = W1) => world.db.read(path) ?? null;
const rows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => world.db.read(path))
    .filter((row) => !kind || row.kind === kind);
const requestDocs = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseRequests/"))
    .map((path) => ({ id: path.split("/")[1], ...world.db.read(path) }));
const rollup = (uid) => world.db.read(`courseEnrolments/${RUN.agi}__${uid}`).attendance;
const nameOf = (uid) => {
  const data = world.db.read(`users/${uid}`) ?? {};
  return data.profile?.preferredName || data.displayName;
};

const REASON = "Dev was there all session. I tapped the wrong line.";

const mark = (who, marks, extra = {}) =>
  call(who, register.POST, { groupId: B }, { body: { weekNumber: 1, marks, ...extra }, course: true });
const finish = (who, weekNumber = 1) => call(who, push.POST, { groupId: B }, { body: { weekNumber }, course: true });
const correct = (who, body) => call(who, register.PATCH, { groupId: B }, { body: { weekNumber: 1, ...body }, course: true });
const column = (who, body) => call(who, columnRoute.POST, { groupId: B }, { body: { weekNumber: 1, ...body }, course: true });
const ask = (who, body) => call(who, askRoute.POST, { groupId: B }, { body: { weekNumber: 1, ...body }, course: true });
const act = (who, action, requestId, body) => call(who, actions[action].POST, { requestId }, { body: body ?? {}, course: true });
const read = (who) => call(who, register.GET, { groupId: B }, { course: true });

/**
 * Amara and Dev placed in Group B and told; Rahul (a facilitator of the
 * group) takes week 1's register: Amara in the room, Dev absent, and
 * finishes it. Then the clock is the morning after week 2.
 */
async function finishedWeekOne() {
  at(PLACED_ON);
  reset(leadSeed(), { now: () => new Date() });
  assert.equal((await join_.press()).status, 200);
  const placed = await join_.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: C },
  ]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  assert.equal((await join_.publish("zach")).status, 200);
  at(DURING_W1);
  const marked = await mark("rahul", [
    { uid: "amara", status: "present" },
    { uid: "dev", status: "absent" },
  ]);
  assert.equal(marked.status, 200, JSON.stringify(marked.body));
  const finished = await finish("rahul");
  assert.equal(finished.status, 200, JSON.stringify(finished.body));
  at(LATER);
  world.mail.length = 0;
}

beforeEach(async () => {
  await finishedWeekOne();
});

// ---------------------------------------------------------------------------
// 1. Correcting a line
// ---------------------------------------------------------------------------

describe("1. correcting a line of a finished register", () => {
  test("a facilitator of the group is told to ask; anybody else is refused; nothing is written", async () => {
    const before = everything();
    const facilitator = await correct("rahul", { marks: [{ uid: "dev", status: "present" }], reason: REASON });
    assert.deepEqual([facilitator.status, facilitator.body.error], [403, words.CORRECTION_REFUSAL.facilitator]);
    for (const who of ["amara", "tom", "bea", "tess", null]) {
      const answer = await correct(who, { marks: [{ uid: "dev", status: "present" }], reason: REASON });
      assert.ok([401, 403].includes(answer.status), `${who}: ${answer.status}`);
    }
    assert.equal(everything(), before);
  });

  test("a reason is needed, an old page that sends none is told so, and whether it happened is the column's", async () => {
    const before = everything();
    const cases = [
      [{}, words.CORRECTION_REFUSAL.oldPage],
      [{ reason: "   " }, words.CORRECTION_REFUSAL.reason],
      [{ reason: "two\nlines" }, words.CORRECTION_REFUSAL.reasonLine],
      [{ reason: "see https://example.com" }, words.CORRECTION_REFUSAL.reasonLink],
      [{ reason: "x".repeat(301) }, "The reason must be 300 characters or fewer."],
      [{ reason: REASON, held: false }, words.CORRECTION_REFUSAL.held],
    ];
    for (const [extra, error] of cases) {
      const answer = await correct("zach", { marks: [{ uid: "dev", status: "present" }], ...extra });
      assert.deepEqual([answer.status, answer.body.error], [400, error], JSON.stringify(extra));
    }
    assert.equal(everything(), before);
    // Exactly 300 characters is a reason.
    const longest = await correct("zach", { marks: [{ uid: "dev", status: "present" }], reason: "x".repeat(300) });
    assert.equal(longest.status, 200, JSON.stringify(longest.body));
  });

  test("the programme's lead corrects a line: the line, who set it, that it was corrected, the figures and one history row", async () => {
    assert.equal(rollup("dev").attendedInFull, 0);
    const answer = await correct("claudia", { marks: [{ uid: "dev", status: "present" }], reason: REASON });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.marked, answer.body.logged], [1, 1]);
    const saved = stored();
    assert.equal(saved.records.dev, "present");
    assert.equal(saved.online.dev, false, "in the room, beside a mark that says they came");
    assert.deepEqual([saved.setBy.dev.byUid, saved.setBy.dev.how], ["claudia", "correction"]);
    assert.equal(saved.corrected.dev.byUid, "claudia");
    assert.equal(saved.pushedByUid, "rahul", "who finished it is kept");
    assert.equal(saved.markedByUid, "rahul", "who took it is kept");
    assert.equal(saved.corrected.amara, undefined, "a line it did not move is not stamped");
    assert.equal(rollup("dev").attendedInFull, 1, "the figures were worked out again");
    const [row] = rows("attendance-edit");
    assert.equal(row.subjectUid, "dev");
    assert.equal(row.weekId, "w01");
    assert.equal(row.sessionKey, "w01");
    assert.equal(row.reason, REASON);
    assert.equal(row.emailed, 0);
    assert.equal(row.requestId, undefined);
    assert.deepEqual(
      [row.before.mark, row.before.line, row.before.setByUid, row.before.setHow, row.after.mark, row.after.line],
      ["absent", "Absent", "rahul", "facilitator", "present", "In the room"],
    );
    assert.equal(row.detail, `Corrected week 1’s register: ${nameOf("dev")}, Absent to In the room. Why: “${REASON}”`);
    assert.equal(auditLib.courseAuditCategory(row.kind), "registers");
    assert.deepEqual(world.mail, [], "nobody is emailed by a correction");
  });

  test("a run's track lead and an admin correct too; the same line sent again moves nothing", async () => {
    assert.equal((await correct("yusuf", { marks: [{ uid: "dev", status: "late" }], reason: "Arrived at ten past." })).status, 200);
    assert.equal((await correct("zach", { marks: [{ uid: "dev", status: "late", online: true }], reason: "It was online." })).status, 200);
    const again = await correct("zach", { marks: [{ uid: "dev", status: "late", online: true }], reason: "It was online." });
    assert.deepEqual([again.body.marked, again.body.logged], [0, 0]);
    assert.equal(rows("attendance-edit").length, 2);
  });

  test("a draft register is still its facilitators' to change", async () => {
    at("2026-11-10T18:20:00Z");
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }], { weekNumber: 2 })).status, 200);
    const answer = await call("zach", register.PATCH, { groupId: B }, {
      body: { weekNumber: 2, marks: [{ uid: "amara", status: "absent" }], reason: REASON },
      course: true,
    });
    assert.deepEqual([answer.status, answer.body.error], [409, words.CORRECTION_REFUSAL.notFinished]);
  });

  test("the person reads the day their line was corrected, and nothing about who or why", async () => {
    assert.equal((await correct("claudia", { marks: [{ uid: "dev", status: "present" }], reason: REASON })).status, 200);
    const own = await call("dev", overviewRoute.GET, { runId: RUN.agi }, { course: true });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    const week1 = own.body.ownAttendance.sessions.find((session) => session.weekNumber === 1);
    assert.deepEqual([week1.status, week1.correctedOn], ["present", "2026-11-11"]);
    const wire = JSON.stringify(own.body.ownAttendance);
    for (const leak of ["claudia", REASON, "correction"]) assert.ok(!wire.includes(leak), `the member's own list carries ${leak}`);
    const other = await call("amara", overviewRoute.GET, { runId: RUN.agi }, { course: true });
    assert.equal(other.body.ownAttendance.sessions.find((session) => session.weekNumber === 1).correctedOn, null);
  });

  test("the register's read tells each corrected line's story; a facilitator never reads a reason somebody else gave", async () => {
    assert.equal((await correct("claudia", { marks: [{ uid: "dev", status: "present" }], reason: REASON })).status, 200);
    const asLead = await read("claudia");
    assert.equal(asLead.status, 200);
    const story = asLead.body.corrections.w01.dev;
    assert.equal(story.kind, "line");
    assert.equal(story.before, "Absent");
    assert.equal(story.beforeSetBy.name.length > 0, true);
    assert.equal(story.reason, REASON);
    assert.equal(story.asked, null);
    assert.deepEqual([asLead.body.caller.corrects, asLead.body.canEditPushed], [true, false]);
    const asFacilitator = await read("rahul");
    assert.equal(asFacilitator.body.corrections.w01.dev.before, "Absent");
    assert.equal("reason" in asFacilitator.body.corrections.w01.dev, false, "a facilitator read the lead's reason");
    assert.ok(!JSON.stringify(asFacilitator.body).includes(REASON));
    assert.deepEqual([asFacilitator.body.caller.corrects, asFacilitator.body.canEditPushed], [false, false]);
  });

  test("the correction is in the group's history, under registers, with no further change", async () => {
    assert.equal((await correct("claudia", { marks: [{ uid: "dev", status: "present" }], reason: REASON })).status, 200);
    const { rows: shown } = await history.loadGroupHistory(world.courseDb, RUN.agi, B);
    const row = shown.find((each) => each.kind === "attendance-edit");
    assert.ok(row, "the correction is not in the group's history");
    assert.equal(row.category, "registers");
    assert.equal(row.reason, REASON);
    assert.match(row.detail, /^Corrected week 1’s register: /);
  });

  test("a register written before corrections reads no line as corrected", () => {
    const old = attendanceLib.normalizeCourseAttendance("x", { records: { amara: "present" }, pushedAt: new Date() });
    assert.deepEqual(old.corrected, {});
    const garbled = attendanceLib.normalizeCourseAttendance("x", { corrected: { amara: { at: "soon" }, dev: { byUid: "zach" } } });
    assert.deepEqual(garbled.corrected, {});
  });
});

// ---------------------------------------------------------------------------
// 2. Asking for a correction
// ---------------------------------------------------------------------------

describe("2. asking for a correction, and deciding it", () => {
  const askDev = (who = "rahul", reason = REASON) => ask(who, { uid: "dev", to: { status: "present" }, reason });

  test("a facilitator of the group asks: the request records who, about whom, what, why and where it belongs", async () => {
    const answer = await askDev();
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.request.state, answer.body.request.from, answer.body.request.to], ["waiting", "Absent", "In the room"]);
    const [doc] = requestDocs();
    assert.equal(doc.kind, "register-correction");
    assert.deepEqual([doc.runId, doc.groupId, doc.sessionKey, doc.weekId, doc.subjectUid, doc.askedByUid], [RUN.agi, B, "w01", "w01", "dev", "rahul"]);
    assert.ok(doc.roundId && doc.programmeId, "the programme the run belongs to is on the request");
    assert.deepEqual(doc.change, { from: { mark: "absent", online: false }, to: { mark: "present", online: false } });
    assert.equal(doc.status, "waiting");
    assert.deepEqual(doc.history.map((entry) => [entry.what, entry.byUid]), [["asked", "rahul"]]);
    assert.ok(requestsLib.normalizeCourseRequest(doc.id, doc), "the request reads back");
    assert.deepEqual(world.mail, [], "nobody is emailed by a request");
    assert.equal(stored().records.dev, "absent", "asking changes nothing on the register");
  });

  test("an ask is refused for somebody who corrects it themselves, an unfinished register, a line that says it already, and a second ask", async () => {
    assert.deepEqual([(await askDev("zach")).status, (await askDev("zach")).body.error], [403, words.REQUEST_REFUSAL.corrects]);
    assert.equal((await askDev("claudia")).status, 403);
    assert.equal((await askDev("amara")).status, 403);
    const same = await ask("rahul", { uid: "dev", to: { status: "absent" }, reason: REASON });
    assert.deepEqual([same.status, same.body.error], [409, "That line already says Absent."]);
    const noReason = await ask("rahul", { uid: "dev", to: { status: "present" } });
    assert.deepEqual([noReason.status, noReason.body.error], [400, words.REQUEST_REFUSAL.reason]);
    at("2026-11-10T18:20:00Z");
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }], { weekNumber: 2 })).status, 200);
    const draft = await ask("rahul", { weekNumber: 2, uid: "amara", to: { status: "absent" }, reason: REASON });
    assert.deepEqual([draft.status, draft.body.error], [409, words.REQUEST_REFUSAL.notFinished]);
    at(LATER);
    assert.equal((await askDev()).status, 200);
    const second = await askDev("sofia");
    assert.deepEqual([second.status, second.body.error], [409, words.REQUEST_REFUSAL.waiting]);
    assert.equal(requestDocs().length, 1);
  });

  test("the register shows the waiting ask: its reason to the asker and the people who decide, never to another facilitator", async () => {
    assert.equal((await askDev()).status, 200);
    const asker = (await read("rahul")).body.requests.w01.dev;
    assert.deepEqual([asker.state, asker.to, asker.yours, asker.reason], ["waiting", "In the room", true, REASON]);
    const other = (await read("sofia")).body.requests.w01.dev;
    assert.deepEqual([other.state, other.yours, "reason" in other], ["waiting", false, false]);
    const lead = (await read("claudia")).body.requests.w01.dev;
    assert.deepEqual([lead.reason, lead.handling], [REASON, null]);
  });

  test("take it, withdraw it: who may, and in what state", async () => {
    const { id } = (await askDev()).body.request;
    assert.equal((await act("rahul", "take", id)).status, 403);
    assert.equal((await act("amara", "take", id)).status, 403);
    assert.equal((await act("claudia", "take", id)).status, 200);
    assert.deepEqual([(await act("claudia", "take", id)).body.error], [words.REQUEST_REFUSAL.alreadyYours]);
    assert.equal(world.db.read(`courseRequests/${id}`).handlingUid, "claudia");
    assert.equal((await read("claudia")).body.requests.w01.dev.handling.name.length > 0, true);
    const notYours = await act("sofia", "withdraw", id);
    assert.deepEqual([notYours.status, notYours.body.error], [403, words.REQUEST_REFUSAL.notYours]);
    assert.equal((await act("rahul", "withdraw", id)).status, 200);
    const doc = world.db.read(`courseRequests/${id}`);
    assert.equal(doc.status, "withdrawn");
    assert.deepEqual(doc.history.map((entry) => entry.what), ["asked", "taken", "withdrawn"]);
    const late = await act("zach", "approve", id);
    assert.deepEqual([late.status, late.body.error], [409, words.REQUEST_REFUSAL.withdrawn]);
    assert.equal((await read("rahul")).body.requests.w01, undefined, "a withdrawn request shows nothing on the line");
  });

  test("approving corrects the line in the same transaction, with the request's reason and its id; nobody is emailed", async () => {
    const { id } = (await askDev()).body.request;
    assert.equal((await act("rahul", "approve", id)).status, 403, "a facilitator decides nothing");
    at("2026-11-11T10:20:00Z");
    const answer = await act("zach", "approve", id);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(stored().records.dev, "present");
    assert.equal(stored().corrected.dev.byUid, "zach");
    const doc = world.db.read(`courseRequests/${id}`);
    assert.deepEqual([doc.status, doc.decidedByUid], ["approved", "zach"]);
    const [row] = rows("attendance-edit");
    assert.equal(row.requestId, id);
    assert.equal(row.reason, REASON);
    assert.equal(row.detail, `Corrected week 1’s register: ${nameOf("dev")}, Absent to In the room. Asked by Rahul at 10:05am. Why: “${REASON}”`);
    // The asker reads it as asked, with their own reason; another facilitator without it.
    const asker = (await read("rahul")).body;
    assert.deepEqual([asker.requests.w01.dev.state, asker.corrections.w01.dev.asked.yours, asker.corrections.w01.dev.reason], ["approved", true, REASON]);
    const other = (await read("sofia")).body;
    assert.equal("reason" in other.corrections.w01.dev, false);
    assert.deepEqual(world.mail, []);
  });

  test("approving is refused, and the request stays waiting, when the line has changed since it was asked", async () => {
    const { id } = (await askDev()).body.request;
    assert.equal((await correct("claudia", { marks: [{ uid: "dev", status: "excused" }], reason: "Dev told me in advance." })).status, 200);
    const before = everything();
    const answer = await act("zach", "approve", id);
    assert.deepEqual([answer.status, answer.body.error], [409, words.lineChangedWords("Excused")]);
    assert.equal(everything(), before);
    assert.equal(world.db.read(`courseRequests/${id}`).status, "waiting");
  });

  test("declining needs a reply, which only the asker and the people who decide read", async () => {
    const { id } = (await askDev()).body.request;
    const empty = await act("claudia", "decline", id, {});
    assert.deepEqual([empty.status, empty.body.error], [400, words.REQUEST_REFUSAL.reply]);
    assert.equal((await act("claudia", "decline", id, { reply: "The sign-in sheet has Dev absent." })).status, 200);
    const doc = world.db.read(`courseRequests/${id}`);
    assert.deepEqual([doc.status, doc.decidedByUid, doc.reply], ["declined", "claudia", "The sign-in sheet has Dev absent."]);
    assert.equal(stored().records.dev, "absent", "declining changes nothing on the register");
    assert.equal((await read("rahul")).body.requests.w01.dev.reply, "The sign-in sheet has Dev absent.");
    assert.equal("reply" in (await read("sofia")).body.requests.w01.dev, false);
    assert.equal((await act("zach", "decline", id, { reply: "Again." })).body.error, words.REQUEST_REFUSAL.decided);
  });

  test("a run's track lead decides too; the person a request is about must be on the register", async () => {
    const { id } = (await askDev()).body.request;
    const answer = await act("yusuf", "approve", id);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(world.db.read(`courseRequests/${id}`).decidedByUid, "yusuf");
    const stranger = await ask("rahul", { uid: "bea", to: { status: "present" }, reason: REASON });
    assert.equal(stranger.status, 400, "a line of somebody in another group");
  });

  test("an ask is only about a session that happened, and its words and shape are checked before anything is read", async () => {
    const before = everything();
    for (const [body, error] of [
      [{ uid: "dev", to: { status: "absent", online: true }, reason: REASON }, words.REQUEST_REFUSAL.to],
      [{ uid: "dev", to: { status: "maybe" }, reason: REASON }, words.REQUEST_REFUSAL.to],
      [{ uid: "dev", to: { status: "present" }, reason: "x".repeat(301) }, "The reason must be 300 characters or fewer."],
      [{ uid: "dev", to: { status: "present" }, reason: REASON, extra: true }, words.REQUEST_REFUSAL.body],
    ]) {
      const answer = await ask("rahul", body);
      assert.deepEqual([answer.status, answer.body.error], [400, error], JSON.stringify(body));
    }
    assert.equal(everything(), before);
  });

  test("a missing request is one 403 for everybody but an admin, who is told it is missing", async () => {
    for (const action of ["withdraw", "approve", "decline", "take"]) {
      assert.equal((await act("zach", action, "nope")).status, 404, action);
      for (const who of ["claudia", "rahul", "amara"]) assert.equal((await act(who, action, "nope")).status, 403, `${who} ${action}`);
    }
  });

  test("the Requests page: admins every programme's, a lead their own, anybody else nothing", async () => {
    const { id } = (await askDev()).body.request;
    assert.equal((await act("claudia", "take", id)).status, 200);
    const asAdmin = await loaders.loadRequestsPage(world.courseDb, sessionOf("zach"), LATER);
    assert.equal(asAdmin.status, "ok");
    assert.deepEqual(asAdmin.view.counts, { waiting: 0, handling: 1, doneThisWeek: 0 });
    const [row] = asAdmin.view.rows;
    assert.deepEqual([row.state, row.from, row.to, row.weekNumber, row.group.name], ["handling", "Absent", "In the room", 1, "Group B"]);
    assert.ok(row.askedBy.name && row.subject.name && row.handling.name);
    const asLead = await loaders.loadRequestsPage(world.courseDb, sessionOf("claudia"), LATER);
    assert.deepEqual([asLead.status, asLead.view.viewer, asLead.view.rows.length], ["ok", "lead", 1]);
    assert.equal(asLead.view.rows[0].mine, true);
    assert.equal((await loaders.loadRequestsPage(world.courseDb, sessionOf("yusuf"), LATER)).view.rows.length, 1, "a track lead reads their run's");
    // The lead of another programme reads their own programme's, which has none.
    const otherLead = await loaders.loadRequestsPage(world.courseDb, sessionOf("tess"), LATER);
    assert.deepEqual([otherLead.status, otherLead.view.rows.length], ["ok", 0]);
    for (const who of ["rahul", "amara", "nobody"]) {
      assert.equal((await loaders.loadRequestsPage(world.courseDb, sessionOf(who), LATER)).status, "none", who);
    }
    at("2026-11-11T11:00:00Z");
    assert.equal((await act("zach", "approve", id)).status, 200);
    const after = await loaders.loadRequestsPage(world.courseDb, sessionOf("zach"), new Date());
    assert.deepEqual(after.view.counts, { waiting: 0, handling: 0, doneThisWeek: 1 });
  });

  test("the Requests page lists only what its reader can open: never a group the lead also facilitates, nor an archived one", async () => {
    const { id } = (await askDev()).body.request;
    assert.equal((await loaders.loadRequestsPage(world.courseDb, sessionOf("claudia"), LATER)).view.rows.length, 1);
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "claudia"] });
    const listed = await loaders.loadRequestsPage(world.courseDb, sessionOf("claudia"), LATER);
    assert.deepEqual([listed.status, listed.view.rows.length, listed.view.counts.waiting], ["ok", 0, 0]);
    assert.equal((await loaders.loadRequestPage(world.courseDb, sessionOf("claudia"), id)).status, "none", "the list offers what the page does not open");
    // An admin, and the run's track lead who does not facilitate it, still list it.
    assert.equal((await loaders.loadRequestsPage(world.courseDb, sessionOf("zach"), LATER)).view.rows.length, 1);
    assert.equal((await loaders.loadRequestsPage(world.courseDb, sessionOf("yusuf"), LATER)).view.rows.length, 1);
    assert.equal((await loaders.loadRequestPage(world.courseDb, sessionOf("yusuf"), id)).status, "ok");
    // An archived group's requests open for an admin only, so they are listed for an admin only.
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia"], archived: true });
    assert.equal((await loaders.loadRequestsPage(world.courseDb, sessionOf("yusuf"), LATER)).view.rows.length, 0);
    assert.equal((await loaders.loadRequestPage(world.courseDb, sessionOf("yusuf"), id)).status, "none");
    assert.equal((await loaders.loadRequestsPage(world.courseDb, sessionOf("zach"), LATER)).view.rows.length, 1);
  });

  test("the count beside Requests in a programme's head is what the list shows its reader: a lead who also facilitates the group counts none of its", async () => {
    await askDev();
    /** For each reader, the head's count and the list's waiting rows. */
    const both = async () => {
      const out = {};
      for (const who of ["zach", "claudia", "yusuf"]) {
        const list = await loaders.loadRequestsPage(world.courseDb, sessionOf(who), LATER);
        const listed = list.status === "ok" ? list.view.counts.waiting + list.view.counts.handling : 0;
        out[who] = [await requestsHome.requestsWaitingOnRun(world.courseDb, sessionOf(who), RUN.agi), listed];
      }
      return out;
    };
    assert.deepEqual(await both(), { zach: [1, 1], claudia: [1, 1], yusuf: [1, 1] });
    // Claudia, the programme's lead, also facilitates Group B: its request is not hers to open, so it is not counted.
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "claudia"] });
    assert.deepEqual(await both(), { zach: [1, 1], claudia: [0, 0], yusuf: [1, 1] });
    // An archived group's: an admin's alone.
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia"], archived: true });
    assert.deepEqual(await both(), { zach: [1, 1], claudia: [0, 0], yusuf: [0, 0] });
    // The head asks with its reader, and the list and the count ask one predicate.
    const layout = sourceOf("app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/layout.tsx");
    assert.match(layout, /await requestsWaitingOnRun\(db, user, programme\.runId\)/);
    assert.match(sourceOf("lib/courses/requests/home.ts"), /return waiting\.filter\(\(each\) => requestShownTo\(user, groups\.get\(each\.groupId\), runId\)\)\.length;/);
    assert.match(sourceOf("lib/courses/requests/load.ts"), /requests = requests\.filter\(\(each\) => requestShownTo\(actor, ctx\.groups\.get\(each\.groupId\), each\.runId\)\);/);
  });

  test("one request's page: the line now, why, who finished it, what approving does, its history; for the people who decide only", async () => {
    const { id } = (await askDev()).body.request;
    const page = await loaders.loadRequestPage(world.courseDb, sessionOf("claudia"), id);
    assert.equal(page.status, "ok");
    const view = page.view;
    assert.deepEqual([view.line.now, view.line.asAsked, view.reason], ["Absent", true, REASON]);
    assert.ok(view.finished && view.finished.by.uid === "rahul");
    assert.deepEqual(view.approving, { line: `${view.subject.name}: Absent to In the room`, figures: true, emailed: 0, toldOn: "register" });
    assert.deepEqual(view.history.map((entry) => entry.what), ["asked"]);
    assert.deepEqual([view.canDecide, view.canTake, view.yours], [true, true, false]);
    for (const who of ["rahul", "sofia", "amara", "tess"]) {
      assert.equal((await loaders.loadRequestPage(world.courseDb, sessionOf(who), id)).status, "none", who);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The whole column
// ---------------------------------------------------------------------------

describe("3. correcting the whole column", () => {
  test("held online: a preview changes nothing; the press moves every line in the room, stamps each and writes one row", async () => {
    const before = everything();
    const preview = await column("claudia", { kind: "online", preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.deepEqual([preview.body.preview.changes, preview.body.preview.staying.length, preview.body.preview.emailed], [1, 1, 0]);
    assert.equal(everything(), before);
    assert.equal((await column("rahul", { kind: "online", reason: "It was online." })).body.error, words.CORRECTION_REFUSAL.facilitator);
    assert.equal((await column("claudia", { kind: "online" })).body.error, words.CORRECTION_REFUSAL.reason);
    const answer = await column("claudia", { kind: "online", reason: "The room was locked, so we met online." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.changed, 1);
    assert.deepEqual([stored().online.amara, stored().records.dev], [true, "absent"]);
    assert.equal(stored().corrected.amara.byUid, "claudia");
    assert.equal(stored().corrected.dev, undefined);
    assert.equal(rollup("amara").online, 1);
    const [row] = rows("register-held-online");
    assert.deepEqual([row.before.amara, row.after.amara, row.sessionKey, row.lines], ["In the room", "Online", "w01", 1]);
    assert.equal(auditLib.normalizeCourseAudit("x", row).lines, 1);
    assert.equal((await column("claudia", { kind: "online", reason: "Again." })).status, 409);
    assert.equal((await read("claudia")).body.corrections.w01.amara.kind, "held-online");
    assert.deepEqual(world.mail, []);
  });

  test("cleared: back to not taken, every line kept in the row, the notes kept, and chased again", async () => {
    world.db.poke(W1, { notes: "A good session." });
    // The chase's marker for the session, and the card finishing archived.
    world.db.seed(`schedulerMarkers/regremind__${B}__w01__rahul`, { family: "regremind", sentAt: new Date() });
    const preview = await column("zach", { kind: "clear", preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.deepEqual([preview.body.preview.clears, preview.body.preview.stays.notesWith], [2, "w01"]);
    assert.ok(!JSON.stringify(preview.body).includes("A good session."), "a preview never carries a note's words");
    assert.ok(["returns", "passed", "off"].includes(preview.body.preview.chase.email));
    const answer = await column("zach", { kind: "clear", reason: "That was week 2's group." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const saved = stored();
    assert.deepEqual(saved.records, {});
    assert.equal(saved.pushedAt, undefined);
    assert.equal(saved.markedByUid, undefined);
    assert.equal(saved.notes, "A good session.", "a correction never destroys a note");
    assert.equal(attendanceLib.registerIsTaken(saved), false);
    const [row] = rows("register-cleared");
    assert.deepEqual([row.before.amara, row.before.dev, row.after.amara], ["In the room", "Absent", "Not set"]);
    assert.equal(world.db.read(`schedulerMarkers/regremind__${B}__w01__rahul`), undefined, "the chase's marker was taken away");
    assert.equal(rollup("amara").sessionsHeld, 0, "an unfinished register counts for nobody");
  });

  test("moved: the lines go to another week's session nobody took, and their own goes back to not taken", async () => {
    const preview = await column("claudia", { kind: "move", preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const w2 = preview.body.preview.targets.find((target) => target.weekNumber === 2);
    const w3 = preview.body.preview.targets.find((target) => target.weekNumber === 3);
    assert.deepEqual([w2.ok, w3.ok, w3.why], [true, false, "Week 3’s session hasn’t happened yet, so these lines can’t belong to it."]);
    assert.equal((await column("claudia", { kind: "move", to: { weekNumber: 3 }, reason: "x" })).status, 409);
    const answer = await column("claudia", { kind: "move", to: { weekNumber: 2 }, reason: "These were week 2's lines." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(stored(W2).records, { amara: "present", dev: "absent" });
    assert.equal(stored(W2).pushedByUid, "rahul");
    assert.deepEqual(Object.keys(stored(W2).corrected).sort(), ["amara", "dev"]);
    assert.deepEqual(stored(W1).records, {});
    assert.equal(attendanceLib.registerIsTaken(stored(W1)), false);
    const [row] = rows("register-moved");
    assert.deepEqual([row.sessionKey, row.toSessionKey, row.before.dev], ["w01", "w02", "Absent"]);
    assert.equal((await read("claudia")).body.corrections.w02.dev.movedFrom, "w01");
    // A register taken now cannot take them again.
    const back = await column("claudia", { kind: "move", weekNumber: 2, to: { weekNumber: 1 }, reason: "Back." });
    assert.equal(back.status, 200, "an untaken week can take them back");
    const again = await column("claudia", { kind: "move", to: { weekNumber: 2 }, reason: "x" });
    assert.equal(again.status, 200);
    assert.equal((await column("claudia", { kind: "move", weekNumber: 2, to: { weekNumber: 2 }, reason: "x" })).status, 400);
  });

  test("it didn't happen: keep pace, the lines cleared into the row, the session cancelled through the one-week change's logic", async () => {
    const date = "2026-11-03";
    const preview = await column("claudia", { kind: "did-not-happen", pace: "keep", dateKey: date, preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.preview.clearing.length, 2);
    const answer = await column("claudia", { kind: "did-not-happen", pace: "keep", dateKey: date, tell: false, reason: "Only two people came." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.update, null);
    const group = world.db.read(`courseGroups/${B}`);
    assert.equal(group.sessionChanges.w01.kind, "cancelled");
    assert.deepEqual(stored().records, {});
    assert.equal(stored().pushedAt, undefined);
    assert.equal(rows("session-did-not-happen").length, 1);
    assert.equal(rows("session-cancelled").length, 1);
    assert.equal(rollup("amara").sessionsHeld, 0);
    assert.deepEqual(world.mail, []);

    // It did happen after all: who was there, and it is back in every figure.
    const missing = await column("zach", { kind: "did-happen", lines: [{ uid: "amara", status: "present" }], reason: "It went ahead." });
    assert.equal(missing.status, 400);
    const done = await column("zach", {
      kind: "did-happen",
      lines: [
        { uid: "amara", status: "present" },
        { uid: "dev", status: "present", online: true },
      ],
      reason: "It went ahead in the end.",
    });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(world.db.read(`courseGroups/${B}`).sessionChanges?.w01, undefined);
    assert.deepEqual([stored().records.amara, stored().online.dev, stored().pushedByUid], ["present", true, "zach"]);
    assert.equal(stored().setBy.dev.how, "correction");
    assert.equal(rollup("amara").sessionsHeld, 1);
    assert.equal(rows("session-did-happen").length, 1);
  });

  test("it did happen is refused for a week whose cancel pushed the rest back", async () => {
    // Nobody took week 2's register, so its start may move with the rest.
    const answer = await column("claudia", { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", tell: false, reason: "Nobody came." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.change.newDateKey, "2026-11-10");
    assert.equal(world.db.read(`courseGroups/${B}`).sessionChanges.w01.kind, "pushed");
    assert.equal(stored().pushedAt, undefined, "the register is the later session's now, and not taken");
    const refused = await column("zach", { kind: "did-happen", lines: [], reason: "x" });
    assert.deepEqual([refused.status, refused.body.error], [409, words.CORRECTION_REFUSAL.pushedBack]);
  });

  test("it didn't happen, pushing the rest back, is refused when a later week's register was taken", async () => {
    at("2026-11-10T18:20:00Z");
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }], { weekNumber: 2 })).status, 200);
    at(LATER);
    const before = everything();
    const answer = await column("claudia", { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", tell: false, reason: "Nobody came." });
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.equal(everything(), before);
  });
  test("it did happen starts from each line: somebody who said in advance they couldn't make it stays Excused, and is not counted absent", async () => {
    // Dev tells us before week 2 that he can't make it; Rahul takes week 2's register and finishes it.
    at("2026-11-09T10:00:00Z");
    const said = await call("dev", cantMakeIt.POST, { groupId: B }, { body: { sessionKey: "w02", cantMakeIt: true } });
    assert.equal(said.status, 200, JSON.stringify(said.body));
    at("2026-11-10T18:20:00Z");
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }], { weekNumber: 2 })).status, 200);
    assert.equal((await finish("rahul", 2)).status, 200);
    at(LATER);
    const off = await column("claudia", { weekNumber: 2, kind: "did-not-happen", pace: "keep", dateKey: "2026-11-10", tell: false, reason: "Nobody came." });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.deepEqual(stored(W2).records, { dev: "excused" }, "what Dev said in advance stays");

    const preview = await column("zach", { weekNumber: 2, kind: "did-happen", preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const lineFor = (uid) => preview.body.preview.people.find((each) => each.uid === uid).line;
    assert.deepEqual([lineFor("dev"), lineFor("amara")], ["Excused", "Not set"]);
    // The sheet shows each line, starts Dev on it (Excused is offered), and starts Amara on nothing.
    assert.equal(pageWords.didHappenNowWords(lineFor("dev")), "Now: Excused");
    assert.equal(pageWords.choiceOfLine(lineFor("dev")).key, "excused");
    assert.ok(pageWords.didHappenChoicesFor(lineFor("dev")).some((choice) => choice.key === "excused"), "Excused is not offered");
    assert.equal(pageWords.choiceOfLine(lineFor("amara")), null);

    const done = await column("zach", {
      weekNumber: 2,
      kind: "did-happen",
      lines: [
        { uid: "amara", status: "present" },
        { uid: "dev", ...pageWords.lineBody(pageWords.choiceOfLine(lineFor("dev"))) },
      ],
      reason: "It went ahead in the end.",
    });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual(done.body.counts, { room: 1, online: 0, absent: 0, excused: 1 });
    assert.equal(stored(W2).records.dev, "excused");
    // Week 1's absence is Dev's only one: week 2 counts as excused, as he told us.
    assert.deepEqual([rollup("dev").absent, rollup("dev").excused], [1, 1]);
  });

  test("a move or a clear says who gets the register reminder and when while it goes again, and why not when its time has passed or the job is off", async () => {
    const preview = async (kind = "clear") => {
      const answer = await column("zach", { kind, preview: true });
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      return answer.body.preview;
    };
    const said = (shown, label) => pageWords.columnPreviewLines(shown, "Group B").find((row) => row.label === label)?.text ?? "";
    const NOBODY = "Nobody is emailed. Its facilitators see it on the register; the people see it on their own pages.";

    // Off: the reminders job ships switched off.
    const off = await preview();
    assert.deepEqual([off.chase.email, off.chase.emailTo, off.chase.emailFrom], ["off", null, null]);
    assert.equal(said(off, "Told"), NOBODY);
    assert.match(said(off, "Reminders"), /^The reminder email is switched off, so it doesn’t go\. The card /);
    assert.doesNotMatch(said(off, "Reminders").split(". The card")[0], /passed/, "a job switched off is said to have passed");

    // Switched on, the morning after week 2: week 1's reminder time has passed.
    world.db.seed("config/scheduler", { jobs: { "courses-register-reminders": { enabled: true } } });
    const passed = await preview();
    assert.deepEqual([passed.chase.email, passed.chase.emailTo], ["passed", null]);
    assert.equal(said(passed, "Told"), NOBODY);
    assert.match(said(passed, "Reminders"), /^The reminder email’s time for this session has passed, so it doesn’t go again\. /);

    // The morning after week 1: it goes again, to the group's facilitators, from 36 hours after the session ended.
    at("2026-11-04T10:00:00Z");
    const returns = await preview();
    assert.equal(returns.chase.email, "returns");
    assert.deepEqual([returns.chase.emailTo.kind, returns.chase.emailFrom], ["facilitators", "2026-11-05T08:00:00.000Z"]);
    assert.equal(
      said(returns, "Told"),
      "Its facilitators, Rahul and Sofia, get the register reminder email soon after 8am on Thu 5 Nov if it isn’t finished by then. Nobody else is emailed.",
    );
    assert.match(said(returns, "Reminders"), /^The reminder email goes again\. /);
    const moved = await preview("move");
    assert.equal(said({ ...moved, to: { weekNumber: 2, dateKey: "2026-11-10" } }, "Told"), said(returns, "Told"), "a move says otherwise");

    // A clear keeps the register's cover, so the reminder goes to whoever is covering it; a move takes the cover away.
    world.db.poke(W1, { cover: { kind: "self", byUid: "claudia", at: DURING_W1, covering: ["rahul", "sofia"] } });
    const covered = await preview();
    assert.equal(covered.chase.emailTo.kind, "cover-taker");
    assert.match(said(covered, "Told"), /^\S+, who took it in a facilitator’s place, gets the register reminder email soon after 8am on Thu 5 Nov if it isn’t finished by then\. Nobody else is emailed\.$/);
    assert.equal((await preview("move")).chase.emailTo.kind, "facilitators");
    // Held online changes no register's chase, and nobody is emailed.
    const online = (await column("zach", { kind: "online", preview: true })).body.preview;
    assert.equal(said(online, "Told"), NOBODY);
    assert.deepEqual(world.mail, [], "a preview emailed somebody");
  });

  test("it didn't happen cannot push the rest back once the session has a session report, in its preview and its press, in the one-week change's sentence; keep pace still goes", async () => {
    // Rahul writes week 1's report the day after it, while it is still open.
    at("2026-11-04T10:00:00Z");
    const reported = await call("rahul", reportRoute.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 3 } }, course: true });
    assert.equal(reported.status, 200, JSON.stringify(reported.body));
    at(LATER);
    const before = everything();
    for (const preview of [true, false]) {
      const refused = await column("claudia", {
        kind: "did-not-happen",
        pace: "push",
        dateKey: "2026-11-03",
        tell: false,
        reason: "Nobody came.",
        ...(preview ? { preview: true } : {}),
      });
      assert.deepEqual([refused.status, refused.body.error], [409, coverWords.pushHasRecordsWords(1)], `preview: ${preview}`);
    }
    assert.equal(everything(), before, "a refused push changed something");
    // Keep pace's preview says the report stays, in the one-week change's words, and its press goes.
    const kept = await column("claudia", { kind: "did-not-happen", pace: "keep", dateKey: "2026-11-03", preview: true });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    assert.equal(kept.body.preview.didNotHappen.reports, 1);
    assert.equal(
      pageWords.didNotHappenPreviewLines(kept.body.preview).find((row) => row.label === "Check-in, report").text,
      "1 session report was written. They are kept, and nothing more opens for it.",
    );
    assert.equal((await column("claudia", { kind: "did-not-happen", pace: "keep", dateKey: "2026-11-03", tell: false, reason: "Nobody came." })).status, 200);
    assert.equal(world.db.read(`courseGroups/${B}`).sessionChanges.w01.kind, "cancelled");
  });

  test("every refusal a push back meets is one the sheet does not offer, said in the group page's own words", async () => {
    // Every refusal of a push that keep pace does not meet, as the route has
    // them: its own (`pushRefusalOf`) and the one-week change's check of a push
    // (`checkPress`, its push case). The walk below covers each one, both ways.
    const column_ = sourceOf("lib/courses/registerCorrection/column.ts");
    const own = column_.slice(column_.indexOf("async function pushRefusalOf("), column_.indexOf("\n}\n", column_.indexOf("async function pushRefusalOf(")));
    const check = sourceOf("lib/courses/sessionChange/check.ts");
    const pushCase = check.slice(check.indexOf('case "push": {'), check.indexOf("return {", check.indexOf('case "push": {')));
    const sources = [
      ...[...own.matchAll(/error: ([A-Za-z.]+)/g)].map((m) => m[1]).filter((name) => name !== "err.message"),
      ...[...pushCase.matchAll(/ChangeRefusal\((REFUSAL\.\w+)/g)].map((m) => m[1]),
    ].sort();
    assert.ok(own.includes("if (err instanceof ChangeRefusal) return"), "the route no longer passes the one-week change's own push refusals on");
    // EVERY REFUSAL the route's own door makes, read from its source line by
    // line: each is met whatever the pace, or by a push alone, and a push's
    // alone is one this walk drives or one known never to be met. A new
    // refusal, in any spelling, fails here until it is one or the other.
    const doorAt = column_.indexOf("async function didNotHappen(");
    const door = column_.slice(doorAt, column_.indexOf("\n}\n", doorAt));
    const EVERY_PACE = {
      "if (session.occurrence !== 1) return refuse(400, secondSessionWords(session.weekNumber));": "a week's second session is never called off here",
      "if (why || !register) return refuse(409, why ?? CORRECTION_REFUSAL.noRegister);": "a register that is not finished, or none",
      "if (audience.refused) return refuse(400, REFUSAL.overCap);": "the optional notice, for either pace",
      "if (audience.recipients.length === 0) return refuse(400, REFUSAL.nobodyToEmail);": "the optional notice, for either pace",
      "return refuse(409, countChangedWords(audience.recipients.length), { emails: audience.recipients.length });": "the notice's count, for either pace",
      "if (err instanceof ChangeRefusal) return refuse(err.status, err.message, err.detail);":
        "passes on checkPress and refuseMovingMet: a push's own refusals in them are the push case and the later week met, walked here",
      "if (!groupSnap.exists) throw new ChangeRefusal(REFUSAL.gone, 400);": "the group is gone, for either pace",
      "if (fresh.archived || fresh.runId !== run.id) throw new ChangeRefusal(REFUSAL.gone, 400);": "the group is gone, for either pace",
      "if (again || !stored) throw new Refused(409, again ?? CORRECTION_REFUSAL.noRegister);": "the register stopped being finished, for either pace",
    };
    const PUSH_ONLY = {
      "if (press.pace === \"push\" && pushRefused) return refuse(pushRefused.status, pushRefused.error, pushRefused.detail);": "pushRefusalOf",
      "if (!checked.pushed) throw new ChangeRefusal(REFUSAL.noPlan, 400);": "REFUSAL.noPlan",
    };
    const sites = [...door.matchAll(/^.*(?:\breturn refuse\(|\bthrow new \w+\().*$/gm)].map((m) => m[0].trim()).sort();
    assert.deepEqual(sites, [...Object.keys(EVERY_PACE), ...Object.keys(PUSH_ONLY)].sort(), "the route refuses something this walk has not classified");
    // Every branch the door takes on which pace or which change it is, in either spelling.
    const PACE_BRANCHES = {
      "if (press.pace === \"push\" && pushRefused) return refuse(pushRefused.status, pushRefused.error, pushRefused.detail);": "the push's refusal, through pushRefusalOf",
      "if (change.kind === \"push\") {": "the push's write; its one refusal is REFUSAL.noPlan, known unreachable",
      "newDateKey: change.kind === \"push\" ? (checked.pushed?.newDateKey ?? null) : null,": "the answer's new date: no refusal",
    };
    const branches = [...door.matchAll(/^.*(?:[=!]== "(?:push|keep|cancel)"|"(?:push|keep|cancel)" [=!]==).*$/gm)].map((m) => m[0].trim()).sort();
    assert.deepEqual(branches, Object.keys(PACE_BRANCHES).sort(), "the door branches on the pace somewhere this walk has not read");
    // The two calls that throw on its behalf: the one-week change's check and the met session's.
    assert.equal((door.match(/\bcheckPress\(/g) ?? []).length, 2, "the door checks a press some other way");
    assert.equal((door.match(/\brefuseMovingMet\(/g) ?? []).length, 2, "the door refuses moving a met session some other way");

    /** A world in which a push back is refused for one reason. */
    const reasons = {
      pushHasRecordsWords: {
        set: async () => {
          at("2026-11-04T10:00:00Z");
          const reported = await call("rahul", reportRoute.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 3 } }, course: true });
          assert.equal(reported.status, 200, JSON.stringify(reported.body));
        },
        refused: [409, coverWords.pushHasRecordsWords(1)],
        why: coverWords.pushHasRecordsHint(1),
      },
      movesMetWords: {
        set: async () => {
          at("2026-11-10T18:20:00Z");
          assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }], { weekNumber: 2 })).status, 200);
        },
        refused: [409, changeWords.movesMetWords(2)],
        why: groupPageWords.PUSH_BACK_LATER_MET,
      },
      "REFUSAL.planFull": {
        set: async () => {
          // The group's own plan at the cap: a push adds a week's break, which it has no room for.
          const weeks = world.db.read(`courseRuns/${RUN.agi}`).weekPlan;
          const spare = Array.from({ length: 60 - weeks.length }, () => ({ kind: "break", label: "Spare" }));
          world.db.poke(`courseGroups/${B}`, { paceWeekPlan: [...weeks, ...spare] });
        },
        refused: [400, changeWords.REFUSAL.planFull],
        why: changeWords.REFUSAL.planFull,
      },
    };
    // Never met on this route: a session it reached is in the group's plan, which is what the session was resolved from;
    // and in the press's transaction, checkPress throws it a line before the door's own `if (!checked.pushed)`.
    const UNREACHABLE = { "REFUSAL.noPlan": "a session the route reached is a week of the group's plan" };
    assert.deepEqual(sources, [...Object.keys(reasons), ...Object.keys(UNREACHABLE)].sort(), "a push back has a refusal this walk does not cover");
    for (const source of Object.values(PUSH_ONLY)) {
      assert.ok(source === "pushRefusalOf" || source in reasons || source in UNREACHABLE, `${source}: a push's own refusal neither driven nor known unreachable`);
    }
    const transaction = door.slice(door.indexOf("const checked = checkPress(run, fresh, change, now, undefined);"));
    assert.ok(transaction.indexOf("const checked = checkPress(") < transaction.indexOf("if (!checked.pushed) throw"), "checkPress no longer comes first in the press's transaction");
    const plan = world.db.read(`courseRuns/${RUN.agi}`).weekPlan;
    for (const entry of plan.filter((each) => each.kind === "week")) {
      assert.ok(changeModel.planWithBreakBefore(plan, entry.weekNumber), `week ${entry.weekNumber} has a session and no place in the plan`);
    }

    const pushPress = { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", tell: false, reason: "Nobody came." };
    const keepPreview = { kind: "did-not-happen", pace: "keep", dateKey: "2026-11-03", preview: true };
    // With none of them, the sheet offers it.
    const offered = await column("claudia", keepPreview);
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
    assert.deepEqual(pageWords.pushChoiceOf(offered.body.preview), { offered: true, why: "" });
    for (const [source, reason] of Object.entries(reasons)) {
      await finishedWeekOne();
      await reason.set();
      at(LATER);
      const before = everything();
      // The press, and its preview, refuse it.
      for (const preview of [false, true]) {
        const refused = await column("claudia", { ...pushPress, ...(preview ? { preview: true } : {}) });
        assert.deepEqual([refused.status, refused.body.error], reason.refused, `${source}, preview: ${preview}`);
      }
      assert.equal(everything(), before, `${source}: a refused push changed something`);
      // Keep pace's preview, which the sheet asks first, says it is not offered, and why, in the group page's words.
      const kept = await column("claudia", keepPreview);
      assert.equal(kept.status, 200, `${source}: ${JSON.stringify(kept.body)}`);
      assert.deepEqual(pageWords.pushChoiceOf(kept.body.preview), { offered: false, why: reason.why }, source);
    }
    // Until a preview has said, nothing is offered.
    assert.deepEqual(pageWords.pushChoiceOf(null), { offered: false, why: "" });
  });

  test("pushed back, the Attendance line says the week meets a week later and its register is taken then; keep pace keeps its line", async () => {
    const pushed = await column("claudia", { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", preview: true });
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    const linesOf = (preview) => Object.fromEntries(pageWords.didNotHappenPreviewLines(preview).map((row) => [row.label, row.text]));
    const push = linesOf(pushed.body.preview);
    assert.equal(push.Attendance, "The session that didn’t happen leaves everyone’s attendance. Nobody is counted absent, and week 1’s register is taken at its new session.");
    assert.doesNotMatch(push.Attendance, /^Week 1 leaves everyone’s attendance/);
    assert.match(push.Dates, /^Week 1 meets on Tue 10 Nov at 6pm instead, and every week after it a week later\.$/);
    const kept = await column("claudia", { kind: "did-not-happen", pace: "keep", dateKey: "2026-11-03", preview: true });
    assert.equal(linesOf(kept.body.preview).Attendance, "Week 1 leaves everyone’s attendance. Nobody is counted absent.");
  });

  describe("a later week's cover, when the rest is pushed back", () => {
    const W3 = `courseAttendance/${RUN.agi}__${B}__w03`;
    const GIVEN_AT = new Date("2026-11-11T09:00:00Z");
    /** Week 3's register holds only a cover: Claudia was given it by Zach, and Rahul is recorded not there by it. */
    const givenWeekThree = () =>
      world.db.seed(W3, {
        runId: RUN.agi,
        groupId: B,
        weekNumber: 3,
        occurrence: 1,
        records: {},
        cover: { kind: "given", byUid: "claudia", at: GIVEN_AT, covering: ["rahul", "sofia"], grantedByUid: "zach", grantedAt: GIVEN_AT, until: new Date("2026-11-18T00:00:00Z") },
        facilitatorRecord: {
          rahul: { state: "not-there", byUid: "zach", at: GIVEN_AT, how: "cover" },
          sofia: { state: "there", byUid: "zach", at: GIVEN_AT, how: "changed" },
        },
      });
    const ENDS = "Claudia’s cover of week 3’s session ends: the session moves. Give it again if they can still take it.";
    const linesOf = (preview) => Object.fromEntries(pageWords.didNotHappenPreviewLines(preview).map((row) => [row.label, row.text]));

    test("the preview names it first and writes nothing; the press takes it off with the entries it wrote, and the row says who", async () => {
      givenWeekThree();
      const before = everything();
      const preview = await column("zach", { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", preview: true });
      assert.equal(preview.status, 200, JSON.stringify(preview.body));
      assert.deepEqual(preview.body.preview.coversEnd, [ENDS]);
      assert.equal(linesOf(preview.body.preview).Cover, ENDS);
      assert.equal(everything(), before, "the preview wrote something");
      const answer = await column("zach", { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", tell: false, reason: "Nobody came." });
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      const w3 = stored(W3);
      assert.equal(w3.cover, undefined, "week 3's cover rode along to its new evening");
      assert.equal(w3.facilitatorRecord?.rahul, undefined, "the cover's entry rode along");
      assert.equal(w3.facilitatorRecord?.sofia?.how, "changed", "an entry the cover did not write went too");
      const [row] = rows("session-pushed");
      assert.ok(row.detail.endsWith("Claudia was covering week 3 at its old time, so that cover is taken off."), row.detail);
    });

    test("kept pace, nothing moves: the cover stays, and neither the preview nor the row mentions it", async () => {
      givenWeekThree();
      const preview = await column("zach", { kind: "did-not-happen", pace: "keep", dateKey: "2026-11-03", preview: true });
      assert.deepEqual(preview.body.preview.coversEnd, []);
      assert.equal(linesOf(preview.body.preview).Cover, undefined);
      const answer = await column("zach", { kind: "did-not-happen", pace: "keep", dateKey: "2026-11-03", tell: false, reason: "Nobody came." });
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(stored(W3).cover.byUid, "claudia");
      assert.equal(stored(W3).facilitatorRecord.rahul.state, "not-there");
      for (const row of rows()) assert.doesNotMatch(row.detail ?? "", /was covering week 3/);
    });
  });

  test("pushed back, a finished register's cover and the record of whether each facilitator was there go into the history row", async () => {
    world.db.poke(W1, {
      cover: { kind: "self", byUid: "claudia", at: DURING_W1, covering: ["rahul", "sofia"] },
      facilitatorRecord: { rahul: { state: "there", byUid: "claudia", at: DURING_W1, how: "cover" } },
    });
    const preview = await column("claudia", { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(
      pageWords.didNotHappenPreviewLines(preview.body.preview).find((row) => row.label === "Check-in, report").text,
      "Nothing was opened or written for it. Week 1’s check-in and report are for its new session.",
    );
    const answer = await column("claudia", { kind: "did-not-happen", pace: "push", dateKey: "2026-11-03", tell: false, reason: "Nobody came." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const saved = stored();
    assert.deepEqual([saved.cover, saved.facilitatorRecord, saved.pushedAt], [undefined, undefined, undefined], "the next session's register opened with this one's");
    const [row] = rows("session-did-not-happen");
    assert.deepEqual(
      [row.before.amara, row.before.dev, row.before.cover, row.before.coverByUid, row.before["facilitator:rahul"]],
      ["Present", "Absent", "self", "claudia", "there"],
    );
    assert.match(row.detail, / was covering it\.$/);
  });

  test("a move that writes over somebody's own word on the other session keeps what it said in the history row", async () => {
    at("2026-11-09T10:00:00Z");
    const said = await call("dev", cantMakeIt.POST, { groupId: B }, { body: { sessionKey: "w02", cantMakeIt: true } });
    assert.equal(said.status, 200, JSON.stringify(said.body));
    at(LATER);
    assert.deepEqual(stored(W2).records, { dev: "excused" });
    const answer = await column("claudia", { kind: "move", to: { weekNumber: 2 }, reason: "These were week 2's lines." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(stored(W2).records.dev, "absent", "the moved line is week 2's now");
    const [row] = rows("register-moved");
    assert.deepEqual(
      [row.before.dev, row.after.dev, row.before["replaced:dev"], row.before["replaced:amara"], row.lines],
      ["Absent", "Absent", "Excused (said in advance)", undefined, 2],
    );
    assert.match(row.detail, /They replaced what was on week 2’s register: [^.]+ Excused \(said in advance\)\. Why: /);
    assert.equal(auditLib.normalizeCourseAudit("x", row).before["replaced:dev"], "Excused (said in advance)", "the history reads it back");
  });

  test("whether a week's second session happened is not changed here, and the door says so in a sentence of its own", async () => {
    // No stored group holds a second session yet (the group's normaliser does
    // not read `extraSession`), so the column's door is asked directly.
    const second = { weekNumber: 1, weekId: "w01", occurrence: 2, sessionKey: "w01-2", dateKey: "2026-11-05", cancelled: false };
    const before = everything();
    for (const raw of [
      { kind: "did-not-happen", occurrence: 2, pace: "keep", dateKey: "2026-11-05", tell: false, reason: "x" },
      { kind: "did-not-happen", occurrence: 2, pace: "keep", dateKey: "2026-11-05", preview: true },
      { kind: "did-happen", occurrence: 2, preview: true },
      { kind: "did-happen", occurrence: 2, lines: [], reason: "x" },
    ]) {
      const parsed = columnLib.parseColumnPress({ weekNumber: 1, ...raw });
      assert.ok(parsed.ok, JSON.stringify(parsed));
      const answer = await columnLib.correctColumn(
        { db: world.courseDb, actor: sessionOf("zach"), run: null, group: null, sessions: [second], session: second, members: [], now: LATER },
        parsed.value,
      );
      assert.deepEqual([answer.status, answer.body.error], [400, words.secondSessionWords(1)], JSON.stringify(raw));
    }
    assert.equal(everything(), before);
    assert.equal(words.secondSessionWords(1), "Whether a session happened is changed for a week’s first session only, and this is week 1’s second.");
  });

});

// ---------------------------------------------------------------------------
// 4. The group's attendance across every week
// ---------------------------------------------------------------------------

describe("4. the group's attendance across every week", () => {
  test("people by weeks with the two counts; corrected cells; the facilitator record only for the lead and admins", async () => {
    assert.equal((await correct("claudia", { marks: [{ uid: "dev", status: "present" }], reason: REASON })).status, 200);
    const asLead = await attendanceLoader.loadGroupAttendance(world.courseDb, sessionOf("claudia"), B, LATER);
    assert.equal(asLead.status, "ok");
    const dev = asLead.view.people.find((person) => person.uid === "dev");
    const cell = dev.cells.find((each) => each.weekNumber === 1);
    assert.deepEqual([cell.mark, cell.corrected, dev.room, dev.online], ["present", true, 1, 0]);
    const w1 = asLead.view.columns.find((each) => each.weekNumber === 1);
    assert.ok(w1.finished && w1.finished.name);
    assert.equal(w1.corrected, 1);
    assert.ok(Array.isArray(asLead.view.facilitators));
    assert.ok(asLead.view.facilitators.every((facilitator) => Array.isArray(facilitator.presence)), "the lead reads whether each facilitator was there");
    const asTrackLead = await attendanceLoader.loadGroupAttendance(world.courseDb, sessionOf("yusuf"), B, LATER);
    assert.ok(asTrackLead.view.facilitators.every((facilitator) => !("presence" in facilitator)), "a track lead by that alone does not");
    const asFacilitator = await attendanceLoader.loadGroupAttendance(world.courseDb, sessionOf("rahul"), B, LATER);
    assert.equal(asFacilitator.view.facilitators, null, "a facilitator is never sent the facilitators' row");
    assert.equal(asFacilitator.view.people.some((person) => person.uid === "rahul" || person.uid === "sofia"), false);
    for (const who of ["amara", "tom", "tess"]) {
      assert.equal((await attendanceLoader.loadGroupAttendance(world.courseDb, sessionOf(who), B, LATER)).status, "none", who);
    }
  });
});
