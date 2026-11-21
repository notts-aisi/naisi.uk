/**
 * A GROUP UPDATE'S WEEK IS A WEEK OF THAT GROUP THE CHANGE ROUTE CAN HAVE
 * CHANGED. `POST /api/courses/runs/[runId]/updates` takes a `weekNumber` only
 * for the notice a change to one of the group's sessions posts (the group
 * page's Change panel and the Sessions view's dialog send the week the change
 * route answered), and its email reaches the people in the group that week.
 * So the week must be one in which the group has a session whose register
 * nobody has taken (`weekNoticeRefusal`): a session still to come, or one put
 * right after it started, and then only by the person who changed it, from
 * the record the change route wrote, within a day. A week whose register was
 * taken, a week past the group's last session, a week only another group has
 * and a session that has started with no such record are refused in one
 * sentence, before anything is posted or sent.
 *
 * The world is `tests/lib/sessionsWorld.mjs`: the AGI run in week 4 (Thu 19
 * Nov 2026), six taught weeks from Thu 29 Oct. Group B meets on Tuesdays at
 * 6pm (Rahul and Sofia): week 2 was Tue 10 Nov, week 3 Tue 17 Nov, week 4 is
 * Tue 24 Nov. Claudia leads the programme.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { A, B, RUN, TUE_24, makeSessionsWorld } from "./lib/sessionsWorld.mjs";

const w = await makeSessionsWorld("__updateWeek");
const { world, ask, reset, everything } = w;

beforeEach(() => reset());

const registerPath = (groupId, week) => `courseAttendance/${RUN.agi}__${groupId}__w0${week}`;
const updates = () => world.db.paths().filter((path) => /^courseUpdates\//.test(path));

/** The change route's answer, then its update posted as the Change panel posts it: with the change's week. */
async function changeThenPost(who, body) {
  const emailCount = await w.changeEmailsFor(B, who);
  const changed = await ask.change(who, B, { reason: "Rahul and Sofia are both away.", ...body, tell: true, emailCount });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const update = changed.body.update;
  const posted = await ask.post(who, {
    to: "group",
    groupId: update.groupId,
    title: update.title,
    message: update.message,
    email: update.emailCount > 0,
    ...(update.emailCount > 0 ? { emailCount: update.emailCount } : {}),
    withFacilitators: true,
    weekNumber: update.weekNumber,
  });
  return { update, posted };
}

/** An update about one week of Group B, posted without email so nothing is counted. */
const aboutWeek = (who, weekNumber, groupId = B) =>
  ask.post(who, { to: "group", groupId, title: "About that week", message: "A word about it.", email: false, withFacilitators: true, weekNumber });

describe("the page's own use", () => {
  test("a session still to come, called off and told: the update about its week posts and emails as the change route counted", async () => {
    world.mail.length = 0;
    const { update, posted } = await changeThenPost("claudia", { week: 4, dateKey: TUE_24, kind: "cancel" });
    assert.equal(update.weekNumber, 4);
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    assert.equal(world.mail.length, update.emailCount);
  });

  test("It met at another time, after the session: the update about its week posts", async () => {
    const { update, posted } = await changeThenPost("rahul", {
      week: 3,
      dateKey: "2026-11-17",
      kind: "move",
      metAtAnotherTime: true,
      move: { dateKey: "2026-11-18", time: "10am", room: "Hallward B12" },
    });
    assert.equal(update.weekNumber, 3);
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
  });

  test("It didn't happen, with no register taken, kept pace and pushed back: the update about its week posts", async () => {
    for (const kind of ["cancel", "push"]) {
      reset();
      const { update, posted } = await changeThenPost("claudia", { week: 3, dateKey: "2026-11-17", kind });
      assert.equal(update.weekNumber, 3, kind);
      assert.equal(posted.status, 200, `${kind}: ${JSON.stringify(posted.body)}`);
    }
  });

  test("a session put right after it started (its draft register called off): the update about its week posts", async () => {
    // Week 3's register is a draft somebody marked, not finished.
    world.db.seed(registerPath(B, 3), { runId: RUN.agi, groupId: B, weekNumber: 3, occurrence: 1, records: { amara: "present" }, markedByUid: "rahul", pushedAt: null, held: true });
    const { update, posted } = await changeThenPost("claudia", { week: 3, dateKey: "2026-11-17", kind: "cancel" });
    assert.equal(update.weekNumber, 3);
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
  });
});

describe("a week the change route cannot have changed", () => {
  test("a past week whose register was taken, a week past the run's end, a week only another group has: refused in one sentence, nothing posted or sent", async () => {
    // Week 2's register was taken and finished.
    world.db.seed(registerPath(B, 2), { runId: RUN.agi, groupId: B, weekNumber: 2, occurrence: 1, records: { amara: "present" }, markedByUid: "rahul", pushedAt: new Date("2026-11-10T20:30:00Z"), pushedByUid: "rahul", held: true });
    // Group B on a calendar of its own that ends at week 5; Group A keeps the run's six weeks.
    const groupB = world.db.read(`courseGroups/${B}`);
    const fiveWeeks = Array.from({ length: 5 }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` }));
    world.db.seed(`courseGroups/${B}`, { ...groupB, paceStartDate: "2026-10-29", paceWeekPlan: fiveWeeks });
    world.mail.length = 0;
    const before = everything();
    for (const [weekNumber, what] of [
      [2, "a week whose register was taken"],
      [7, "a week past the run's end"],
      [6, "a week only Group A has"],
      [60, "the last week the body allows"],
    ]) {
      for (const who of ["rahul", "claudia", "zach"]) {
        const answer = await aboutWeek(who, weekNumber);
        assert.deepEqual(
          [answer.status, answer.body],
          [400, { error: `Group B has no session in week ${weekNumber} that can still change, so nothing was posted or sent.` }],
          `${what}, as ${who}`,
        );
      }
    }
    // Emailed and tested alike: refused before the count, the caps or the test's send.
    const emailed = await ask.post("claudia", { to: "group", groupId: B, title: "About that week", message: "A word.", email: true, emailCount: 3, withFacilitators: true, weekNumber: 2 });
    assert.equal(emailed.status, 400);
    const tested = await ask.post("claudia", { to: "group", groupId: B, title: "About that week", message: "A word.", test: true, weekNumber: 2 });
    assert.equal(tested.status, 400);
    assert.equal(everything(), before, "a refused update wrote something");
    assert.equal(world.mail.length, 0);
    assert.deepEqual(updates(), []);
    // Group A's week 6 is Group A's to be told about.
    assert.equal((await aboutWeek("claudia", 6, A)).status, 200);
  });

  test("a session that has started, with no change on record: refused, and nobody moved out for good is emailed", async () => {
    // Amara was in Group B in weeks 1 and 2 and is in Group A for good from week 3; week 2 has no register.
    world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { groupId: A, groupsByWeek: [{ groupId: B, fromWeek: 1 }, { groupId: A, fromWeek: 3 }] });
    world.mail.length = 0;
    const before = everything();
    for (const email of [false, true]) {
      const answer = await ask.post("rahul", { to: "group", groupId: B, title: "About week 2", message: "A word about it.", email, ...(email ? { emailCount: 3 } : {}), withFacilitators: true, weekNumber: 2 });
      assert.deepEqual([answer.status, answer.body], [400, { error: "Group B has no session in week 2 that can still change, so nothing was posted or sent." }]);
    }
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a change to a session that has started is told about by the person who made it, within a day", async () => {
    const emailCount = await w.changeEmailsFor(B, "claudia");
    const changed = await ask.change("claudia", B, { reason: "Nobody came.", week: 3, dateKey: "2026-11-17", kind: "cancel", tell: true, emailCount });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    // Somebody else on the group's staff: refused.
    for (const who of ["rahul", "zach"]) {
      const answer = await aboutWeek(who, 3);
      assert.equal(answer.status, 400, `${who}: ${JSON.stringify(answer.body)}`);
    }
    // The person who made it, a day and a minute later: refused; within the day: posted.
    w.at("2026-11-20T10:01:00Z");
    assert.equal((await aboutWeek("claudia", 3)).status, 400);
    w.at("2026-11-20T09:59:00Z");
    assert.equal((await aboutWeek("claudia", 3)).status, 200);
  });

  test("with no week, an update to the group is as before", async () => {
    const answer = await ask.post("rahul", { to: "group", groupId: B, title: "Bring a pen", message: "We write by hand on Tuesday.", email: false });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  });
});
