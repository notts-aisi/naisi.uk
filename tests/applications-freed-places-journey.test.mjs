/**
 * A FREED PLACE, FROM THE OFFER TO A GROUP: the whole path, through the real
 * handlers, on one set of documents.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * Somebody who accepts a freed place holds a place, read by `holdingOf()` and
 * nothing else, so the path #67 built for everybody holding one is theirs
 * with no second reading: an admin presses Hand over again and it adds only
 * who is missing, places them on the allocation board, and presses Publish,
 * which emails only them. Before they accept, none of it moves: an offer
 * nobody has answered is not a place.
 *
 * Driven, in order: the hand-over, a placement and Publish for the people
 * decision day placed; then the freed place's test and offer; the person's
 * reply; the hand-over again; their placement; Publish again; and their own
 * member area. Each as the caller who really makes it.
 *
 * Real: every handler, the libraries behind them, the email templates.
 * Stubbed: what `tests/lib/freedPlacesWorld.mjs` stubs.
 */
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGI,
  GROUP,
  ROUND,
  RUN,
  applicationPath,
  freedSeed,
  loadRoutes,
  makeFreedWorld,
} from "./lib/freedPlacesWorld.mjs";

const TUESDAY = new Date("2026-10-27T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: TUESDAY });

const made = makeFreedWorld("__freedJourney");
const { world, reset } = made;
const api = await loadRoutes(made);
const REPLY_BY = "2026-10-29";
const HOLDERS = ["amara", "bea", "dev", "tariq"];
const rowsOnTheRun = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith(`courseApplications/${RUN.agi}__`))
    .map((path) => world.db.read(path).uid)
    .sort();
const sentTo = () => world.mail.map((message) => message.to);

describe("from a freed place to a group", () => {
  before(() => {
    mock.timers.setTime(TUESDAY.getTime());
    reset(freedSeed());
  });

  test("decision day's people are handed over, placed and told their group", async () => {
    const pressed = await api.handOver();
    assert.deepEqual(pressed.body.receipt, { handedOver: 4, alreadyThere: 0 });
    const placed = await api.place("zach", [
      { uid: "amara", groupId: GROUP.thursday },
      { uid: "bea", groupId: GROUP.thursday },
      { uid: "dev", groupId: GROUP.monday },
      { uid: "tariq", groupId: GROUP.monday },
    ]);
    assert.deepEqual(placed.body, { ok: true, placed: 4, rejected: [] });
    const published = await api.publish();
    assert.equal(published.status, 200, JSON.stringify(published.body));
    // Publish sends the presser a test first and tells each group's
    // facilitators (the course hub's Publish, October 2026), so the mail is
    // the presser's two tests, a placement email to each holder, and one
    // "You’re facilitating" to Claudia for each of the two groups.
    const tests = world.mail.filter((message) => message.subject.startsWith("[TEST]"));
    const facilitating = world.mail.filter((message) => message.subject.startsWith("You’re facilitating"));
    const placing = world.mail.filter((message) => !tests.includes(message) && !facilitating.includes(message));
    assert.deepEqual(tests.map((message) => message.to), ["zach@example.com", "zach@example.com"]);
    assert.deepEqual(placing.map((message) => message.to).sort(), HOLDERS.map((uid) => `${uid}@example.com`));
    assert.deepEqual(facilitating.map((message) => message.to), ["claudia@example.com", "claudia@example.com"]);
    world.mail.length = 0;
  });

  test("Omar is offered a freed place, after a test, and nothing on the run moves", async () => {
    await api.test("zach", { uid: "omar", groupId: GROUP.monday, replyBy: REPLY_BY });
    const offered = await api.offer("zach", {
      picks: [{ uid: "omar", groupId: GROUP.monday }],
      replyBy: REPLY_BY,
      invitations: 1,
    });
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
    assert.deepEqual(sentTo(), ["zach@example.com", "omar@example.com"]);
    world.mail.length = 0;
    // An offer nobody has answered is not a place: the press adds nobody.
    assert.deepEqual((await api.handOver()).body.receipt, { handedOver: 0, alreadyThere: 4 });
    assert.deepEqual(rowsOnTheRun(), HOLDERS);
  });

  test("he accepts on his own application page, with decision day's Accept", async () => {
    const answered = await api.reply("omar", { reply: "accept-invitation" });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.equal(world.db.read(applicationPath("omar")).status, "accepted");
    // A place is not a run: nothing on the course side shows him anything yet.
    assert.deepEqual(await api.me("omar"), []);
  });

  test("Hand over again adds only him, and says so", async () => {
    const before_ = world.db.read(`courseRuns/${RUN.agi}`).applicationCounts.accepted;
    const pressed = await api.handOver();
    assert.deepEqual(pressed.body.receipt, { handedOver: 1, alreadyThere: 4 });
    assert.deepEqual(rowsOnTheRun(), [...HOLDERS, "omar"].sort());
    const row = world.db.read(`courseApplications/${RUN.agi}__omar`);
    assert.deepEqual([row.status, row.fromForm], ["accepted", { roundId: ROUND, programmeId: AGI }]);
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`).applicationCounts.accepted, before_ + 1);
    // And a press after that writes nothing at all.
    assert.deepEqual((await api.handOver()).body.receipt, { handedOver: 0, alreadyThere: 5 });
  });

  test("he is placed in the group whose time his email named", async () => {
    const placed = await api.place("zach", [{ uid: "omar", groupId: GROUP.monday }]);
    assert.deepEqual(placed.body, { ok: true, placed: 1, rejected: [] });
    assert.equal(world.db.read(`courseEnrolments/${RUN.agi}__omar`).groupId, GROUP.monday);
  });

  test("Publish again emails only him", async () => {
    const published = await api.publish();
    assert.equal(published.status, 200, JSON.stringify(published.body));
    // The answer says what became of each email (the course hub's Publish):
    // one placement email, to him, and nothing to his group's facilitators,
    // who were told on the first press. No second test: the wording has not
    // changed since the first.
    assert.deepEqual(published.body.report.people, { sent: 1, held: 0, suppressed: 0 });
    assert.deepEqual(published.body.report.facilitators, { sent: 0, held: 0, suppressed: 0 });
    assert.deepEqual(sentTo(), ["omar@example.com"]);
    assert.ok(world.db.read(`courseEnrolments/${RUN.agi}__omar`).allocatedEmailAt instanceof Date);
  });

  test("and the run is now his, in his own member area", async () => {
    const runs = await api.me("omar");
    assert.equal(runs.length, 1);
    assert.equal(runs[0].runId ?? runs[0].id, RUN.agi);
  });

  test("the seat his offer waited on is now his place in the group, counted once", async () => {
    const group = world.db.read(`courseGroups/${GROUP.monday}`);
    assert.equal(group.memberCount, 3);
  });
});

describe("somebody who says no thanks is never handed over", () => {
  before(() => {
    mock.timers.setTime(TUESDAY.getTime());
    reset(freedSeed());
  });

  test("offered, then no thanks: the press adds nobody, and the place is free again", async () => {
    await api.handOver();
    await api.test("zach", { uid: "george", groupId: GROUP.monday, replyBy: REPLY_BY });
    await api.offer("zach", { picks: [{ uid: "george", groupId: GROUP.monday }], replyBy: REPLY_BY, invitations: 1 });
    const answered = await api.reply("george", { reply: "decline-invitation", reason: { kind: "times" } });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.deepEqual((await api.handOver()).body.receipt, { handedOver: 0, alreadyThere: 4 });
    assert.deepEqual(rowsOnTheRun(), HOLDERS);
    // Two places are free again: George's came back.
    await api.test("zach", { uid: "omar", groupId: GROUP.monday, replyBy: REPLY_BY });
    const both = await api.offer("zach", {
      picks: [
        { uid: "omar", groupId: GROUP.monday },
        { uid: "lena", groupId: GROUP.monday },
      ],
      replyBy: REPLY_BY,
      invitations: 2,
    });
    // Lena's week covers no group, so the press is refused whole; Omar alone goes.
    assert.equal(both.status, 409);
    const alone = await api.offer("zach", {
      picks: [{ uid: "omar", groupId: GROUP.monday }],
      replyBy: REPLY_BY,
      invitations: 1,
    });
    assert.equal(alone.status, 200);
  });
});
