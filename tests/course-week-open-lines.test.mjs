/**
 * "WEEK N IS OPEN" GAINS TWO LINES, through BOTH of its senders: the
 * `courses-next-week-email` job on its schedule, and finishing a register
 * while that job is off (`POST .../attendance/push`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. ROOM TO BE CONFIRMED. A session in a room not booked yet: the email
 *     goes (the schedule no longer holds it, and raises no card), with the
 *     line "Room to be confirmed: we’ll email you as soon as it’s booked, and
 *     it’ll be on your programme page." An online week says Online and has no
 *     such line.
 *  2. AN EARLIER WEEK NOT DONE. Each person's own email adds "Week 1 isn’t
 *     done yet either: it’s still open on your programme page." when week 1
 *     (written as blocks, published) is not done by them, its session has
 *     passed and they had joined the group by then. Nobody else's email says
 *     it: not somebody whose week 1 is done, not somebody told their group
 *     after week 1's session.
 *  3. NOTHING ELSE about when or to whom it goes changes: once per group per
 *     session, to everybody holding a place in the group.
 *
 * Mail goes to the register world's stand-in door (`tests/lib/registerWorld.mjs`),
 * and every message is rendered with the real template before its words are
 * read.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { AT, GROUP, RUN, jobContext, makeWorld, seedWorld } from "./lib/registerWorld.mjs";
import { remindWeek } from "./lib/remindWeek.mjs";

const made = makeWorld("__weekOpenLines");
const { world, reset, call, courseRoute, lib } = made;
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const { nextWeekEmailJob } = await lib("scheduler", "jobs", "nextWeekEmail.ts");
const { heldEmailTaskId } = await lib("courses", "heldEmailTask.ts");

mock.timers.enable({ apis: ["Date"], now: AT.week1Evening });
const at = (instant) => mock.timers.setTime(instant.getTime());

const MEMBERS_B = ["amara", "chloe", "farah"];
const mailTo = (uid) => world.mail.filter((message) => message.to === `${uid}@example.com`);
const weekTwo = (uid) => mailTo(uid).filter((message) => message.subject.startsWith("Week 2 is open"));
const textOf = async (message) => (await render(message.react, { plainText: true })).replace(/\s+/g, " ");

const ROOM_LINE = "Room to be confirmed: we’ll email you as soon as it’s booked, and it’ll be on your programme page.";
const EARLIER_LINE = "Week 1 isn’t done yet either: it’s still open on your programme page.";

/** Before Group B's week 1 session (Tue 20 Oct, 6pm BST). */
const BEFORE_WEEK1 = new Date("2026-10-19T12:00:00Z");

/**
 * Week 1 written as blocks and published. Amara did all of it before its
 * session; Chloe did one reading; Farah was told her group after it, on Wed
 * 21 Oct at 7am, before week 2's email.
 */
function seedLines(options = {}) {
  const seed = seedWorld(options);
  seed[`courseRuns/${RUN}/weeks/w01`] = { ...seed[`courseRuns/${RUN}/weeks/w01`], blocks: remindWeek("e1"), published: true };
  const tick = (uid, itemId) => [
    `courseProgress/${RUN}__${uid}__${itemId}`,
    { runId: RUN, uid, weekNumber: 1, itemKind: "material", itemId, completed: true, completedAt: BEFORE_WEEK1, updatedAt: BEFORE_WEEK1 },
  ];
  const rows = [
    tick("amara", "e1-s1"),
    tick("amara", "e1-s2"),
    [
      `courseExerciseResponses/${RUN}__amara__w01__e1-rp1`,
      { runId: RUN, uid: "amara", weekId: "w01", weekNumber: 1, exerciseId: "e1-rp1", kind: "reflection", responseType: "text", text: "A thought.", firstWrittenAt: BEFORE_WEEK1, updatedAt: BEFORE_WEEK1 },
    ],
    [
      `courseExerciseResponses/${RUN}__amara__w01__e1-wa`,
      { runId: RUN, uid: "amara", weekId: "w01", weekNumber: 1, exerciseId: "e1-wa", text: "word ".repeat(20).trim(), words: 20, firstWrittenAt: BEFORE_WEEK1, updatedAt: BEFORE_WEEK1, firstSentAt: BEFORE_WEEK1, sentAt: BEFORE_WEEK1 },
    ],
    tick("chloe", "e1-s1"),
  ];
  for (const [path, doc] of rows) seed[path] = doc;
  const farah = Object.keys(seed).find((path) => path.startsWith("courseEnrolments/") && path.endsWith("__farah") && seed[path].runId === RUN);
  seed[farah] = { ...seed[farah], allocatedEmailAt: new Date("2026-10-21T06:00:00Z") };
  return seed;
}

async function finishWeekOne() {
  const marked = await call(
    "rahul",
    register.POST,
    { groupId: GROUP.b },
    { body: { weekNumber: 1, marks: MEMBERS_B.map((uid) => ({ uid, status: "present" })) } },
  );
  assert.equal(marked.status, 200, JSON.stringify(marked.body));
  return call("rahul", push.POST, { groupId: GROUP.b }, { body: { weekNumber: 1 } });
}

async function runJob(instant) {
  at(instant);
  return nextWeekEmailJob.handler(jobContext(nextWeekEmailJob, instant).ctx);
}

beforeEach(() => at(AT.week1Evening));

describe("through the register's push, while the email is not on its schedule", () => {
  beforeEach(() => reset(seedLines()));

  /** The morning after week 1's session, once Farah has been told her group. */
  const MORNING_AFTER = new Date("2026-10-21T06:30:00Z");

  test("each person's own email: the earlier week's line for whoever has not done it, and for nobody else", async () => {
    at(MORNING_AFTER);
    const done = await finishWeekOne();
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.sent, MEMBERS_B.length, "everybody holding a place, as before");
    assert.match(await textOf(weekTwo("chloe")[0]), new RegExp(EARLIER_LINE));
    assert.doesNotMatch(await textOf(weekTwo("amara")[0]), /isn’t done yet either/, "done");
    assert.doesNotMatch(await textOf(weekTwo("farah")[0]), /isn’t done yet either/, "told after the session");
  });

  test("a room not booked yet: the line, and the email goes", async () => {
    at(MORNING_AFTER);
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "" });
    const done = await finishWeekOne();
    assert.equal(done.body.sent, MEMBERS_B.length);
    const text = await textOf(weekTwo("amara")[0]);
    assert.match(text, /Your next session is Tue 27 Oct at 6pm\. Room to be confirmed: /);
    assert.ok(text.includes(ROOM_LINE));
  });
});

describe("through the job, on its schedule", () => {
  beforeEach(() => reset(seedLines({ scheduled: true })));

  test("each person's own email: the earlier week's line for whoever has not done it, and for nobody else", async () => {
    await runJob(AT.groupBDue);
    for (const uid of MEMBERS_B) assert.equal(weekTwo(uid).length, 1, `${uid} once`);
    assert.match(await textOf(weekTwo("chloe")[0]), new RegExp(EARLIER_LINE));
    assert.doesNotMatch(await textOf(weekTwo("amara")[0]), /isn’t done yet either/);
    assert.doesNotMatch(await textOf(weekTwo("farah")[0]), /isn’t done yet either/);
    await runJob(new Date(AT.groupBDue.getTime() + 15 * 60_000));
    for (const uid of MEMBERS_B) assert.equal(weekTwo(uid).length, 1, `${uid} still once`);
  });

  test("a room not booked yet no longer holds it: it goes with the line, and no card", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "" });
    await runJob(AT.groupBDue);
    for (const uid of MEMBERS_B) assert.equal(weekTwo(uid).length, 1, uid);
    assert.ok((await textOf(weekTwo("chloe")[0])).includes(ROOM_LINE));
    assert.equal(world.db.read(`tasks/${heldEmailTaskId(RUN, GROUP.b, "w02")}`), undefined);
  });

  test("an online week says Online, and nothing about a room", async () => {
    world.db.poke(`courseGroups/${GROUP.b}`, { "session.location": "", sessionModes: { w02: "virtual" }, "session.meetingUrl": "https://meet.example.com/x" });
    await runJob(AT.groupBDue);
    const text = await textOf(weekTwo("amara")[0]);
    assert.match(text, /Your next session is Tue 27 Oct at 6pm, online\./);
    assert.doesNotMatch(text, /Room to be confirmed/);
    assert.doesNotMatch(text, /meet\.example\.com/);
  });

  test("an earlier week not written as blocks has no line, and the email goes", async () => {
    world.db.poke(`courseRuns/${RUN}/weeks/w01`, { blocks: "not blocks at all" });
    await runJob(AT.groupBDue);
    for (const uid of MEMBERS_B) assert.equal(weekTwo(uid).length, 1, uid);
    assert.doesNotMatch(await textOf(weekTwo("chloe")[0]), /isn’t done yet either/);
  });
});
