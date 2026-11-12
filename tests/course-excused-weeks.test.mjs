/**
 * Excused weeks: asking to be excused from a session, and an admin deciding
 * each week of it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/excused                      (ask)
 *   POST /api/courses/requests/[requestId]/excused/withdraw         (the asker)
 *   POST /api/courses/requests/[requestId]/excused/{approve,decline,reply}  (admins)
 *   GET  /api/courses/groups/[groupId]/attendance                   (the two facts)
 *   excusedFor, loadExcusedRequestPage, loadRequestsPage, loadGroupPage (the readers)
 *   deleteClosedReasons and its job                                  (the reason goes at close)
 *
 * ## What this guards
 *
 *  1. WHO ASKS: somebody holding a told place in the group, for its sessions,
 *     before a session or after it while its finished register says Absent,
 *     until the programme closes. Not a facilitator of the group, not staff,
 *     not anybody else.
 *  2. WHO DECIDES: admins only, never the person who asked. Not the
 *     programme's lead, not a track lead, not a facilitator.
 *  3. WHAT APPROVING DOES TO THE REGISTER, in one transaction with the
 *     decision: before the session the line reads exactly as the instant
 *     "Can't make it" leaves it (held to the readers that knew nothing of
 *     requests); after Finish, Absent becomes Excused as a correction made
 *     by the approval; a line that says they came is left alone; a
 *     facilitator's later mark wins. Declining and withdrawing change nothing.
 *  4. WHO IS SENT WHAT: the reason and how often reach admins only; a
 *     facilitator and a lead are sent one of two facts per person per
 *     session; a member is never sent a count.
 *  5. THE EMAILS: approved to the person (with the reply) and the group's
 *     facilitators (never the reason); declined and a reply to the person;
 *     asking and withdrawing email nobody. No meeting link.
 *  6. THE REASON GOES when the programme closes, leaving the decision; an
 *     open run loses nothing; twice is once.
 *
 * Real: the routes and every library under them. Stubbed: the session, the
 * Admin SDK handle, the view-as guard and the mail door.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
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
const made = makeWorld("__excusedWeeks", [["firebase-admin/firestore", FIRESTORE]]);
const { world, reset, call, everything, courseRoute, loadTs, sessionOf } = made;
const join_ = await loadJoin(made);
const askRoute = await courseRoute("groups", "[groupId]", "excused");
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const cantMakeItRoute = await courseRoute("groups", "[groupId]", "cant-make-it");
const regularRoute = await courseRoute("groups", "[groupId]", "session", "regular");
const timeAnswerRoute = await courseRoute("runs", "[runId]", "time-answer");
const someWeeksRoute = await courseRoute("runs", "[runId]", "enrolments", "[uid]", "time-answer");
const timeWords = await loadTs("lib/courses/timeAnswer/words.ts");
const emailsRoute = await courseRoute("requests", "emails");
const actions = {
  withdraw: await courseRoute("requests", "[requestId]", "excused", "withdraw"),
  approve: await courseRoute("requests", "[requestId]", "excused", "approve"),
  decline: await courseRoute("requests", "[requestId]", "excused", "decline"),
  reply: await courseRoute("requests", "[requestId]", "excused", "reply"),
};
const correctionApprove = await courseRoute("requests", "[requestId]", "approve");
const model = await loadTs("lib/courses/excused/model.ts");
const words = await loadTs("lib/courses/excused/words.ts");
const record = await loadTs("lib/firestore/courseExcusedRequests.ts");
const requestsLib = await loadTs("lib/firestore/courseRequests.ts");
const attendanceLib = await loadTs("lib/firestore/courseAttendance.ts");
const cantModel = await loadTs("lib/courses/cantMakeIt/model.ts");
const cantWords = await loadTs("lib/courses/cantMakeIt/words.ts");
const coverModel = await loadTs("lib/courses/registerCover/model.ts");
const sessionsLib = await loadTs("lib/courses/sessions.ts");
const own = await loadTs("lib/courses/excused/own.ts");
const page = await loadTs("lib/courses/excused/page.ts");
const tidy = await loadTs("lib/courses/excused/tidy.ts");
const loaders = await loadTs("lib/courses/requests/load.ts");
const home = await loadTs("lib/courses/requests/home.ts");
const history = await loadTs("lib/courses/groupHistory/load.ts");
const groupPage = await loadTs("lib/courses/groupPage/load.ts");
const jobModule = await loadTs("lib/scheduler/jobs/excusedReasonsOff.ts");
const courses = await loadTs("lib/firestore/courses.ts");
const groups = await loadTs("lib/firestore/courseGroups.ts");
const enrolments = await loadTs("lib/firestore/courseEnrolments.ts");

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const PLACED_ON = new Date("2026-10-27T17:38:00Z");
/** Monday 9 Nov, before Group B's week 2 session (Tue 10 Nov, 6pm to 8pm London, GMT). */
const BEFORE_W2 = new Date("2026-11-09T09:40:00Z");
/** During week 2's session. */
const DURING_W2 = new Date("2026-11-10T18:20:00Z");
/** The morning after week 2. */
const AFTER_W2 = new Date("2026-11-11T09:30:00Z");
/** After the programme closed: its last session is Wed 9 Dec (Group C), and work closes 14 days after. */
const CLOSED = new Date("2026-12-24T00:00:01Z");
mock.timers.enable({ apis: ["Date"], now: PLACED_ON });
const at = (when) => mock.timers.setTime(new Date(when).getTime());

const REASON = "An appointment on Tuesday evening that I can't move.";
const REPLY = "Hope the appointment goes well.";
const W2 = `courseAttendance/${RUN.agi}__${B}__w02`;
const stored = (path = W2) => world.db.read(path) ?? null;
const requestDocs = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseRequests/"))
    .map((path) => ({ id: path.split("/")[1], ...world.db.read(path) }));
const auditRows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => world.db.read(path))
    .filter((row) => !kind || row.kind === kind);
const rollup = (uid) => world.db.read(`courseEnrolments/${RUN.agi}__${uid}`).attendance;

/** Everything the form asks a person to confirm, ticked, as the form sends it. */
const CONFIRMED = { inPerson: true, ownOnline: true, otherOnline: true };
/** An ask as the form sends it: the confirmations ticked unless the test says otherwise (`raw` sends the body as it is). */
const ask = (who, body, groupId = B, opts = {}) =>
  call(who, askRoute.POST, { groupId }, { body: opts.raw ? body : { ...CONFIRMED, ...body }, course: true, ...opts });
const act = (who, action, requestId, body) => call(who, actions[action].POST, { requestId }, { body: body ?? {}, course: true });
const mark = (who, weekNumber, marks) => call(who, register.POST, { groupId: B }, { body: { weekNumber, marks }, course: true });
const finish = (who, weekNumber) => call(who, push.POST, { groupId: B }, { body: { weekNumber }, course: true });
const readRegister = (who) => call(who, register.GET, { groupId: B }, { course: true });

async function mailText() {
  return Promise.all(
    world.mail.map(async (message) => ({
      to: message.to,
      subject: message.subject,
      kind: message.kind,
      html: await render(message.react),
    })),
  );
}

/** Amara and Dev placed in Group B and told; the clock is Monday before week 2. */
async function placed() {
  at(PLACED_ON);
  reset(leadSeed(), { now: () => new Date() });
  assert.equal((await join_.press()).status, 200);
  const done = await join_.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: C },
  ]);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal((await join_.publish("zach")).status, 200);
  at(BEFORE_W2);
  world.mail.length = 0;
}

/** Amara asks to be excused from week 2, before it. */
async function amaraAsks(keys = ["w02"], { keepMail = false } = {}) {
  const answer = await ask("amara", { sessionKeys: keys, reason: REASON });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  // Asking emails the admins alone, never the reason; the decisions' own
  // emails are what the tests after it count.
  assertOnlyAdminsTold();
  if (!keepMail) world.mail.length = 0;
  return answer.body.request.id;
}

/** Every message so far is the admins' "a request has arrived", to an admin, without the reason. */
function assertOnlyAdminsTold() {
  for (const message of world.mail) {
    assert.equal(message.kind, "course-request", `asking sent a ${message.kind}`);
    const to = world.db
      .paths()
      .filter((path) => path.startsWith("users/"))
      .map((path) => world.db.read(path))
      .find((user) => user?.email === message.to);
    assert.equal(to?.role, "admin", `asking emailed ${message.to}, who is not an admin`);
  }
}

/** A seat like Amara's, for somebody else, in a group: a facilitator who holds a place, or an admin who does. */
function seatLike(uid, groupId = B) {
  const seat = structuredClone(world.db.read(`courseEnrolments/${RUN.agi}__amara`));
  world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, { ...seat, uid, groupId });
}

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

describe("the arithmetic: what a press says, which sessions may be asked about, what approving writes", () => {
  test("an ask is sessions and one short line, nothing else", () => {
    assert.deepEqual(model.parseAsk({ sessionKeys: ["w02", "w03"], reason: " A few words. ", inPerson: true, otherOnline: true }), {
      ok: true,
      value: { sessionKeys: ["w02", "w03"], reason: "A few words.", confirmed: { inPerson: true, ownOnline: false, otherOnline: true } },
    });
    // The confirmations are plain booleans, missing reads as not confirmed, anything else is no ask.
    assert.deepEqual(model.parseAsk({ sessionKeys: ["w02"], reason: "x" }).value.confirmed, { inPerson: false, ownOnline: false, otherOnline: false });
    for (const odd of ["yes", 1, null, {}]) {
      assert.equal(model.parseAsk({ sessionKeys: ["w02"], reason: "x", ownOnline: odd }).error, words.EXCUSED_REFUSAL.body, JSON.stringify(odd));
    }
    assert.equal(model.parseAsk(null).error, words.EXCUSED_REFUSAL.body);
    assert.equal(model.parseAsk({ sessionKeys: [], reason: "x" }).error, words.EXCUSED_REFUSAL.weeks);
    assert.equal(model.parseAsk({ sessionKeys: ["w2"], reason: "x" }).error, words.EXCUSED_REFUSAL.weeks);
    assert.equal(model.parseAsk({ sessionKeys: ["w02", "w02"], reason: "x" }).error, words.EXCUSED_REFUSAL.sameWeek);
    assert.equal(
      model.parseAsk({ sessionKeys: Array.from({ length: 11 }, (_, i) => `w${String(i + 1).padStart(2, "0")}`), reason: "x" }).error,
      words.EXCUSED_REFUSAL.tooMany,
    );
    assert.equal(model.parseAsk({ sessionKeys: ["w02"], uid: "dev", reason: "x" }).error, words.EXCUSED_REFUSAL.body, "nobody asks for anybody else");
    assert.equal(model.parseAsk({ sessionKeys: ["w02"] }).error, words.EXCUSED_REFUSAL.reason);
    assert.equal(model.parseAsk({ sessionKeys: ["w02"], reason: "   " }).error, words.EXCUSED_REFUSAL.reason);
    assert.equal(model.parseAsk({ sessionKeys: ["w02"], reason: 4 }).error, words.EXCUSED_REFUSAL.reasonText);
    assert.equal(model.parseAsk({ sessionKeys: ["w02"], reason: "one\ntwo" }).error, words.EXCUSED_REFUSAL.reasonLine);
    assert.equal(model.parseAsk({ sessionKeys: ["w02"], reason: "see example.com/why" }).error, words.EXCUSED_REFUSAL.reasonLink);
    assert.equal(model.parseAsk({ sessionKeys: ["w02"], reason: "x".repeat(201) }).error, "The reason must be 200 characters or fewer.");
  });

  test("a decision names one week; a decline needs a reply, an approval does not", () => {
    assert.deepEqual(model.parseDecision({ sessionKey: "w02" }, { replyNeeded: false }), { ok: true, value: { sessionKey: "w02", reply: "" } });
    assert.equal(model.parseDecision({ sessionKey: "w02" }, { replyNeeded: true }).error, words.EXCUSED_REFUSAL.reply);
    assert.equal(model.parseDecision({}, { replyNeeded: false }).error, words.EXCUSED_REFUSAL.week);
    assert.equal(model.parseDecision({ sessionKey: "w02", reply: "a\nb" }, { replyNeeded: false }).error, words.EXCUSED_REFUSAL.replyLine);
    assert.equal(model.parseReplyPress({}).error, words.EXCUSED_REFUSAL.replyEmpty);
    assert.deepEqual(model.parseWithdraw(null), { ok: true, value: { sessionKey: null } });
    assert.deepEqual(model.parseWithdraw({ sessionKey: "w03" }), { ok: true, value: { sessionKey: "w03" } });
    assert.equal(model.parseWithdraw({ who: "dev" }).error, words.EXCUSED_REFUSAL.body);
  });

  test("which sessions may be asked about: before, or after while a finished register says Absent", () => {
    const starts = new Date("2026-11-10T18:00:00Z");
    const before = new Date("2026-11-10T17:00:00Z");
    const after = new Date("2026-11-10T21:00:00Z");
    const line = (over = {}) => ({ finished: false, notHeld: false, mark: null, ...over });
    const state = (over) => model.askState({ startsAt: starts, cancelled: false, line: line(), standing: null, now: before, ...over });
    assert.deepEqual(state({}), { open: true, when: "before" });
    assert.deepEqual(state({ cancelled: true }), { open: false, why: "cancelled" });
    assert.deepEqual(state({ startsAt: null }), { open: false, why: "undated" });
    assert.deepEqual(state({ line: line({ notHeld: true }) }), { open: false, why: "not-held" });
    assert.deepEqual(state({ standing: "waiting" }), { open: false, why: "waiting" });
    assert.deepEqual(state({ standing: "approved" }), { open: false, why: "approved" });
    assert.deepEqual(state({ line: line({ mark: "excused" }) }), { open: false, why: "excused" });
    assert.deepEqual(state({ line: line({ mark: "present" }) }), { open: false, why: "came" });
    // After it starts, a draft says nothing of its marks.
    assert.deepEqual(state({ now: after, line: line({ mark: "present" }) }), { open: false, why: "not-finished" });
    assert.deepEqual(state({ now: after, line: line({ mark: "absent" }) }), { open: false, why: "not-finished" });
    assert.deepEqual(state({ now: after, line: line({ finished: true, mark: "absent" }) }), { open: true, when: "after" });
    assert.deepEqual(state({ now: after, line: line({ finished: true, mark: "late" }) }), { open: false, why: "came" });
    assert.deepEqual(state({ now: after, line: line({ finished: true, mark: "excused" }) }), { open: false, why: "excused" });
    assert.deepEqual(state({ now: after, line: line({ finished: true }) }), { open: false, why: "not-absent" });
  });

  test("what approving writes: as Can't make it before, Absent to Excused after Finish, never over a line that came", () => {
    const starts = new Date("2026-11-10T18:00:00Z");
    const before = new Date("2026-11-10T17:00:00Z");
    const after = new Date("2026-11-10T21:00:00Z");
    const plan = (now, over = {}, cancelled = false) =>
      model.approvalPlan({ startsAt: starts, cancelled, line: { finished: false, notHeld: false, mark: null, ...over }, now });
    assert.deepEqual(plan(before), { write: "in-advance", outcome: "written", say: "before", tellsFacilitators: true });
    assert.equal(plan(after).write, "draft");
    assert.equal(plan(after, { mark: "absent" }).write, "draft");
    assert.deepEqual(plan(after, { finished: true, mark: "absent" }), { write: "correct", outcome: "corrected", say: "excused-now", tellsFacilitators: true });
    for (const came of ["present", "late", "left-early"]) {
      assert.deepEqual(plan(after, { finished: true, mark: came }), { write: "keep", outcome: "kept", say: "came", tellsFacilitators: false, kept: "came" });
      assert.equal(plan(after, { mark: came }).write, "keep", "a facilitator's draft entry wins");
    }
    assert.equal(plan(after, { finished: true, mark: "excused" }).kept, "excused");
    assert.equal(plan(after, { finished: true }).kept, "no-line");
    assert.equal(plan(before, {}, true).kept, "not-held");
    assert.equal(plan(after, { finished: true, notHeld: true, mark: "absent" }).kept, "not-held");
    // What the email may say: "you were there" only from a finished register,
    // and a finished register with no line for them says so, never Excused.
    assert.equal(plan(after, { mark: "present" }).say, "being-taken", "a draft's mark is told to the member");
    assert.equal(plan(after, { finished: true }).say, "no-line");
  });

  test("the approval email never says something untrue about the register: no line, a full register, a register still being taken", () => {
    const words_ = (outcome) =>
      words.approvedEmailWords({ weekNumber: 2, occurrence: 1, groupName: "Group B", when: "Tue 10 Nov, 6pm", deciderFirstName: "Zach", reply: "", outcome, facilitatorFirstNames: [] }).after[0];
    assert.equal(words_("no-line"), "That session’s register was finished without a line for you, so it stays as it is. Week 2’s work is still open on your programme page.");
    assert.equal(words_("full"), "That session’s register has no room for another line, so it stays as it is. Week 2’s work is still open on your programme page.");
    assert.equal(
      words_("being-taken"),
      "Your facilitators are still taking that session’s register, and what they put there stands. Week 2’s work is still open on your programme page.",
    );
    for (const outcome of ["no-line", "full", "being-taken"]) {
      assert.doesNotMatch(words_(outcome), /says Excused|you were there/, outcome);
    }
    assert.match(words_("came"), /^Your register says you were there/);
  });

  test("the one fact: waiting, else excused, else nothing; a request's status follows its weeks", () => {
    const req = (weeks) => ({ id: "r", subjectUid: "amara", askedAt: new Date(1), weeks: weeks.map(([sessionKey, status, ms = 2]) => ({ sessionKey, status, decidedAt: new Date(ms), withdrawnAt: null })) });
    const requests = [req([["w02", "declined", 5]]), req([["w02", "waiting"]])];
    assert.equal(model.factOf(model.weeksAbout(requests, "amara", "w02")), "waiting");
    assert.equal(model.factOf(model.weeksAbout([req([["w02", "approved"]])], "amara", "w02")), "excused");
    assert.equal(model.factOf(model.weeksAbout([req([["w02", "declined"]])], "amara", "w02")), null);
    assert.equal(model.factOf(model.weeksAbout([req([["w02", "withdrawn"]])], "amara", "w02")), null);
    assert.equal(model.factOf(model.weeksAbout([req([["w02", "approved"]])], "dev", "w02")), null);
    assert.equal(record.excusedStatusOf([{ status: "approved" }, { status: "waiting" }]), "waiting");
    assert.equal(record.excusedStatusOf([{ status: "declined" }, { status: "approved" }]), "approved");
    assert.equal(record.excusedStatusOf([{ status: "declined" }, { status: "withdrawn" }]), "declined");
    assert.equal(record.excusedStatusOf([{ status: "withdrawn" }]), "withdrawn");
  });

  test("the kinds of being excused, told apart: approved, said when the time was set, said in advance, and before requests only when it was", () => {
    const told = new Date("2026-11-01T10:00:00Z");
    assert.equal(model.excusedKindOf({ approved: true, mark: "present", toldAt: null, ticked: false }), "approved");
    assert.equal(model.excusedKindOf({ approved: false, mark: "excused", toldAt: told, ticked: true }), "time-set");
    // Told before requests began: before requests. Told since, or a tick kept from an earlier asking: said in advance.
    assert.equal(model.excusedKindOf({ approved: false, mark: "excused", toldAt: told, ticked: false }), "before-requests");
    assert.equal(model.excusedKindOf({ approved: false, mark: "excused", toldAt: model.REQUESTS_BEGAN, ticked: false }), "in-advance");
    assert.equal(model.excusedKindOf({ approved: false, mark: "excused", toldAt: new Date("2026-11-20T10:00:00Z"), ticked: false }), "in-advance");
    assert.equal(model.excusedKindOf({ approved: false, mark: "excused", toldAt: told, ticked: false, tickedBefore: true }), "in-advance");
    assert.equal(model.REQUESTS_BEGAN.toISOString(), "2026-11-12T00:00:00.000Z");
    assert.equal(model.excusedKindOf({ approved: false, mark: "excused", toldAt: null, ticked: false }), null, "a facilitator's own Excused is the register's");
    assert.equal(words.excusedKindWords("before-requests"), "Said in advance, before requests");
    assert.equal(words.excusedKindWords("in-advance"), "Said in advance");
    assert.equal(words.excusedKindWords("time-set"), "Said when the time was set");
    assert.equal(words.timesThisTermWords(1), "Once this term.");
    assert.equal(words.timesThisTermWords(0), "Never, this term.");
  });

  test("the words: what approving will do, who it emails, and the emails' first lines, never a dash", () => {
    assert.equal(words.toldWords("Grace", ["Rahul"]), "2 emails: Grace, with your reply; and Rahul, without the reason.");
    assert.equal(words.toldWords("Grace", []), "1 email: Grace, with your reply.");
    assert.equal(words.toldWords(null, []), "Nobody is emailed.");
    assert.equal(
      words.approvingWords({ write: "in-advance", started: false, personFirstName: "Grace", facilitatorFirstNames: ["Rahul"] }),
      "The register says Excused for Grace, with nothing for Rahul to do.",
    );
    assert.equal(
      words.approvingWords({ write: "correct", started: true, personFirstName: "Tom", facilitatorFirstNames: ["Nadia"] }),
      "The register is already finished and says Absent: approving changes it to Excused and logs it in the group’s history.",
    );
    assert.match(words.approvingWords({ write: "keep", kept: "came", started: true, personFirstName: "Tom", facilitatorFirstNames: [] }), /was there, so it stays as it is/);
    assert.equal(words.approveButtonWords(2, ""), "Approve and email 2 people");
    assert.equal(words.declineButtonWords("Grace"), "Decline and email Grace");
    assert.equal(words.sendTheRequestWords(2), "Send the request for 2 weeks");
    const approved = words.approvedEmailWords({
      weekNumber: 2,
      occurrence: 1,
      groupName: "Group C",
      when: "Wed 11 Nov, 3pm",
      deciderFirstName: "Zach",
      reply: "Hope the appointment goes well.",
      outcome: "before",
      facilitatorFirstNames: ["Rahul"],
    });
    assert.deepEqual(approved, {
      subject: "You’re excused from week 2",
      before: ["Zach approved your request to be excused from Group C’s week 2 session, Wed 11 Nov, 3pm."],
      quote: "Zach says: “Hope the appointment goes well.”",
      after: ["Week 2’s work is still due by your session, and its reminders still come until it’s done. If you can come after all, just come along."],
      button: "Open your programme page",
      footnote: "Rahul is told you’re excused, but not why.",
    });
    const facilitators = words.facilitatorsEmailWords({ personName: "Grace Chen", personFirstName: "Grace", weekNumber: 2, occurrence: 1, day: "Wed 11 Nov", already: false });
    assert.equal(facilitators.subject, "Grace Chen is excused from week 2");
    assert.deepEqual(facilitators.before, ["Your register will show Grace as excused for Wed 11 Nov. There’s nothing for you to do."]);
    const declined = words.declinedEmailWords({ weekNumber: 3, occurrence: 1, day: "Wed 18 Nov", deciderFirstName: "Zach", reply: "No.", session: "absent" });
    assert.equal(declined.subject, "About your request for week 3");
    assert.deepEqual(declined.before, ["Your request to be excused from Wed 18 Nov wasn’t approved."]);
    assert.deepEqual(declined.after, ["The register says Absent for that session, and week 3’s work is still open."]);
    const all = JSON.stringify([approved, facilitators, declined, words.EXCUSED_REFUSAL, words.replyEmailWords({ weekNumbers: [2, 3], deciderFirstName: "Zach", reply: "Hi.", waiting: true })]);
    assert.doesNotMatch(all, /[\u2013\u2014]/, "a dash in the words");
  });

  test("an excused request is read only by its own normaliser, so no correction reader can mistake it for one", () => {
    const doc = {
      kind: "excused",
      status: "waiting",
      runId: RUN.agi,
      groupId: B,
      subjectUid: "amara",
      askedByUid: "amara",
      reason: REASON,
      reasonHeld: true,
      change: { weeks: [{ sessionKey: "w02", status: "waiting" }, { sessionKey: "w02", status: "waiting" }, { sessionKey: "nope", status: "waiting" }] },
    };
    assert.equal(requestsLib.normalizeCourseRequest("r", doc), null, "the correction normaliser reads an excused request");
    assert.deepEqual(requestsLib.COURSE_REQUEST_KINDS, ["register-correction"]);
    const read = record.normalizeExcusedRequest("r", doc);
    assert.deepEqual(read.weeks.map((week) => week.sessionKey), ["w02"], "a garbled or repeated week is dropped");
    assert.equal(read.reasonHeld, true);
    assert.equal(record.normalizeExcusedRequest("r", { ...doc, kind: "register-correction" }), null);
    assert.equal(record.normalizeExcusedRequest("r", { ...doc, change: { weeks: [] } }), null);
    assert.equal(record.normalizeExcusedRequest("r", { ...doc, reason: "", reasonHeld: true }).reasonHeld, false);
  });
});

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

describe("asking: somebody holding a told place, for their own group's sessions, and nothing on a register", () => {
  beforeEach(placed);

  test("Amara asks about week 2: one request, waiting, nothing on the register, the admins alone emailed", async () => {
    const answer = await ask("amara", { sessionKeys: ["w02"], reason: REASON });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(Object.keys(answer.body).sort(), ["ok", "request"]);
    assert.deepEqual(answer.body.request.weeks, [
      { sessionKey: "w02", weekNumber: 2, occurrence: 1, dateKey: "2026-11-10", asked: "before", state: "waiting" },
    ]);
    const [doc] = requestDocs();
    assert.equal(doc.kind, "excused");
    assert.equal(doc.status, "waiting");
    assert.deepEqual([doc.subjectUid, doc.askedByUid, doc.runId, doc.groupId], ["amara", "amara", RUN.agi, B]);
    assert.equal(doc.reason, REASON);
    assert.equal(doc.reasonHeld, true);
    assert.equal(doc.change.weeks[0].offered.online, true, "joining online was open to her first");
    assert.equal(stored(), null, "a waiting request holds no register up");
    // The admins are told, and nobody else: not Amara, not her facilitators.
    assert.deepEqual(world.mail.map((message) => [message.to, message.kind]), [[world.db.read("users/zach").email, "course-request"]]);
  });

  test("several weeks in one request, each waiting on its own", async () => {
    const answer = await ask("amara", { sessionKeys: ["w03", "w02"], reason: REASON });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.request.weeks.map((week) => week.sessionKey), ["w02", "w03"]);
    assert.equal(requestDocs()[0].sessionKey, "w02");
  });

  test("not twice for a week that waits, nor for one already excused; a facilitator of the group keeps Can't make it", async () => {
    await amaraAsks();
    const again = await ask("amara", { sessionKeys: ["w03", "w02"], reason: REASON });
    assert.deepEqual([again.status, again.body.error], [409, "You’ve already asked to be excused from week 2, and it’s waiting."]);
    assert.equal(requestDocs().length, 1, "a refused ask writes nothing");
    // Dev says Can't make it on week 3 the old way: asking adds nothing.
    assert.equal((await call("dev", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w03", cantMakeIt: true }, course: true })).status, 200);
    const told = await ask("dev", { sessionKeys: ["w03"], reason: REASON });
    assert.deepEqual([told.status, told.body.error], [409, "You’re already excused from week 3."]);
    // Rahul facilitates Group B and holds a place in it.
    seatLike("rahul");
    const fac = await ask("rahul", { sessionKeys: ["w02"], reason: REASON });
    assert.deepEqual([fac.status, fac.body.error], [403, words.EXCUSED_REFUSAL.facilitates]);
  });

  test("nobody else asks: staff, another group's people, somebody on nothing, signed out, view-as", async () => {
    for (const who of ["zach", "claudia", "yusuf", "rahul", "bea", "nobody"]) {
      const answer = await ask(who, { sessionKeys: ["w02"], reason: REASON });
      assert.deepEqual([answer.status, answer.body.error], [404, words.EXCUSED_REFUSAL.notYours], who);
    }
    assert.equal((await ask(null, { sessionKeys: ["w02"], reason: REASON })).status, 401);
    assert.equal((await ask("amara", { sessionKeys: ["w02"], reason: REASON }, B, { viewAs: true })).status, 403);
    assert.equal((await ask("amara", { sessionKeys: ["w02"], reason: REASON }, "missing-group")).status, 404);
    assert.equal((await ask("amara", { sessionKeys: ["w09"], reason: REASON })).status, 400);
    assert.deepEqual(requestDocs(), []);
  });

  test("after the session: only once its register is finished and says Absent", async () => {
    at(DURING_W2);
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "present" }])).status, 200);
    at(AFTER_W2);
    const early = await ask("amara", { sessionKeys: ["w02"], reason: REASON });
    assert.deepEqual([early.status, early.body.error], [409, "Week 2’s session has started. You can ask once its register is finished, if it says you were absent."]);
    const devEarly = await ask("dev", { sessionKeys: ["w02"], reason: REASON });
    assert.equal(devEarly.body.error, early.body.error, "a draft's marks are never said to the person");
    assert.equal((await finish("rahul", 2)).status, 200);
    world.mail.length = 0;
    const came = await ask("dev", { sessionKeys: ["w02"], reason: REASON });
    assert.deepEqual([came.status, came.body.error], [409, "Week 2’s register says you came, so there’s nothing to be excused from."]);
    const answer = await ask("amara", { sessionKeys: ["w02"], reason: "I was ill." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.request.weeks[0].asked, "after");
    assert.equal(requestDocs()[0].change.weeks[0].offered.online, false);
  });

  test("until the programme closes", async () => {
    at(CLOSED);
    const answer = await ask("amara", { sessionKeys: ["w02"], reason: REASON });
    assert.deepEqual([answer.status, answer.body.error], [409, words.EXCUSED_REFUSAL.closed]);
  });
});

// ---------------------------------------------------------------------------
// What they confirm before asking
// ---------------------------------------------------------------------------

describe("confirming before asking: the route asks for what the form showed, by the form's own rule", () => {
  beforeEach(placed);

  test("the rule: in person and another group online always; their own group online only where it is a real choice", () => {
    assert.equal(model.onlineOfferedFor({ when: "before", heldOnline: false }), true, "in a room, before it");
    assert.equal(model.onlineOfferedFor({ when: "before", heldOnline: true }), false, "online already");
    assert.equal(model.onlineOfferedFor({ when: "after", heldOnline: false }), false, "after it, nothing to join");
    const coming = (onlineOffered) => ({ upcoming: true, onlineOffered });
    const PAST = { upcoming: false, onlineOffered: false };
    assert.deepEqual(model.confirmationsNeeded([coming(true)]), { inPerson: true, ownOnline: true, otherOnline: true });
    assert.deepEqual(model.confirmationsNeeded([coming(false)]), { inPerson: true, ownOnline: false, otherOnline: true });
    assert.deepEqual(model.confirmationsNeeded([coming(false), coming(true)]).ownOnline, true, "one week of several is enough");
    // A session already past is confirmed nothing about; with one to come beside it, that one is.
    assert.deepEqual(model.confirmationsNeeded([PAST]), { inPerson: false, ownOnline: false, otherOnline: false });
    assert.deepEqual(model.confirmationsNeeded([PAST, coming(true)]), { inPerson: true, ownOnline: true, otherOnline: true });
    assert.deepEqual(model.confirmationsNeeded([]), { inPerson: false, ownOnline: false, otherOnline: false });
    const all = { inPerson: true, ownOnline: true, otherOnline: true };
    assert.equal(model.missingConfirmation(all, all), null);
    // In the form's order: the first one missing is the one said.
    assert.equal(model.missingConfirmation(all, { inPerson: false, ownOnline: false, otherOnline: false }), words.EXCUSED_REFUSAL.confirmInPerson);
    assert.equal(model.missingConfirmation(all, { ...all, ownOnline: false }), words.EXCUSED_REFUSAL.confirmOwnOnline);
    assert.equal(model.missingConfirmation({ ...all, ownOnline: false }, { ...all, ownOnline: false }), null, "a line not shown is not asked for");
  });

  test("a session in a room, before it: each of the three missing is refused in one sentence, and nothing is written or sent", async () => {
    for (const [left, sentence] of [
      ["inPerson", words.EXCUSED_REFUSAL.confirmInPerson],
      ["ownOnline", words.EXCUSED_REFUSAL.confirmOwnOnline],
      ["otherOnline", words.EXCUSED_REFUSAL.confirmOtherOnline],
    ]) {
      const answer = await ask("amara", { sessionKeys: ["w02"], reason: REASON, [left]: false });
      assert.deepEqual([answer.status, answer.body.error], [400, sentence], left);
    }
    const bare = await ask("amara", { sessionKeys: ["w02"], reason: REASON }, B, { raw: true });
    assert.deepEqual([bare.status, bare.body.error], [400, words.EXCUSED_REFUSAL.confirmInPerson], "an old page's press, with none");
    assert.deepEqual(requestDocs(), [], "a refused ask writes nothing");
    assert.deepEqual(world.mail, [], "and emails nobody");
  });

  test("all three confirmed: the request stores that they were, and when, server-written", async () => {
    const answer = await ask("amara", { sessionKeys: ["w02", "w03"], reason: REASON });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const [doc] = requestDocs();
    const at = doc.confirmed.at instanceof Date ? doc.confirmed.at : doc.confirmed.at.toDate();
    assert.deepEqual({ ...doc.confirmed, at: at.toISOString() }, {
      at: BEFORE_W2.toISOString(),
      inPerson: true,
      ownOnline: true,
      otherOnline: true,
    });
    assert.deepEqual(Object.keys(answer.body.request).includes("confirmed"), false, "the answer does not repeat them");
  });

  test("a session held online, or one asked about after it: their own group online is not asked for, and stored as no choice", async () => {
    world.db.poke(`courseGroups/${B}`, { campus: "online" });
    const answer = await ask("amara", { sessionKeys: ["w02"], reason: REASON, ownOnline: false });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(requestDocs()[0].confirmed.ownOnline, null, "nothing to confirm, so nothing claimed");
    const other = await ask("amara", { sessionKeys: ["w03"], reason: REASON, otherOnline: false });
    assert.deepEqual([other.status, other.body.error], [400, words.EXCUSED_REFUSAL.confirmOtherOnline], "the other two still are");
  });

  test("after a session nothing is confirmed about it: none asked or kept; with a week to come beside it, that week's are", async () => {
    at(DURING_W2);
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "absent" }])).status, 200);
    at(AFTER_W2);
    assert.equal((await finish("rahul", 2)).status, 200);
    world.mail.length = 0;
    // The past session alone: no confirmation sent, none needed, none kept.
    const past = await ask("amara", { sessionKeys: ["w02"], reason: "I was ill." }, B, { raw: true });
    assert.equal(past.status, 200, JSON.stringify(past.body));
    assert.equal("confirmed" in requestDocs()[0], false, "a request about a past session keeps confirmations nobody gave");
    // A past session and one to come: the one to come is confirmed, all three (week 3 is in a room).
    const mixed = (confirmed) => ask("dev", { sessionKeys: ["w02", "w03"], reason: "Away.", ...confirmed }, B, { raw: true });
    assert.deepEqual([(await mixed({})).body.error], [words.EXCUSED_REFUSAL.confirmInPerson]);
    assert.deepEqual([(await mixed({ inPerson: true, otherOnline: true })).body.error], [words.EXCUSED_REFUSAL.confirmOwnOnline]);
    assert.equal(requestDocs().length, 1, "a refused ask wrote something");
    const both = await mixed({ inPerson: true, ownOnline: true, otherOnline: true });
    assert.equal(both.status, 200, JSON.stringify(both.body));
    assert.deepEqual(both.body.request.weeks.map((week) => [week.sessionKey, week.asked]), [["w02", "after"], ["w03", "before"]]);
    const kept = requestDocs().find((doc) => doc.subjectUid === "dev").confirmed;
    assert.deepEqual([kept.inPerson, kept.ownOnline, kept.otherOnline], [true, true, true]);
  });

  test("a request made before confirmations were asked reads as before: no confirmations, nothing else changed", async () => {
    const id = await amaraAsks();
    const raw = world.db.read(`courseRequests/${id}`);
    delete raw.confirmed;
    world.db.seed(`courseRequests/${id}`, raw);
    const old = record.normalizeExcusedRequest(id, world.db.read(`courseRequests/${id}`));
    assert.equal(old.confirmed, null);
    assert.equal(old.status, "waiting");
    assert.equal(old.reason, REASON);
    assert.equal((await act("zach", "approve", id, { sessionKey: "w02" })).status, 200, "and it is decided as before");
  });
});

// ---------------------------------------------------------------------------
// Withdrawing
// ---------------------------------------------------------------------------

describe("withdrawing: the asker, a week or the whole request, while it waits", () => {
  beforeEach(placed);

  test("one week, then the rest; nothing on a register; nobody emailed", async () => {
    const id = await amaraAsks(["w02", "w03"]);
    const one = await act("amara", "withdraw", id, { sessionKey: "w03" });
    assert.equal(one.status, 200, JSON.stringify(one.body));
    assert.deepEqual(one.body, { ok: true, status: "waiting", weeks: [{ sessionKey: "w02", state: "waiting" }, { sessionKey: "w03", state: "withdrawn" }] });
    const again = await act("amara", "withdraw", id, { sessionKey: "w03" });
    assert.deepEqual([again.status, again.body.error], [409, "Week 3 was withdrawn."]);
    const rest = await act("amara", "withdraw", id);
    assert.deepEqual([rest.status, rest.body.status], [200, "withdrawn"]);
    const doc = requestDocs()[0];
    assert.equal(doc.status, "withdrawn");
    assert.ok(doc.withdrawnAt);
    assert.deepEqual(doc.history.map((entry) => [entry.what, entry.sessionKey]), [["asked", null], ["withdrawn", "w03"], ["withdrawn", "w02"]]);
    const none = await act("amara", "withdraw", id);
    assert.deepEqual([none.status, none.body.error], [409, words.EXCUSED_REFUSAL.nothingWaiting]);
    assert.equal(stored(), null);
    assert.deepEqual(world.mail, []);
  });

  test("only the asker: anybody else is told nothing, an admin is told why", async () => {
    const id = await amaraAsks();
    for (const who of ["dev", "rahul", "claudia", "yusuf", "nobody"]) {
      assert.deepEqual([(await act(who, "withdraw", id)).status, (await act(who, "withdraw", id)).body.error], [403, "Forbidden"], who);
    }
    const admin = await act("zach", "withdraw", id);
    assert.deepEqual([admin.status, admin.body.error], [403, words.EXCUSED_REFUSAL.onlyAsker]);
    assert.deepEqual([(await act("zach", "withdraw", "missing")).status, (await act("dev", "withdraw", "missing")).status], [404, 403]);
    assert.equal((await act(null, "withdraw", id)).status, 401);
    assert.equal(requestDocs()[0].status, "waiting");
  });
});

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

describe("deciding: admins only, each week on its own, and the register follows an approval", () => {
  beforeEach(placed);

  test("only an admin decides: never the lead, a track lead, a facilitator or the asker", async () => {
    const id = await amaraAsks();
    for (const who of ["claudia", "yusuf", "rahul", "amara", "dev", "nobody"]) {
      for (const action of ["approve", "decline", "reply"]) {
        const answer = await act(who, action, id, { sessionKey: "w02", reply: REPLY });
        assert.deepEqual([answer.status, answer.body.error], [403, "Forbidden"], `${who} ${action}`);
      }
    }
    for (const action of ["approve", "decline", "reply"]) {
      assert.equal((await act("zach", action, "missing", { sessionKey: "w02", reply: REPLY })).status, 404, action);
      assert.equal((await act(null, action, id, {})).status, 401, action);
    }
    // The correction routes do not know an excused request: nobody approves one through them.
    assert.deepEqual([(await call("zach", correctionApprove.POST, { requestId: id }, { body: {}, course: true })).status], [404]);
    assert.equal(requestDocs()[0].status, "waiting");
    assert.equal(stored(), null);
    assert.deepEqual(world.mail, []);
  });

  test("an admin who asked does not decide their own", async () => {
    seatLike("zach");
    const answer = await ask("zach", { sessionKeys: ["w02"], reason: REASON });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const own_ = await act("zach", "approve", answer.body.request.id, { sessionKey: "w02" });
    assert.deepEqual([own_.status, own_.body.error], [403, words.EXCUSED_REFUSAL.ownRequest]);
  });

  test("approved before the session: the line reads exactly as Can't make it leaves it, set by the approval; two emails, never the reason", async () => {
    const id = await amaraAsks();
    // Dev says Can't make it the old way, for the comparison.
    assert.equal((await call("dev", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w02", cantMakeIt: true }, course: true })).status, 200);
    const answer = await act("zach", "approve", id, { sessionKey: "w02", reply: REPLY });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, {
      ok: true,
      status: "approved",
      week: { sessionKey: "w02", state: "approved", register: "written" },
      logged: 0,
      emailed: { person: "sent", facilitators: 2 },
    });
    const doc = stored();
    assert.equal(doc.records.amara, "excused");
    assert.ok(doc.excusedInAdvance.amara instanceof Date);
    assert.deepEqual(doc.setBy.amara, { byUid: "zach", at: BEFORE_W2, how: "approval" });
    assert.equal(doc.setBy.dev.how, "self");
    assert.equal(doc.markedByUid, undefined, "an approval takes no register");
    assert.equal(doc.pushedAt, undefined);
    assert.deepEqual(auditRows().filter((row) => row.groupId === B), [], "an approval before the session writes no history row");

    const decided = requestDocs()[0];
    assert.equal(decided.status, "approved");
    assert.deepEqual(
      [decided.change.weeks[0].status, decided.change.weeks[0].decidedByUid, decided.change.weeks[0].reply, decided.change.weeks[0].register],
      ["approved", "zach", REPLY, "written"],
    );

    const sent = await mailText();
    const email = (uid) => world.db.read(`users/${uid}`).email;
    assert.deepEqual(sent.map((each) => [each.to, each.kind]).sort(), [
      [email("amara"), "course-enrolment"],
      [email("rahul"), "course-facilitator"],
      [email("sofia"), "course-facilitator"],
    ].sort());
    assert.equal(sent.find((each) => each.to === email("amara")).subject, "You’re excused from week 2");
    const person = sent.find((each) => each.to === world.db.read("users/amara").email);
    assert.match(person.html, /approved your request to be excused from Group B’s week 2 session, Tue 10 Nov, 6pm\./);
    assert.match(person.html, /Hope the appointment goes well\./);
    assert.match(person.html, /If you can come after all, just come along\./);
    assert.match(person.html, /Rahul and Sofia are told you’re excused, but not why\./);
    for (const each of sent) {
      assert.ok(!each.html.includes("appointment on Tuesday"), `${each.to} was sent the reason`);
      assert.doesNotMatch(each.html, /meet\.|zoom|teams\.microsoft/i, "an email carries a meeting link");
    }
    const facilitator = sent.find((each) => each.to === world.db.read("users/rahul").email);
    assert.match(facilitator.subject, / is excused from week 2$/);
    assert.match(facilitator.html, /Your register will show .+ as excused for Tue 10 Nov\. There’s nothing for you to do\./);
    assert.ok(!facilitator.html.includes(REPLY), "a facilitator was sent the reply");

    // THE READERS THAT KNEW NOTHING OF REQUESTS read Amara's line as Dev's:
    // the instant ticket's own state, whether the register is taken, and the
    // register's "can't make it" list.
    const register_ = attendanceLib.normalizeCourseAttendance("x", doc);
    for (const uid of ["amara", "dev"]) {
      const state = cantModel.cantMakeItState({
        startsAt: new Date("2026-11-10T18:00:00Z"),
        cancelled: false,
        line: { finished: false, notHeld: false, mark: register_.records[uid], toldAt: register_.excusedInAdvance[uid] ?? null },
        now: BEFORE_W2,
      });
      assert.equal(state.kind, "told", uid);
    }
    assert.equal(attendanceLib.registerIsTaken(doc), false);
    const keysOf = (uid) => Object.keys(doc).filter((key) => doc[key] && typeof doc[key] === "object" && Object.hasOwn(doc[key], uid)).sort();
    assert.deepEqual(keysOf("amara"), keysOf("dev"), "the approval wrote a field Can't make it does not");
    const asRahul = await readRegister("rahul");
    assert.deepEqual(asRahul.body.cantMakeIt.find((entry) => entry.sessionKey === "w02").uids.sort(), ["amara", "dev"]);
  });

  test("still waiting when the session starts: the register is taken as usual and finished, and nothing holds it up", async () => {
    await amaraAsks();
    at(DURING_W2);
    const during = await readRegister("rahul");
    assert.equal(during.body.excuseRequests.w02.amara, "waiting", "the facilitator is not told it waits");
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "present" }])).status, 200);
    assert.equal((await finish("rahul", 2)).status, 200, "a waiting request held the register up");
    assert.equal(stored().records.amara, "absent");
    assert.equal(requestDocs()[0].status, "waiting");
  });

  test("approved while the register is still being taken: the line says excused, set by the approval, and the facilitators' Finish keeps it", async () => {
    const id = await amaraAsks();
    at(DURING_W2);
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "present" }])).status, 200);
    world.mail.length = 0;
    const answer = await act("zach", "approve", id, { sessionKey: "w02" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.week.register, answer.body.logged], ["written", 0]);
    const doc = stored();
    assert.equal(doc.records.amara, "excused");
    assert.deepEqual([doc.setBy.amara.how, doc.setBy.amara.byUid], ["approval", "zach"]);
    assert.equal(doc.corrected?.amara, undefined, "a draft is not corrected");
    assert.equal(doc.excusedInAdvance?.amara, undefined, "during the session it was not said in advance");
    assert.equal(doc.markedByUid, "rahul", "the approval took the register");
    assert.deepEqual(auditRows().filter((row) => row.groupId === B), []);
    assert.equal((await finish("rahul", 2)).status, 200);
    assert.equal(stored().records.amara, "excused");
    const sent = await mailText();
    assert.match(sent.find((each) => each.subject === "You’re excused from week 2").html, /Your register says Excused for that session/);
    assert.match(sent.find((each) => each.subject !== "You’re excused from week 2").html, /Your register now shows .+ as excused for Tue 10 Nov\./);
  });

  test("after Finish: Absent becomes Excused as a correction made by the approval, logged without the reason; the figures follow", async () => {
    at(DURING_W2);
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "present" }])).status, 200);
    assert.equal((await finish("rahul", 2)).status, 200);
    at(AFTER_W2);
    const absentBefore = rollup("amara");
    const id = await amaraAsks();
    world.mail.length = 0;
    const answer = await act("zach", "approve", id, { sessionKey: "w02" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.week.register, answer.body.logged], ["corrected", 1]);
    const doc = stored();
    assert.equal(doc.records.amara, "excused");
    assert.equal(doc.setBy.amara.how, "approval");
    assert.equal(doc.corrected.amara.byUid, "zach");
    assert.equal(doc.excusedInAdvance?.amara, undefined, "after the session it was not said in advance");
    assert.notDeepEqual(rollup("amara"), absentBefore, "the figures did not follow");
    const [row] = auditRows("attendance-edit");
    assert.equal(row.requestId, id);
    assert.equal(row.subjectUid, "amara");
    assert.equal(row.reason, undefined, "the history carries the reason");
    assert.deepEqual([row.before.line, row.after.line], ["Absent", "Excused"]);
    assert.match(row.detail, /^Zach approved .+’s request to be excused for week 2\. The register changed from Absent to Excused\. Emailed .+\.$/);
    assert.ok(!row.detail.includes(REASON));
    const { rows: shown } = await history.loadGroupHistory(world.courseDb, RUN.agi, B);
    const listed = shown.find((each) => each.kind === "attendance-edit");
    assert.equal(listed.category, "registers");
    assert.ok(!JSON.stringify(shown).includes(REASON), "the group's history carries the reason");
    const sent = await mailText();
    assert.equal(sent.length, 3);
    assert.match(sent.find((each) => each.subject === "You’re excused from week 2").html, /Your register says Excused for that session/);
    // What the facilitator reads of the corrected line: the story, never the reason or who asked.
    const asRahul = await readRegister("rahul");
    assert.equal(asRahul.body.corrections.w02.amara.before, "Absent");
    assert.equal(asRahul.body.corrections.w02.amara.asked, null);
    assert.ok(!JSON.stringify(asRahul.body).includes(REASON));
  });

  test("after Finish, a line that says they came is left alone, and the week is approved all the same", async () => {
    at(DURING_W2);
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "present" }])).status, 200);
    assert.equal((await finish("rahul", 2)).status, 200);
    at(AFTER_W2);
    const id = await amaraAsks();
    // An admin corrects Amara's line to In the room before the request is decided.
    assert.equal(
      (await call("zach", register.PATCH, { groupId: B }, { body: { weekNumber: 2, marks: [{ uid: "amara", status: "present" }], reason: "She was there." }, course: true }))
        .status,
      200,
    );
    world.mail.length = 0;
    const rows = auditRows().length;
    const answer = await act("zach", "approve", id, { sessionKey: "w02" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.week.register, answer.body.logged, answer.body.emailed.facilitators], ["kept", 0, 0]);
    assert.equal(stored().records.amara, "present");
    assert.equal(auditRows().length, rows);
    const sent = await mailText();
    assert.equal(sent.length, 1, "the facilitators were told of a line that says they came");
    assert.match(sent[0].html, /Your register says you were there, so it stays as it is\./);
  });

  test("a facilitator's later mark wins, and the request stays approved", async () => {
    const id = await amaraAsks();
    assert.equal((await act("zach", "approve", id, { sessionKey: "w02" })).status, 200);
    at(DURING_W2);
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "present" }])).status, 200);
    assert.equal(stored().records.amara, "present");
    assert.equal(stored().excusedInAdvance?.amara, undefined);
    assert.equal(requestDocs()[0].status, "approved");
    const asRahul = await readRegister("rahul");
    assert.equal(asRahul.body.excuseRequests.w02.amara, "excused");
  });

  test("approving asks again that the person still belongs: left, moved, or the group archived is refused, and nothing is written or sent", async () => {
    for (const [why, change] of [
      ["left", () => world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { status: "withdrawn" })],
      ["moved", () => world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { groupId: A })],
      ["archived", () => world.db.poke(`courseGroups/${B}`, { archived: true })],
    ]) {
      await placed();
      const id = await amaraAsks();
      change();
      const page_ = await page.loadExcusedRequestPage(world.courseDb, sessionOf("zach"), id, BEFORE_W2);
      assert.equal(page_.view.belongs, false, `${why}: the request's page does not say so before the press`);
      const before = everything();
      const answer = await act("zach", "approve", id, { sessionKey: "w02", reply: REPLY });
      assert.deepEqual([answer.status, answer.body.error], [409, words.EXCUSED_REFUSAL.left], why);
      assert.equal(everything(), before, `${why}: a refused approval wrote something`);
      assert.deepEqual(world.mail, [], `${why}: a refused approval emailed somebody`);
      assert.equal(requestDocs()[0].change.weeks[0].status, "waiting", why);
      // Declining it, with a reply, closes it.
      assert.equal((await act("zach", "decline", id, { sessionKey: "w02", reply: "You have left the group." })).status, 200, why);
    }
    assert.equal(words.EXCUSED_REFUSAL.left, "They’ve left that group, so nothing was changed. Decline it, with a reply, to close it.");
    await placed();
    const id = await amaraAsks();
    assert.equal((await page.loadExcusedRequestPage(world.courseDb, sessionOf("zach"), id, BEFORE_W2)).view.belongs, true);
  });

  test("declining needs a reply, changes nothing on a register and emails the person alone", async () => {
    const id = await amaraAsks(["w02", "w03"]);
    const bare = await act("zach", "decline", id, { sessionKey: "w02" });
    assert.deepEqual([bare.status, bare.body.error], [400, words.EXCUSED_REFUSAL.reply]);
    const before = everything();
    const answer = await act("zach", "decline", id, { sessionKey: "w02", reply: "You could join online." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, status: "waiting", week: { sessionKey: "w02", state: "declined" }, emailed: { person: "sent" } });
    assert.notEqual(everything(), before);
    assert.equal(stored(), null);
    const sent = await mailText();
    assert.deepEqual(sent.map((each) => [each.to, each.subject]), [[world.db.read("users/amara").email, "About your request for week 2"]]);
    assert.match(sent[0].html, /Your request to be excused from Tue 10 Nov wasn’t approved\./);
    assert.match(sent[0].html, /You could join online\./);
    const twice = await act("zach", "decline", id, { sessionKey: "w02", reply: "Again." });
    assert.deepEqual([twice.status, twice.body.error], [409, "Week 2 has been decided already."]);
    // The other week, approved: one email per decision.
    world.mail.length = 0;
    assert.equal((await act("zach", "approve", id, { sessionKey: "w03" })).status, 200);
    assert.equal(requestDocs()[0].status, "approved");
    assert.equal((await mailText()).filter((each) => each.to === world.db.read("users/amara").email).length, 1);
  });

  test("a reply without deciding is kept on the request and emailed to the person", async () => {
    const id = await amaraAsks();
    const answer = await act("zach", "reply", id, { reply: "Could you join online instead?" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, status: "waiting", replied: true, emailed: { person: "sent" } });
    const doc = requestDocs()[0];
    assert.equal(doc.change.replies[0].text, "Could you join online instead?");
    assert.equal(doc.reply, "Could you join online instead?");
    assert.equal(doc.status, "waiting");
    assert.deepEqual(doc.history.map((entry) => entry.what), ["asked", "replied"]);
    const sent = await mailText();
    assert.deepEqual(sent.map((each) => each.subject), ["About your request for week 2"]);
    assert.match(sent[0].html, /It’s still waiting for a decision\./);
    assert.equal(stored(), null);
  });
});

// ---------------------------------------------------------------------------
// Who is sent what
// ---------------------------------------------------------------------------

describe("who is sent what: the reason and how often to admins only, one of two facts to the people running the group", () => {
  beforeEach(placed);

  test("the register's read: waiting, then excused, and nothing else, for everybody who reads it", async () => {
    const id = await amaraAsks();
    for (const who of ["rahul", "claudia", "yusuf", "zach"]) {
      const answer = await readRegister(who);
      assert.equal(answer.status, 200, who);
      assert.deepEqual(answer.body.excuseRequests, { w02: { amara: "waiting" } }, who);
      assert.ok(!JSON.stringify(answer.body).includes(REASON), `${who} was sent the reason`);
      assert.deepEqual(answer.body.requests, {}, `${who} was sent an excused request as a correction`);
    }
    assert.equal((await act("zach", "approve", id, { sessionKey: "w02", reply: REPLY })).status, 200);
    const after = await readRegister("rahul");
    assert.deepEqual(after.body.excuseRequests, { w02: { amara: "excused" } });
    assert.ok(!JSON.stringify(after.body).includes(REPLY), "a facilitator was sent the reply");
  });

  test("who approved a line, and when, reach admins alone: a facilitator and the lead are told only that an approved request set it", async () => {
    const coverWords = await loadTs("lib/courses/registerCover/pageWords.ts");
    const correctionWords = await loadTs("lib/courses/registerCorrection/pageWords.ts");
    // Before the session: the line an approval wrote.
    const id = await amaraAsks();
    assert.equal((await act("zach", "approve", id, { sessionKey: "w02" })).status, 200);
    for (const who of ["rahul", "claudia", "yusuf"]) {
      const sent = (await readRegister(who)).body;
      assert.deepEqual(sent.setBy.w02.amara, { name: "", at: "", how: "approval", yours: false }, who);
      assert.ok(!JSON.stringify(sent.setBy).includes("Zach"), `${who} was sent who approved it`);
    }
    const asAdmin = (await readRegister("zach")).body.setBy.w02.amara;
    assert.equal(asAdmin.how, "approval");
    assert.ok(asAdmin.name.length > 0 && asAdmin.at.length > 0, "an admin is not sent who approved it, and when");
    assert.equal(coverWords.setByWords({ name: "", at: "", how: "approval" }), "Set by an approved request");
    assert.equal(correctionWords.setByChip({ name: "", at: "", how: "approval" }), "Set by an approved request");
    assert.match(coverWords.setByWords({ name: "Zach Levin", at: "2026-11-10T21:10:00Z", how: "approval" }), /^Zach’s approval, 9:10pm$/);

    // After Finish: a correction made by an approval tells its story the same way.
    at(DURING_W2);
    assert.equal((await mark("rahul", 2, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "absent" }])).status, 200);
    assert.equal((await finish("rahul", 2)).status, 200);
    at(AFTER_W2);
    const devAsked = await ask("dev", { sessionKeys: ["w02"], reason: REASON });
    assert.equal(devAsked.status, 200, JSON.stringify(devAsked.body));
    assert.equal((await act("zach", "approve", devAsked.body.request.id, { sessionKey: "w02" })).status, 200);
    for (const who of ["rahul", "claudia"]) {
      const story = (await readRegister(who)).body.corrections.w02.dev;
      assert.deepEqual([story.byApproval, story.correctedBy.name, story.correctedAt], [true, "", ""], who);
      assert.match(correctionWords.storyWords(story), /Corrected by an approved request to be excused\./, who);
      assert.ok(!correctionWords.storyWords(story).includes("Zach"), who);
    }
    const adminStory = (await readRegister("zach")).body.corrections.w02.dev;
    assert.equal(adminStory.byApproval, true);
    assert.match(correctionWords.storyWords(adminStory), /Corrected by Zach’s approval, /);
  });

  test("a declined or withdrawn week shows nothing", async () => {
    const id = await amaraAsks(["w02", "w03"]);
    assert.equal((await act("zach", "decline", id, { sessionKey: "w02", reply: "No." })).status, 200);
    assert.equal((await act("amara", "withdraw", id, { sessionKey: "w03" })).status, 200);
    assert.deepEqual((await readRegister("rahul")).body.excuseRequests, {});
  });

  test("the group's page: the fact beside each person for the lead, never the reason", async () => {
    await amaraAsks();
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const group = groups.normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`));
    const view = await groupPage.loadGroupPage(world.courseDb, { run, group, viewer: "lead", viewerUid: "claudia", now: new Date() });
    const week2 = view.weeks.find((week) => week.sessionKey === "w02");
    assert.equal(week2.people.find((person) => person.uid === "amara").excuse, "waiting");
    assert.equal("excuse" in week2.people.find((person) => person.uid === "dev"), false);
    assert.ok(!JSON.stringify(view).includes(REASON));
  });

  test("the Requests page: an excused request is an admin's row only; one request's page is an admin's only", async () => {
    const id = await amaraAsks();
    const asAdmin = await loaders.loadRequestsPage(world.courseDb, sessionOf("zach"), AFTER_W2);
    const row = asAdmin.view.rows.find((each) => each.id === id);
    assert.equal(row.kind, "excused");
    assert.deepEqual(row.weeks.map((week) => [week.sessionKey, week.state]), [["w02", "waiting"]]);
    assert.equal(asAdmin.view.counts.waiting, 1);
    assert.ok(!JSON.stringify(asAdmin).includes(REASON), "the list carries the reason");
    for (const who of ["claudia", "yusuf"]) {
      const asLead = await loaders.loadRequestsPage(world.courseDb, sessionOf(who), AFTER_W2);
      assert.equal(asLead.view.rows.some((each) => each.id === id), false, who);
      assert.equal(asLead.view.counts.waiting, 0, who);
    }
    for (const who of ["claudia", "yusuf", "rahul", "amara"]) {
      assert.equal((await loaders.loadRequestPage(world.courseDb, sessionOf(who), id)).status, "none", who);
      assert.equal((await page.loadExcusedRequestPage(world.courseDb, sessionOf(who), id, AFTER_W2)).status, "none", who);
    }
    assert.equal(await home.requestsWaitingOnRun(world.courseDb, RUN.agi), 0, "a lead's count includes an excused request");
    assert.equal(await home.requestsWaitingOnRun(world.courseDb, RUN.agi, { excused: true }), 1);
  });

  test("one request's page for an admin: the reason, each week, what approving will do and who it emails, how often before", async () => {
    // Dev's earlier, before requests: week 1, the instant way.
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w01`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 1,
      occurrence: 1,
      records: { amara: "excused" },
      excusedInAdvance: { amara: new Date("2026-11-01T10:00:00Z") },
    });
    const id = await amaraAsks(["w02", "w03"]);
    const loaded = await page.loadExcusedRequestPage(world.courseDb, sessionOf("zach"), id, BEFORE_W2);
    assert.equal(loaded.status, "ok");
    const view = loaded.view;
    assert.equal(view.reason, REASON);
    assert.deepEqual(view.weeks.map((week) => [week.sessionKey, week.status, week.approving.write]), [["w02", "waiting", "in-advance"], ["w03", "waiting", "in-advance"]]);
    assert.equal(view.weeks[0].approving.emails, 3);
    assert.match(view.weeks[0].approving.told, /^3 emails: .+, with your reply; and .+ and .+, without the reason\.$/);
    assert.match(view.weeks[0].approving.words, /^The register says Excused for .+, with nothing for .+ to do\.$/);
    assert.deepEqual(view.excusedBefore.counts, { approved: 0, "time-set": 0, "in-advance": 0, "before-requests": 1 });
    assert.deepEqual(view.excusedBefore.weeks.map((week) => [week.sessionKey, week.kind]), [["w01", "before-requests"]]);
    assert.equal(view.canDecide, true);
  });

  test("how often, for admins: a week counts once its session happened and they were excused from it; weeks ahead are coming up, apart", () => {
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const group = groups.normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`));
    const sessions = sessionsLib.resolveSessions(run, group);
    const register = (n, mark, extra = {}) =>
      attendanceLib.normalizeCourseAttendance(`${RUN.agi}__${B}__w0${n}`, { runId: RUN.agi, groupId: B, weekNumber: n, occurrence: 1, records: { amara: mark }, ...extra });
    const seat = { role: "learner", status: "active", groupId: B, timeAnswer: { kind: "mostWeeks", sessionKeys: ["w01", "w04"], forGroupId: B, at: new Date("2026-11-01T10:00:00Z") } };
    const approved = (...keys) => ({ id: "r1", subjectUid: "amara", weeks: keys.map((sessionKey) => ({ sessionKey, status: "approved" })) });
    const count = (registers, requests = [approved("w02", "w03")]) =>
      page.excusedThisTermOf({ uid: "amara", sessions, registers: new Map(registers), requests, seat, group: { timeQuestionSince: null }, now: AFTER_W2 });
    const told = { excusedInAdvance: { amara: new Date("2026-11-01T10:00:00Z") } };
    const all = count([
      // Week 1 ticked, and she came after all: not counted.
      ["w01", register(1, "present")],
      // Week 2 approved after Finish, and her line says Excused: counted.
      ["w02", register(2, "excused", { pushedAt: new Date("2026-11-10T21:00:00Z") })],
      // Weeks 3 (approved) and 4 (ticked) are still ahead: coming up, apart.
      ["w03", register(3, "excused", told)],
      ["w04", register(4, "excused", told)],
    ]);
    assert.equal(all.count, 1);
    assert.deepEqual(all.counts, { approved: 1, "time-set": 0, "in-advance": 0, "before-requests": 0 });
    assert.deepEqual(all.weeks.map((week) => [week.sessionKey, week.kind]), [["w02", "approved"]]);
    assert.deepEqual(all.comingUp.map((week) => [week.sessionKey, week.kind]), [["w03", "approved"], ["w04", "time-set"]]);
    // Approved, and she came anyway: not counted.
    assert.equal(count([["w02", register(2, "present", { pushedAt: new Date("2026-11-10T21:00:00Z") })]]).count, 0);
    // A session said not to have happened: not counted.
    assert.equal(count([["w02", register(2, "excused", { held: false })]]).count, 0);
    // A week ticked with no line saying Excused: nothing to count, ahead or past.
    assert.deepEqual(count([], []).comingUp, []);
  });

  test("the person's own: their card's facts and their own words, never a count", async () => {
    const id = await amaraAsks();
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const groupList = [A, B, C].map((gid) => groups.normalizeCourseGroup(gid, world.db.read(`courseGroups/${gid}`)));
    const seat = enrolments.normalizeCourseEnrolment(`${RUN.agi}__amara`, world.db.read(`courseEnrolments/${RUN.agi}__amara`));
    const readOwn = () => own.excusedFor(world.courseDb, { user: sessionOf("amara"), run, enrolment: seat, groups: groupList, now: new Date() });
    let view = await readOwn();
    const week2 = view.sessions.find((session) => session.sessionKey === "w02");
    assert.deepEqual([week2.excuse.kind, week2.excuse.reason, week2.ask.open], ["waiting", REASON, false]);
    assert.equal(view.sessions.find((session) => session.sessionKey === "w03").ask.open, true);
    assert.equal(view.sessions.find((session) => session.sessionKey === "w03").first.online, true);
    assert.equal(view.asks, true);
    assert.ok(!/"count"|"counts"|timesThisTerm/.test(JSON.stringify(view)), "a member was sent a count");
    assert.equal((await act("zach", "approve", id, { sessionKey: "w02", reply: REPLY })).status, 200);
    view = await readOwn();
    const approved = view.sessions.find((session) => session.sessionKey === "w02").excuse;
    assert.equal(approved.kind, "approved");
    assert.equal(approved.reply, REPLY);
    assert.equal(approved.by.firstName, "Zach");
    assert.deepEqual(view.requests.map((each) => [each.id, each.status]), [[id, "approved"]]);
    // Nobody else's: Dev reads none of Amara's.
    const devSeat = enrolments.normalizeCourseEnrolment(`${RUN.agi}__dev`, world.db.read(`courseEnrolments/${RUN.agi}__dev`));
    const devView = await own.excusedFor(world.courseDb, { user: sessionOf("dev"), run, enrolment: devSeat, groups: groupList, now: new Date() });
    assert.deepEqual(devView.requests, []);
    assert.equal(devView.sessions.find((session) => session.sessionKey === "w02").excuse, null);
  });

  test("today's instant lines read as said in advance, before requests; Most weeks ticks as said when the time was set", async () => {
    // Amara: an instant line on week 2. Dev: "Most weeks, not all", week 3 ticked.
    assert.equal((await call("amara", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w02", cantMakeIt: true }, course: true })).status, 200);
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w03`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 3,
      occurrence: 1,
      records: { dev: "excused" },
      excusedInAdvance: { dev: new Date("2026-11-01T10:00:00Z") },
    });
    world.db.poke(`courseEnrolments/${RUN.agi}__dev`, {
      timeAnswer: { kind: "mostWeeks", sessionKeys: ["w03"], forGroupId: B, at: new Date("2026-11-01T10:00:00Z") },
    });
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const groupList = [A, B, C].map((gid) => groups.normalizeCourseGroup(gid, world.db.read(`courseGroups/${gid}`)));
    const seatOf = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, world.db.read(`courseEnrolments/${RUN.agi}__${uid}`));
    const amaraView = await own.excusedFor(world.courseDb, { user: sessionOf("amara"), run, enrolment: seatOf("amara"), groups: groupList, now: new Date() });
    // Pressed on 9 Nov, before requests began.
    assert.equal(amaraView.sessions.find((session) => session.sessionKey === "w02").excuse.kind, "before-requests");
    const devView = await own.excusedFor(world.courseDb, { user: sessionOf("dev"), run, enrolment: seatOf("dev"), groups: groupList, now: new Date() });
    assert.equal(devView.sessions.find((session) => session.sessionKey === "w03").excuse.kind, "time-set");
    // No request record for either, and nothing migrated.
    assert.deepEqual(requestDocs(), []);
    // Dev asks about week 2; the admin's page counts week 3 apart.
    const asked = await ask("dev", { sessionKeys: ["w02"], reason: "Away." });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const view = (await page.loadExcusedRequestPage(world.courseDb, sessionOf("zach"), asked.body.request.id, new Date())).view;
    // Week 3 is still ahead: listed as coming up, apart, and not counted yet.
    assert.deepEqual(view.excusedBefore.counts, { approved: 0, "time-set": 0, "in-advance": 0, "before-requests": 0 });
    assert.deepEqual(view.excusedBefore.comingUp.map((week) => [week.sessionKey, week.kind]), [["w03", "time-set"]]);
  });
});

// ---------------------------------------------------------------------------
// The admins are told a request has arrived
// ---------------------------------------------------------------------------

describe("the admins are told a request has arrived: one email each, never the reason", () => {
  beforeEach(placed);

  /** A second admin, Adele, beside Zach. */
  function secondAdmin() {
    const zach = structuredClone(world.db.read("users/zach"));
    world.db.seed("users/adele", { ...zach, uid: "adele", email: "adele@example.com", displayName: "Adele Moss", profile: { ...zach.profile, preferredName: "Adele" } });
  }
  const sent = () => world.mail.map((message) => ({ to: message.to, kind: message.kind, subject: message.subject }));
  const switchAs = (who, body, opts = {}) => call(who, emailsRoute.POST, {}, { body, course: true, ...opts });

  test("asking emails every admin, once, and nobody else: not the person, a facilitator, the lead or a track lead", async () => {
    secondAdmin();
    const id = await amaraAsks(["w02", "w03"], { keepMail: true });
    const mail = await mailText();
    assert.deepEqual(mail.map((each) => each.to).sort(), [world.db.read("users/zach").email, "adele@example.com"].sort());
    for (const each of mail) {
      assert.equal(each.kind, "course-request");
      assert.match(each.subject, / asked to be excused from weeks 2 and 3$/);
      assert.ok(!each.html.includes("appointment on Tuesday"), `${each.to} was sent the reason`);
      assert.doesNotMatch(each.html, /meet\.|zoom|teams\.microsoft/i, "an email carries a meeting link");
      assert.match(each.html, /Week 2: Tue 10 Nov, 6pm/);
      assert.match(each.html, /Week 3: Tue 17 Nov, 6pm/);
      assert.match(each.html, new RegExp(`/admin/admissions/requests/${id}`));
      assert.match(each.html, /isn’t in this email/);
    }
    // Withdrawing emails nobody.
    world.mail.length = 0;
    assert.equal((await act("amara", "withdraw", id, {})).status, 200);
    assert.deepEqual(world.mail, []);
    // A second ask is a second email.
    await amaraAsks(["w02"], { keepMail: true });
    assert.equal(world.mail.length, 2);
  });

  test("a request for a session within 24 hours says for today or for tomorrow, by the London day", async () => {
    at(new Date("2026-11-09T20:00:00Z"));
    await amaraAsks(["w02"], { keepMail: true });
    assert.match(sent()[0].subject, /asked to be excused from week 2, for tomorrow$/);
    world.mail.length = 0;
    at(new Date("2026-11-10T08:00:00Z"));
    await ask("dev", { sessionKeys: ["w02"], reason: REASON });
    assert.match(sent()[0].subject, /asked to be excused from week 2, for today$/);
  });

  test("an admin who asks is not emailed about their own request, and an admin who switched it off is not emailed", async () => {
    secondAdmin();
    seatLike("zach");
    assert.equal((await ask("zach", { sessionKeys: ["w02"], reason: REASON })).status, 200);
    assert.deepEqual(sent().map((each) => each.to), ["adele@example.com"]);
    world.mail.length = 0;
    const off = await switchAs("adele", { on: false });
    assert.deepEqual([off.status, off.body], [200, { ok: true, on: false }]);
    assert.deepEqual(world.db.read("users/adele").requestEmails, { excused: false });
    await amaraAsks(["w03"], { keepMail: true });
    assert.deepEqual(sent().map((each) => each.to), [world.db.read("users/zach").email]);
    // On again.
    assert.equal((await switchAs("adele", { on: true })).status, 200);
    world.mail.length = 0;
    await ask("dev", { sessionKeys: ["w03"], reason: REASON });
    assert.equal(sent().length, 2);
  });

  test("a failed send never fails the ask", async () => {
    world.mailFate = () => "fail";
    const answer = await ask("amara", { sessionKeys: ["w02"], reason: REASON });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(requestDocs().length, 1);
  });

  test("the switch is an admin's own: anybody else is refused, and the body is on or off", async () => {
    for (const who of ["claudia", "yusuf", "rahul", "amara"]) {
      assert.equal((await switchAs(who, { on: false })).status, 403, who);
      assert.equal(world.db.read(`users/${who}`).requestEmails, undefined, who);
    }
    assert.equal((await switchAs(null, { on: false })).status, 401);
    assert.equal((await switchAs("zach", { on: false }, { viewAs: true })).status, 403);
    for (const body of [{}, { on: "no" }, { on: false, uid: "adele" }]) {
      assert.deepEqual((await switchAs("zach", body)).body, { error: words.REQUEST_EMAILS_REFUSAL.body }, JSON.stringify(body));
    }
  });
});

// ---------------------------------------------------------------------------
// A line an approval wrote stays
// ---------------------------------------------------------------------------

describe("a line an approval wrote is taken back by nothing but a correction", () => {
  beforeEach(placed);

  const W3 = `courseAttendance/${RUN.agi}__${B}__w03`;
  const W4 = `courseAttendance/${RUN.agi}__${B}__w04`;

  /** Amara's own view of week 3, as her programme page reads it. */
  async function amaraWeek3() {
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const groupList = [A, B, C].map((gid) => groups.normalizeCourseGroup(gid, world.db.read(`courseGroups/${gid}`)));
    const seat = enrolments.normalizeCourseEnrolment(`${RUN.agi}__amara`, world.db.read(`courseEnrolments/${RUN.agi}__amara`));
    const view = await own.excusedFor(world.courseDb, { user: sessionOf("amara"), run, enrolment: seat, groups: groupList, now: new Date() });
    return view.sessions.find((session) => session.sessionKey === "w03");
  }

  /** Amara asks about week 3 and Zach approves it, before the session. */
  async function approvedWeek3() {
    const id = await amaraAsks(["w03"]);
    assert.equal((await act("zach", "approve", id, { sessionKey: "w03", reply: REPLY })).status, 200);
    const line = world.db.read(W3);
    assert.deepEqual([line.records.amara, line.setBy.amara.how], ["excused", "approval"]);
    world.mail.length = 0;
    return { id, line: structuredClone(line) };
  }

  test("an old page's I can make it after all: refused in one plain sentence, and the line and the request stay", async () => {
    const { line } = await approvedWeek3();
    const answer = await call("amara", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w03", cantMakeIt: false }, course: true });
    assert.deepEqual([answer.status, answer.body.error], [409, cantWords.CANT_MAKE_IT_REFUSAL.approved]);
    assert.equal(
      answer.body.error,
      "You’re excused from this session. If you can come after all, just come along: your facilitators’ register will show you there.",
    );
    assert.deepEqual(world.db.read(W3), line, "the take-back touched the approval's line");
    assert.equal(requestDocs()[0].change.weeks[0].status, "approved");
    assert.deepEqual(world.mail, [], "a refused take-back emailed somebody");
    // What each reader says afterwards: Amara's card, approved by Zach; the
    // facilitator's register, Excused.
    const week3 = await amaraWeek3();
    assert.deepEqual([week3.excuse.kind, week3.excuse.by.firstName, week3.excuse.reply], ["approved", "Zach", REPLY]);
    assert.equal((await readRegister("rahul")).body.excuseRequests.w03.amara, "excused");
    // A line on her own word is still hers to take back, as before.
    assert.equal((await call("amara", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w04", cantMakeIt: true }, course: true })).status, 200);
    const back = await call("amara", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w04", cantMakeIt: false }, course: true });
    assert.deepEqual([back.status, back.body.told], [200, false]);
    assert.equal(world.db.read(W4).records?.amara, undefined);
  });

  test("unticking Most weeks, not all keeps it: it was never a tick", async () => {
    const { line } = await approvedWeek3();
    const ticked = await call("amara", timeAnswerRoute.POST, { runId: RUN.agi }, { body: { groupId: B, kind: "mostWeeks", sessionKeys: ["w04"] }, course: true });
    assert.equal(ticked.status, 200, JSON.stringify(ticked.body));
    assert.deepEqual(world.db.read(W3), line, "unticking took back the approval's line");
    assert.equal(world.db.read(W4).records.amara, "excused", "the tick she gave is written as before");
    assert.equal((await amaraWeek3()).excuse.kind, "approved");
  });

  test("a new regular time keeps it, and takes back only the ticks given on the old time", async () => {
    const { line } = await approvedWeek3();
    // Week 3 is ticked too (it already says excused, so nothing is written for
    // it), and week 4 is a tick of her own.
    const ticked = await call("amara", timeAnswerRoute.POST, { runId: RUN.agi }, { body: { groupId: B, kind: "mostWeeks", sessionKeys: ["w03", "w04"] }, course: true });
    assert.equal(ticked.status, 200, JSON.stringify(ticked.body));
    assert.equal(world.db.read(W4).setBy.amara.how, "self");
    const moved = await call("zach", regularRoute.POST, { groupId: B }, {
      body: { fromWeek: 3, weekday: 3, time: "7pm", length: 120, room: "Portland A13", tell: false },
      course: true,
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.change.takenBack, 1, "only her own tick on week 4 is taken back");
    const after = world.db.read(W3);
    assert.deepEqual([after.records.amara, after.setBy.amara, after.excusedInAdvance.amara], [line.records.amara, line.setBy.amara, line.excusedInAdvance.amara]);
    assert.equal(world.db.read(W4).records?.amara, undefined, "her tick about the old time is taken back");
    // What each reader says afterwards.
    const week3 = await amaraWeek3();
    assert.deepEqual([week3.excuse.kind, week3.excuse.by.firstName], ["approved", "Zach"]);
    assert.equal((await readRegister("rahul")).body.excuseRequests.w03.amara, "excused");
    assert.equal(requestDocs()[0].change.weeks[0].status, "approved");
  });

  test("an approval's line never starts the register for its facilitators, even when the admin who approved it facilitates the group", async () => {
    await approvedWeek3();
    const line = world.db.read(W3);
    const register = attendanceLib.normalizeCourseAttendance("x", line);
    // Zach approved it; were Zach one of Group B's facilitators, the line is still Amara's own request.
    for (const facilitators of [["rahul", "sofia"], ["rahul", "sofia", "zach"]]) {
      assert.equal(coverModel.startedByFacilitator(register, facilitators), false, facilitators.join(","));
      assert.equal(
        coverModel.saveTakesCover({ changedLines: 1, cover: null, markedByUid: "", setBy: register.setBy, facilitatorUids: facilitators }),
        true,
        facilitators.join(","),
      );
    }
    assert.equal(coverModel.stampStartsIt({ byUid: "zach", how: "approval" }, new Set(["zach"])), false);
    assert.equal(coverModel.stampStartsIt({ byUid: "zach", how: "facilitator" }, new Set(["zach"])), true, "a facilitator's own mark stopped starting it");
  });

  test("a session with a request waiting, or declined, is never excused on the person's own word: not by a tick, not by the instant button", async () => {
    const tick = () => call("amara", timeAnswerRoute.POST, { runId: RUN.agi }, { body: { groupId: B, kind: "mostWeeks", sessionKeys: ["w03"] }, course: true });
    const instant = () => call("amara", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w03", cantMakeIt: true }, course: true });
    const id = await amaraAsks(["w03"]);
    for (const [state, sentence] of [
      ["waiting", cantWords.CANT_MAKE_IT_REFUSAL.askedWaiting],
      ["declined", cantWords.CANT_MAKE_IT_REFUSAL.askedDeclined],
    ]) {
      if (state === "declined") assert.equal((await act("zach", "decline", id, { sessionKey: "w03", reply: "Please come along." })).status, 200);
      const before = everything();
      const ticked = await tick();
      assert.deepEqual([ticked.status, ticked.body.error], [409, `Tue 17 Nov: ${sentence}`], state);
      const pressed = await instant();
      assert.deepEqual([pressed.status, pressed.body.error], [409, sentence], state);
      assert.equal(everything(), before, `${state}: a refused door wrote something`);
      assert.equal(world.db.read(W3) ?? null, null, `${state}: the register says excused on her own word`);
    }
    assert.equal(cantWords.CANT_MAKE_IT_REFUSAL.askedWaiting, "You’ve asked an admin to excuse you from that session, and it’s waiting for a decision.");
    assert.equal(cantWords.CANT_MAKE_IT_REFUSAL.askedDeclined, "Your request to be excused from that session was declined. You can ask again, or just come along.");
    // Another week, with no request about it, is as before for the first answer.
    const other = await call("amara", timeAnswerRoute.POST, { runId: RUN.agi }, { body: { groupId: B, kind: "mostWeeks", sessionKeys: ["w04"] }, course: true });
    assert.equal(other.status, 200, JSON.stringify(other.body));
  });

  test("nor by staff reading their answer as some weeks: an admin and the lead are refused a week with a request waiting or declined", async () => {
    const staffTick = (who, sessionKeys) =>
      call(who, someWeeksRoute.POST, { runId: RUN.agi, uid: "amara" }, { body: { sessionKeys }, course: true });
    const id = await amaraAsks(["w03"]);
    const cant = { groupId: B, kind: "cant", reason: "Tuesday evenings clash with my lab shift.", alternatives: "Monday evenings." };
    const said = await call("amara", timeAnswerRoute.POST, { runId: RUN.agi }, { body: cant, course: true });
    assert.equal(said.status, 200, JSON.stringify(said.body));
    const sentence = `Tue 17 Nov: ${timeWords.SOME_WEEKS_REFUSAL.withAnAdmin}`;
    for (const state of ["waiting", "declined"]) {
      if (state === "declined") assert.equal((await act("zach", "decline", id, { sessionKey: "w03", reply: "Please come along." })).status, 200);
      for (const who of ["zach", "claudia"]) {
        const before = everything();
        const refused = await staffTick(who, ["w04", "w03"]);
        assert.deepEqual([refused.status, refused.body.error], [409, sentence], `${state}, ${who}`);
        assert.equal(everything(), before, `${state}, ${who}: a refused press wrote something`);
      }
    }
    assert.equal(timeWords.SOME_WEEKS_REFUSAL.withAnAdmin, "That week has a request to be excused with an admin, so it can’t be ticked here.");
    assert.equal(world.db.read(W3) ?? null, null, "the register says excused past the decline");
    // Everything else about the door is as it was: the lead reads it as some weeks for a week with no request.
    const saved = await staffTick("claudia", ["w04"]);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(world.db.read(`courseAttendance/${RUN.agi}__${B}__w04`).records.amara, "excused");
  });

  test("a facilitator marks Absent over an approval and finishes: the person's card says what the register says, and that an admin can correct it", async () => {
    const cardLib = await loadTs("lib/courses/excused/card.ts");
    const ownWords = await loadTs("lib/courses/excused/ownWords.ts");
    await approvedWeek3();
    at(new Date("2026-11-17T18:20:00Z"));
    assert.equal((await mark("rahul", 3, [{ uid: "amara", status: "absent" }, { uid: "dev", status: "present" }])).status, 200);
    assert.equal((await finish("rahul", 3)).status, 200);
    const week3 = await amaraWeek3();
    assert.deepEqual([week3.register, week3.excuse.kind], ["absent", "approved"]);
    assert.deepEqual(cardLib.cardStateOf(week3), { kind: "approved-absent" });
    assert.equal(
      ownWords.APPROVED_BUT_ABSENT,
      "Your request to be excused was approved, but the finished register says Absent for this session. If that’s wrong, ask an admin to correct it.",
    );
    assert.equal(requestDocs()[0].change.weeks[0].status, "approved", "the request stays approved");
  });

  test("a facilitator's own mark still wins over it on the day, as over any line", async () => {
    await approvedWeek3();
    at(new Date("2026-11-17T18:20:00Z"));
    assert.equal((await mark("rahul", 3, [{ uid: "amara", status: "present" }])).status, 200);
    const line = world.db.read(W3);
    assert.equal(line.records.amara, "present");
    assert.equal(line.excusedInAdvance?.amara, undefined);
    assert.equal(requestDocs()[0].change.weeks[0].status, "approved", "the request stays approved");
  });
});

// ---------------------------------------------------------------------------
// The reason goes when the programme closes
// ---------------------------------------------------------------------------

describe("said in advance, and before requests only when it was", () => {
  beforeEach(placed);

  const ownView = async (uid) => {
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const groupList = [A, B, C].map((gid) => groups.normalizeCourseGroup(gid, world.db.read(`courseGroups/${gid}`)));
    const seat = enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, world.db.read(`courseEnrolments/${RUN.agi}__${uid}`));
    return own.excusedFor(world.courseDb, { user: sessionOf(uid), run, enrolment: seat, groups: groupList, now: new Date() });
  };

  test("an instant line told since requests began, by a facilitator who holds a place, reads said in advance", async () => {
    seatLike("rahul");
    at(new Date("2026-11-16T09:00:00Z"));
    assert.equal((await call("rahul", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w03", cantMakeIt: true }, course: true })).status, 200);
    const view = await ownView("rahul");
    assert.equal(view.sessions.find((session) => session.sessionKey === "w03").excuse.kind, "in-advance");
    assert.equal(words.excusedKindWords("in-advance"), "Said in advance");
  });

  test("a tick kept from an earlier asking, on a week a new regular time did not move, reads said in advance", async () => {
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w03`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 3,
      occurrence: 1,
      records: { dev: "excused" },
      excusedInAdvance: { dev: new Date("2026-11-01T10:00:00Z") },
    });
    world.db.poke(`courseEnrolments/${RUN.agi}__dev`, {
      timeAnswer: { kind: "mostWeeks", sessionKeys: ["w03"], forGroupId: B, at: new Date("2026-11-01T10:00:00Z") },
    });
    assert.equal((await ownView("dev")).sessions.find((session) => session.sessionKey === "w03").excuse.kind, "time-set");
    // The group's time was asked again since: that tick is from an earlier asking.
    world.db.poke(`courseGroups/${B}`, { timeQuestionSince: new Date("2026-11-05T10:00:00Z") });
    assert.equal((await ownView("dev")).sessions.find((session) => session.sessionKey === "w03").excuse.kind, "in-advance");
  });
});

describe("the reason goes when the programme closes, and the decision stays", () => {
  beforeEach(placed);

  test("a closed run loses its reasons and nothing else; an open run loses nothing; twice is once", async () => {
    const id = await amaraAsks(["w02", "w03"]);
    assert.equal((await act("zach", "approve", id, { sessionKey: "w02", reply: REPLY })).status, 200);
    assert.equal((await act("zach", "decline", id, { sessionKey: "w03", reply: "No." })).status, 200);
    const waitingId = (await ask("dev", { sessionKeys: ["w04"], reason: "Still waiting." })).body.request.id;
    // Open: nothing happens.
    const open = await tidy.deleteClosedReasons(world.courseDb, AFTER_W2);
    assert.deepEqual(open, { deleted: 0, runsClosed: 0, runsOpen: 1 });
    assert.equal(world.db.read(`courseRequests/${id}`).reason, REASON);
    // Closed: every reason of the run goes, decided and still waiting.
    const before = structuredClone(world.db.read(`courseRequests/${id}`));
    const closed = await tidy.deleteClosedReasons(world.courseDb, CLOSED);
    assert.deepEqual(closed, { deleted: 2, runsClosed: 1, runsOpen: 0 });
    const after = world.db.read(`courseRequests/${id}`);
    assert.equal(after.reason, undefined);
    assert.equal(after.reasonHeld, false);
    assert.ok(after.reasonGoneAt);
    const { reason: _r, reasonHeld: _h, reasonGoneAt: _g, ...rest } = after;
    const { reason: _r2, reasonHeld: _h2, ...was } = before;
    assert.deepEqual(rest, was, "something besides the reason changed");
    assert.equal(world.db.read(`courseRequests/${waitingId}`).reason, undefined);
    // Twice is once.
    const snapshot = everything();
    assert.deepEqual(await tidy.deleteClosedReasons(world.courseDb, CLOSED), { deleted: 0, runsClosed: 0, runsOpen: 0 });
    assert.equal(everything(), snapshot);
    // The admin's page says it went; the person is still excused.
    const view = (await page.loadExcusedRequestPage(world.courseDb, sessionOf("zach"), id, CLOSED)).view;
    assert.equal(view.reason, "");
    assert.ok(view.reasonGoneAt);
    assert.equal(view.weeks[0].status, "approved");
  });

  test("a run whose groups are all archived still closes, from their own calendars, and its reasons go then and not before", async () => {
    await amaraAsks();
    for (const gid of [A, B, C]) world.db.poke(`courseGroups/${gid}`, { archived: true });
    // Before the close its groups' calendars say, nothing goes.
    assert.deepEqual(await tidy.deleteClosedReasons(world.courseDb, AFTER_W2), { deleted: 0, runsClosed: 0, runsOpen: 1 });
    assert.equal(requestDocs()[0].reason, REASON);
    const done = await tidy.deleteClosedReasons(world.courseDb, CLOSED);
    assert.deepEqual(done, { deleted: 1, runsClosed: 1, runsOpen: 0 });
    assert.equal(requestDocs()[0].reason, undefined);
    assert.equal(requestDocs()[0].change.weeks[0].status, "waiting", "the decision went with the reason");
    // The live calendars answer as before; the archived ones only when nothing is live.
    const closes = await loadTs("lib/courses/weekWork/closes.ts");
    const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const groupList = [A, B, C].map((gid) => groups.normalizeCourseGroup(gid, world.db.read(`courseGroups/${gid}`)));
    assert.equal(closes.workClosesAt(run, groupList), null, "the one close function changed for every other reader");
    assert.ok(closes.workClosedForReasons(run, groupList) instanceof Date);
    assert.equal(closes.workClosedForReasons(run, []), null, "a run with no group closed");
  });

  test("a run with no close moment keeps its reasons", async () => {
    await amaraAsks();
    world.db.poke(`courseRuns/${RUN.agi}`, { weekPlan: [] });
    assert.deepEqual(await tidy.deleteClosedReasons(world.courseDb, CLOSED), { deleted: 0, runsClosed: 0, runsOpen: 1 });
    assert.equal(requestDocs()[0].reason, REASON);
  });

  test("the job: registered, on by default because the privacy policy promises it, and it emails nobody", async () => {
    const job = jobModule.excusedReasonsOffJob;
    assert.equal(job.id, "courses-excused-reasons-off");
    assert.equal(job.enabledByDefault, undefined, "a job that keeps a privacy promise ships switched off");
    const registry = readFileSync(join(SRC, "lib", "scheduler", "registry.ts"), "utf8");
    assert.match(registry, /^\s*"courses-excused-reasons-off",$/m);
    assert.match(registry, /^\s*excusedReasonsOffJob,$/m);
    const source = readFileSync(join(SRC, "lib", "scheduler", "jobs", "excusedReasonsOff.ts"), "utf8");
    assert.doesNotMatch(source, /@\/lib\/(email|push)\//);
    // It runs as the tick runs it: a count, never a reason.
    await amaraAsks();
    at(CLOSED);
    const logged = [];
    const result = await job.handler({ now: CLOSED, log: (message, extra) => logged.push([message, extra]), budget: { remainingMs: () => 1e6, expired: () => false } });
    assert.deepEqual([result.processed, result.note], [1, "1 reasons deleted"]);
    assert.ok(!JSON.stringify(logged).includes(REASON));
  });
});
