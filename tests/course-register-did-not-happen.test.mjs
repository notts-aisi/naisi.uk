/**
 * It didn't happen: a session called off after it passed, with the two
 * cancels of "Change this week" (keep pace, or push the rest back a week),
 * instead of the register's old switch.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/session/change   (cancel, push; preview)
 *   POST /api/courses/groups/[groupId]/attendance       (the switch, refused)
 *
 * ## What this guards
 *
 *  1. THE PREVIEW of a session called off after it passed says what the
 *     change cannot show by itself: the week leaves everyone's attendance,
 *     whether a check-in or a report exists, the chase stops, and which lines
 *     would be cleared.
 *  2. A DRAFT WITH MARKS may be called off by the group's facilitators, the
 *     lead and admins: the lines set for the session are cleared in the same
 *     write, what each said is kept in one history row, what people said in
 *     advance stays, and the register is no longer taken. Pushed back, nothing
 *     of the session that did not happen stays on the register that becomes
 *     the next session's.
 *  3. A FINISHED register is refused, in a sentence saying it is a correction.
 *  4. THE REGISTER'S OLD SWITCH: a NEW not-held is refused with one sentence
 *     saying where It didn't happen lives; a register that already says it
 *     reads as before.
 *  5. CALLED OFF AFTER THE FACT, the session is out of every figure, is not
 *     chased (the 36-hour email, the 60-hour card, and a card already made is
 *     archived), and its check-in and report are refused.
 *  6. THE NOTICE: "No session for week 1", and the push's own words. Where
 *     the next session meets, in this notice and in a put back's: online for
 *     a session held online (`heldOnline`), never a room for it.
 *
 * Real: the routes, the jobs and every library under them. Stubbed: the
 * session, the Admin SDK handle, the view-as guard and the mail door.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, jobContext, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";
import { pressedBefore } from "./lib/saidBefore.mjs";

const made = makeWorld("__didNotHappen");
const { world, reset, call, courseRoute, lib, loadTs } = made;

const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const change = await courseRoute("groups", "[groupId]", "session", "change");
const cantMakeIt = await courseRoute("groups", "[groupId]", "cant-make-it");
const checkIn = await courseRoute("groups", "[groupId]", "check-in");
const report = await courseRoute("groups", "[groupId]", "session-report");
const coverRoute = await courseRoute("groups", "[groupId]", "attendance", "cover");
const { registerRemindersJob } = await lib("scheduler", "jobs", "registerReminders.ts");
const { unmarkedRegistersJob } = await lib("scheduler", "jobs", "unmarkedRegisters.ts");
const { registerFollowUpTaskId } = await lib("courses", "unmarkedRegisters.ts");
const { resolveSessions } = await lib("courses", "sessions.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { registerIsTaken } = await lib("firestore", "courseAttendance.ts");
const coverWords = await loadTs("lib/courses/registerCover/words.ts");

/** Group B's week 1 session: Tue 20 Oct, 6pm to 8pm BST (5pm to 7pm UTC). */
const BEFORE = new Date("2026-10-20T10:00:00Z");
const DURING = new Date("2026-10-20T17:30:00Z");
const AFTER = new Date("2026-10-20T20:00:00Z");
const HOUR = 3_600_000;
const ENDS = new Date("2026-10-20T19:00:00Z");

mock.timers.enable({ apis: ["Date"], now: BEFORE });
const at = (instant) => mock.timers.setTime(new Date(instant).getTime());

const W1 = registerPath(GROUP.b, 1);
const read = (path) => world.db.read(path);
const auditRows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => world.db.read(path))
    .filter((row) => !kind || row.kind === kind);

const mark = (who, marks, extra = {}) => call(who, register.POST, { groupId: GROUP.b }, { body: { weekNumber: 1, marks, ...extra } });
const press = (who, body) =>
  call(who, change.POST, { groupId: GROUP.b }, { body: { week: 1, dateKey: "2026-10-20", reason: "Rahul was ill and nobody could cover.", tell: false, ...body } });
const sessionsOfB = () => resolveSessions(normalizeCourseRun(RUN, read(`courseRuns/${RUN}`)), normalizeCourseGroup(GROUP.b, read(`courseGroups/${GROUP.b}`)));

/** Farah said in advance she can't make it; Rahul marked Amara present online and Chloe absent during the session. */
async function aDraft() {
  at(BEFORE);
  const said = await pressedBefore(world.db, GROUP.b, "farah", () => call("farah", cantMakeIt.POST, { groupId: GROUP.b }, { body: { sessionKey: "w01", cantMakeIt: true } }));
  assert.equal(said.status, 200, JSON.stringify(said.body));
  at(DURING);
  const marked = await mark("rahul", [
    { uid: "amara", status: "present", online: true },
    { uid: "chloe", status: "absent" },
  ]);
  assert.equal(marked.status, 200, JSON.stringify(marked.body));
  at(AFTER);
}

beforeEach(() => {
  at(BEFORE);
  reset(seedWorld({ reminders: true }));
});

// ---------------------------------------------------------------------------
// 1. The preview
// ---------------------------------------------------------------------------

describe("1. the preview says what calling it off after the fact does", () => {
  test("with no register: out of the attendance, nothing to clear, no check-in or report, the chase stops", async () => {
    at(AFTER);
    const answer = await press("rahul", { kind: "cancel", preview: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.preview.didNotHappen, {
      leavesAttendance: true,
      chaseStops: true,
      checkIn: false,
      reports: 0,
      // `back`: the lines that go back to excused (none here), named as cleared ones are.
      lines: { cleared: 0, said: {}, names: {}, back: {} },
    });
  });

  test("with a draft: which lines go, and what each said; a word in advance is not one of them", async () => {
    await aDraft();
    const before = JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));
    const answer = await press("rahul", { kind: "push", preview: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.preview.didNotHappen.lines, {
      cleared: 2,
      said: { amara: "Present online", chloe: "Absent" },
      names: { amara: "Amara", chloe: "Chloe" },
      back: {},
    });
    assert.equal(JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)])), before, "a preview changed something");
  });

  test("a session still to come says nothing of it", async () => {
    const answer = await press("rahul", { kind: "cancel", preview: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.preview.didNotHappen, null);
  });
});

// ---------------------------------------------------------------------------
// 2. A draft with marks
// ---------------------------------------------------------------------------

describe("2. a draft with marks, called off", () => {
  test("keep pace: the lines set for the session go, what each said is kept, a word in advance stays, and it is not taken", async () => {
    await aDraft();
    const answer = await press("rahul", { kind: "cancel" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const doc = read(W1);
    assert.deepEqual(doc.records, { farah: "excused" }, "a line set for the session stayed, or a word in advance went");
    assert.ok(doc.excusedInAdvance.farah, "Farah's word in advance went");
    assert.deepEqual(doc.online ?? {}, {});
    assert.deepEqual(Object.keys(doc.setBy ?? {}), ["farah"]);
    assert.equal(doc.setBy.farah.how, "self");
    assert.equal(doc.markedByUid, undefined);
    assert.equal(registerIsTaken(doc), false);
    const [row] = auditRows("session-did-not-happen");
    assert.deepEqual(row.before, { amara: "Present online", chloe: "Absent" });
    assert.deepEqual(row.after, { kind: "cancel", cleared: 2 });
    assert.equal(row.reason, "Rahul was ill and nobody could cover.");
    assert.match(row.detail, /^Week 1 didn’t happen, the group keeping pace\. Cleared 2 lines of its register: /);
    assert.equal(auditRows("session-cancelled").length, 1, "the change's own row is kept as well");
    assert.equal(sessionsOfB().find((s) => s.weekNumber === 1).cancelled, true);
  });

  test("push back: nothing of the session that did not happen stays on the register that becomes next week's", async () => {
    await aDraft();
    assert.equal((await call("claudia", (await courseRoute("groups", "[groupId]", "attendance", "cover")).POST, { groupId: GROUP.b }, { body: { weekNumber: 1 } })).status, 409, "the facilitator started it, so it needs no covering");
    const answer = await press("claudia", { kind: "push" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const doc = read(W1);
    assert.deepEqual(doc.records, { farah: "excused" });
    assert.equal(doc.cover, undefined);
    assert.equal(doc.facilitatorRecord, undefined);
    const week1 = sessionsOfB().find((s) => s.weekNumber === 1);
    assert.equal(week1.dateKey, "2026-10-27", "week 1 meets a week later");
    assert.equal(new Date(doc.sessionAt).toISOString(), "2026-10-27T18:00:00.000Z", "the register's session follows it");
    assert.deepEqual(auditRows("session-did-not-happen")[0].after, { kind: "push", cleared: 2 });
  });

  test("the lead and an admin may; somebody with no part in the group may not", async () => {
    for (const who of ["claudia", "zach"]) {
      reset(seedWorld({ reminders: true }));
      await aDraft();
      assert.equal((await press(who, { kind: "cancel" })).status, 200, who);
    }
    reset(seedWorld({ reminders: true }));
    await aDraft();
    assert.equal((await press("amelia", { kind: "cancel" })).status, 403);
    assert.deepEqual(read(W1).records, { amara: "present", chloe: "absent", farah: "excused" });
  });

  test("push back is refused when a later week's register is taken, and goes through when none is", async () => {
    const sessionWords = await loadTs("lib/courses/sessionChange/words.ts");
    // Week 2's register was taken (somebody saved marks on it): pushing week 1
    // back would move week 2's session, which has met. The pressed session's
    // own draft is the one register the rule leaves out.
    await aDraft();
    const W2 = registerPath(GROUP.b, 2);
    world.db.seed(W2, { runId: RUN, groupId: GROUP.b, weekNumber: 2, occurrence: 1, records: { amara: "present" }, markedByUid: "rahul" });
    const before = JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));
    for (const preview of [true, false]) {
      const refused = await press("rahul", { kind: "push", ...(preview ? { preview: true } : {}) });
      assert.deepEqual([refused.status, refused.body.error], [409, sessionWords.movesMetWords(2)], `preview: ${preview}`);
    }
    assert.equal(JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)])), before, "a refused push changed something");
    assert.equal(auditRows("session-did-not-happen").length, 0);
    assert.equal(sessionsOfB().find((s) => s.weekNumber === 1).dateKey, "2026-10-20", "week 1 moved");

    // The same press with no later register taken goes through, and clears the draft.
    reset(seedWorld({ reminders: true }));
    await aDraft();
    const pushed = await press("rahul", { kind: "push" });
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    assert.deepEqual(read(W1).records, { farah: "excused" });
    assert.equal(sessionsOfB().find((s) => s.weekNumber === 1).dateKey, "2026-10-27");
  });

  test("moving or putting right a taken session is still refused, as before", async () => {
    await aDraft();
    const moved = await press("rahul", { kind: "move", metAtAnotherTime: true, move: { dateKey: "2026-10-21", time: "10am", room: "Room C20" } });
    assert.equal(moved.status, 409);
  });
});

// ---------------------------------------------------------------------------
// 3. A finished register
// ---------------------------------------------------------------------------

describe("3. a finished register is a correction", () => {
  test("both cancels are refused with a sentence, and nothing changes", async () => {
    await aDraft();
    assert.equal((await call("rahul", push.POST, { groupId: GROUP.b }, { body: { weekNumber: 1 } })).status, 200);
    for (const kind of ["cancel", "push"]) {
      const answer = await press("rahul", { kind });
      assert.deepEqual([answer.status, answer.body.error], [409, coverWords.REGISTER_COVER_REFUSAL.finishedDidNotHappen], kind);
    }
    assert.equal(auditRows("session-did-not-happen").length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. The register's old switch
// ---------------------------------------------------------------------------

describe("4. the register's not-held switch", () => {
  test("a new not-held is refused with one sentence, and nothing is written", async () => {
    at(DURING);
    const answer = await mark("rahul", [], { held: false });
    assert.deepEqual([answer.status, answer.body.error], [409, coverWords.REGISTER_COVER_REFUSAL.didNotHappen]);
    assert.equal(read(W1), undefined);
  });

  test("a register that already says it did not happen reads as before, and may be held again", async () => {
    at(DURING);
    world.db.seed(W1, { runId: RUN, groupId: GROUP.b, weekNumber: 1, records: {}, held: false, markedByUid: "rahul" });
    const got = await call("rahul", register.GET, { groupId: GROUP.b });
    assert.equal(got.status, 200, JSON.stringify(got.body));
    assert.equal(got.body.sessions.find((s) => s.weekNumber === 1).held, false);
    assert.equal((await mark("rahul", [], { held: false, notes: "Fire alarm." })).status, 200, "saying it again is not new");
    assert.equal((await mark("rahul", [], { held: true })).status, 200);
    assert.equal(read(W1).held, true);
  });
});

// ---------------------------------------------------------------------------
// 5. Out of every figure, never chased, and nothing more opens
// ---------------------------------------------------------------------------

describe("5. called off after the fact", () => {
  test("out of the register's figures, refused the check-in and the report", async () => {
    await aDraft();
    assert.equal((await press("rahul", { kind: "cancel" })).status, 200);
    const got = await call("rahul", register.GET, { groupId: GROUP.b });
    assert.equal(got.body.sessions.find((s) => s.weekNumber === 1).held, false);
    const opened = await call("rahul", checkIn.POST, { groupId: GROUP.b }, { body: { session: "w01", people: 1 } });
    assert.equal(opened.status, 409, JSON.stringify(opened.body));
    const reported = await call("rahul", report.PUT, { groupId: GROUP.b }, { body: { sessionKey: "w01", answers: { how: 3 } } });
    assert.equal(reported.status, 409, JSON.stringify(reported.body));
  });

  test("never chased: no reminder at 36 hours, no card at 60", async () => {
    await aDraft();
    assert.equal((await press("rahul", { kind: "cancel" })).status, 200);
    world.mail.length = 0;
    const remindAt = new Date(ENDS.getTime() + 37 * HOUR);
    at(remindAt);
    await registerRemindersJob.handler(jobContext(registerRemindersJob, remindAt).ctx);
    // Group B's facilitators are emailed nothing (the other run's group, on the
    // same evening, is reminded as ever: the job ran).
    assert.deepEqual(world.mail.filter((mail) => /Group B/.test(mail.subject)), []);
    assert.ok(world.mail.some((mail) => /Pre-course group/.test(mail.subject)), "the job did not run");
    const cardAt = new Date(ENDS.getTime() + 61 * HOUR);
    at(cardAt);
    await unmarkedRegistersJob.handler(jobContext(unmarkedRegistersJob, cardAt).ctx);
    assert.equal(read(`tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`), undefined);
  });

  test("a card already made is archived when the session is called off", async () => {
    await aDraft();
    const cardAt = new Date(ENDS.getTime() + 61 * HOUR);
    at(cardAt);
    await unmarkedRegistersJob.handler(jobContext(unmarkedRegistersJob, cardAt).ctx);
    const card = `tasks/${registerFollowUpTaskId(RUN, GROUP.b, "w01")}`;
    assert.ok(read(card), "the job raised no card to close");
    assert.notEqual(read(card).archived, true);
    assert.equal((await press("zach", { kind: "cancel" })).status, 200);
    assert.equal(read(card).archived, true);
  });
});

// ---------------------------------------------------------------------------
// 6. The notice
// ---------------------------------------------------------------------------

describe("6. what the group is told", () => {
  test("keep pace: no session for week 1, when and where they meet next, and why", async () => {
    at(AFTER);
    const answer = await press("rahul", { kind: "cancel", preview: true });
    assert.equal(answer.body.preview.notice.title, "No session for week 1");
    assert.equal(
      answer.body.preview.notice.message,
      "Group B didn’t meet on Tue 20 Oct. Week 2 is still Tue 27 Oct, 6pm, Room C20, and week 1’s work is still on your programme page.\n\n" +
        "Why: Rahul was ill and nobody could cover.",
    );
  });

  /** The keep pace notice, with where week 2 meets. */
  const keptPace = (where) =>
    `Group B didn’t meet on Tue 20 Oct. Week 2 is still Tue 27 Oct, 6pm, ${where}, and week 1’s work is still on your programme page.\n\n` +
    "Why: Rahul was ill and nobody could cover.";

  test("keep pace, the next session held online for that week: said to be online, never its room", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { sessionModes: { w02: "virtual" } });
    at(AFTER);
    const answer = await press("rahul", { kind: "cancel", preview: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.preview.notice.message, keptPace("online"));
  });

  test("keep pace, a group whose campus is Online: the next session is said to be online, never the room it has stored", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { campus: "online" });
    at(AFTER);
    const answer = await press("rahul", { kind: "cancel", preview: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.preview.notice.message, keptPace("online"));
  });

  test("put back as usual, for a group whose campus is Online: online, never the room it has stored", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { campus: "online" });
    at(BEFORE);
    const moved = await press("rahul", { kind: "move", move: { dateKey: "2026-10-21", time: "6pm", room: "Room C20" } });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const back = await press("rahul", { kind: "restore", dateKey: "2026-10-21", reason: "Sofia can make it after all.", preview: true });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(back.body.preview.notice.title, "Week 1 is back to its usual time");
    assert.equal(back.body.preview.notice.message, "Group B’s week 1 session is back to Tue 20 Oct, 6pm, online, as usual.\n\nWhy: Sofia can make it after all.");
  });

  test("push back: the cancelled and pushed back words", async () => {
    at(AFTER);
    const answer = await press("rahul", { kind: "push", preview: true });
    assert.equal(answer.body.preview.notice.title, "Week 1 moves to next week, and the rest follow");
  });
});

// ---------------------------------------------------------------------------
// 7. After the review: a cover cleared by a push back, and a session with a
//    check-in or a report
// ---------------------------------------------------------------------------

describe("7. a covered draft, and a session that already has a check-in or a report", () => {
  /** Claudia took week 1's register in Rahul and Sofia's place during the session, and marked Amara present. */
  async function aCoveredDraft() {
    at(DURING);
    const took = await call("claudia", coverRoute.POST, { groupId: GROUP.b }, { body: { weekNumber: 1 } });
    assert.equal(took.status, 200, JSON.stringify(took.body));
    assert.equal((await mark("claudia", [{ uid: "amara", status: "present" }])).status, 200);
    at(AFTER);
  }

  test("push back: the cover and the record of who was there leave the register and stay in the row, beside the lines", async () => {
    await aCoveredDraft();
    const answer = await press("claudia", { kind: "push" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const doc = read(W1);
    assert.equal(doc.cover, undefined);
    assert.equal(doc.facilitatorRecord, undefined);
    const [row] = auditRows("session-did-not-happen");
    assert.deepEqual(row.before, {
      amara: "Present",
      cover: "self",
      coverByUid: "claudia",
      "facilitator:rahul": "not-there",
      "facilitator:sofia": "not-there",
    });
    assert.match(row.detail, /^Week 1 didn’t happen, the rest pushed back a week\. Cleared 1 line of its register: Amara Present\. Claudia was covering it\.$/);
  });

  test("keep pace: the cover and the record stay on the register, as the record of a session nobody ran", async () => {
    await aCoveredDraft();
    assert.equal((await press("claudia", { kind: "cancel" })).status, 200);
    const doc = read(W1);
    assert.equal(doc.cover.byUid, "claudia");
    assert.deepEqual(Object.keys(doc.facilitatorRecord).sort(), ["rahul", "sofia"]);
    assert.deepEqual(auditRows("session-did-not-happen")[0].before, { amara: "Present" });
  });

  test("a session report stops a push back, in its preview and its press, with one sentence; keep pace still goes", async () => {
    await aDraft();
    const reported = await call("rahul", report.PUT, { groupId: GROUP.b }, { body: { sessionKey: "w01", answers: { how: 3 } } });
    assert.equal(reported.status, 200, JSON.stringify(reported.body));
    const before = JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));
    for (const preview of [true, false]) {
      const refused = await press("rahul", { kind: "push", ...(preview ? { preview: true } : {}) });
      assert.deepEqual([refused.status, refused.body.error], [409, coverWords.pushHasRecordsWords(1)], `preview: ${preview}`);
    }
    assert.equal(JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)])), before, "a refused push changed something");
    const kept = await press("rahul", { kind: "cancel", preview: true });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    assert.equal(kept.body.preview.didNotHappen.reports, 1);
    assert.equal((await press("rahul", { kind: "cancel" })).status, 200);
  });

  test("an opened check-in stops a push back too", async () => {
    // The check-in goes to the people marked here, so somebody is marked first.
    at(DURING);
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    const opened = await call("rahul", checkIn.POST, { groupId: GROUP.b }, { body: { session: "w01", people: 1 } });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    at(AFTER);
    const refused = await press("rahul", { kind: "push" });
    assert.deepEqual([refused.status, refused.body.error], [409, coverWords.pushHasRecordsWords(1)]);
    assert.equal(sessionsOfB().find((s) => s.weekNumber === 1).dateKey, "2026-10-20", "week 1 moved");
  });
});
