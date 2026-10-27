/**
 * Which mail about a group reaches somebody placed in it, before and after
 * Publish has told them their group.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * Somebody learns their group from Publish's email and from nothing before
 * it: an email naming the group, its time or its room would tell them first.
 * So every lane that writes to a group's people leaves out a placement
 * Publish has not told (`placementIsTold` in
 * `src/lib/firestore/courseEnrolments.ts`):
 *
 *  - THE COHORT LANES, through `resolveCohortAudience`: the reminder a
 *    register push sends to its group, the week nudge, and the run email. Their
 *    audience is the run's mailing list, which Publish puts people on. Somebody
 *    moved to another group after Publish is still on the list, and is left
 *    out, not counted as skipped, until Publish tells them their new group;
 *  - A GROUP EMAIL OR ROOM NOTICE reaches exactly the sender's roster: a
 *    facilitator's, the people Publish has told; an admin's, everybody placed.
 *    That is held in `course-hub-group-published-facilitator.test.mjs`.
 *
 * The list is the one Publish writes, read back through the real resolver.
 * `tests/lib/groupPublishedWorld.mjs` says what is real and what is stubbed.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, OPEN_GROUP, RUN, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";

const made = await makeGroupWorld("__groupPublishedMail");
const { world, reset, call, routes, steps, audience } = made;

beforeEach(() => {
  reset();
});

const LANE = { logTag: "course hub test", overCapAdvice: "split it" };

/** Who a cohort send about one group would reach, by uid, with the skipped count. */
async function reach(groupId, runId = RUN.agi) {
  const found = await audience.resolveCohortAudience(world.courseDb, runId, LANE, { groupId });
  assert.equal(found.refusal, null);
  return { uids: found.members.map((m) => m.uid).sort(), skipped: found.skipped };
}

/** The whole run's audience, as the run email and the week nudge read it. */
async function reachRun() {
  const found = await audience.resolveCohortAudience(world.courseDb, RUN.agi, LANE);
  return found.members.map((m) => m.uid).sort();
}

describe("the cohort lanes reach the people Publish has told, and nobody it has not", () => {
  test("before Publish nobody is on the run's list, so nothing about a group reaches anybody", async () => {
    await steps.placed();
    assert.deepEqual(await reach(GROUP.monday), { uids: [], skipped: 0 });
    assert.deepEqual(await reachRun(), []);
  });

  test("after Publish each group's people, and the whole run's", async () => {
    await steps.published();
    assert.deepEqual(await reach(GROUP.monday), { uids: ["bea", "dev"], skipped: 0 });
    assert.deepEqual(await reach(GROUP.thursday), { uids: ["amara", "tariq"], skipped: 0 });
    assert.deepEqual(await reachRun(), ["amara", "bea", "dev", "tariq"]);
  });

  test("somebody moved after Publish is left out of every lane, not counted as skipped, until Publish tells them", async () => {
    await steps.published();
    await steps.place([{ uid: "amara", groupId: GROUP.monday }]);
    // Still on the run's list: Publish put them there and a move takes nobody off.
    const rows = world.db
      .paths()
      .filter((path) => path.startsWith("subscriptions/"))
      .map((path) => world.db.read(path))
      .filter((row) => row.channel === `cohort:${RUN.agi}` && row.audienceId === "amara");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].subscribed, true);

    assert.deepEqual(await reach(GROUP.monday), { uids: ["bea", "dev"], skipped: 0 });
    assert.deepEqual(await reach(GROUP.thursday), { uids: ["tariq"], skipped: 0 });
    assert.deepEqual(await reachRun(), ["bea", "dev", "tariq"]);

    await steps.publishes();
    assert.deepEqual(await reach(GROUP.monday), { uids: ["amara", "bea", "dev"], skipped: 0 });
    assert.deepEqual(await reachRun(), ["amara", "bea", "dev", "tariq"]);
  });

  test("on an open sign-up run the people who picked a group are reached at once", async () => {
    for (const who of ["nobody", "ines"]) {
      const took = await call(who, routes.enrol.POST, { runId: RUN.other }, { body: { groupId: OPEN_GROUP } });
      assert.equal(took.status, 200, JSON.stringify(took.body));
    }
    assert.deepEqual(await reach(OPEN_GROUP, RUN.other), { uids: ["ines", "nobody"], skipped: 0 });
  });
});

/**
 * What one message the mail door was handed is: Publish's placement email,
 * its facilitators' email ("You’re facilitating"), or the presser's test of
 * either, which is marked in its subject and logged as a test. Anything else
 * is answered with its own kind and subject, so a comparison names it.
 */
function whatItIs(mail) {
  const test = mail.subject.startsWith("[TEST] ");
  if (mail.kind !== (test ? "course-test" : "course-application")) return `${mail.kind}: ${mail.subject}`;
  const subject = test ? mail.subject.slice("[TEST] ".length) : mail.subject;
  // The board's subject since October 2026 ("Your AGI Strategy group:
  // Tuesdays at 6pm"); until then "Your AGI Strategy Fellowship group: first
  // session ...". Either way the email that tells somebody their group.
  const what = subject.startsWith("Your AGI Strategy group: ")
    ? "placement"
    : subject.startsWith("You’re facilitating ")
      ? "facilitating"
      : `${mail.kind}: ${mail.subject}`;
  return test ? `test of ${what}` : what;
}

/** The addresses the messages of one kind went to, sorted. */
const sentTo = (what) =>
  world.mail
    .filter((mail) => whatItIs(mail) === what)
    .map((mail) => mail.to)
    .sort();

const addressOf = (uid) => world.db.read(`users/${uid}`).email;

describe("Publish itself is the one email before which nothing reaches them", () => {
  test("placing everybody emails nobody; Publish emails each person once; a move emails nobody", async () => {
    await steps.placed();
    assert.equal(world.mail.length, 0);
    await steps.publishes();
    // Seven messages and nothing else, in the order the board's press makes
    // them: the presser's test of Publish's two emails, then the people's
    // emails, then the facilitators'. Claudia, who facilitates Monday's
    // group, leads AGI Strategy, the programme that names the run: she signs
    // the facilitators' email and is never sent it (the walk of stage one,
    // October 2026), so only Tess is.
    assert.deepEqual(world.mail.map(whatItIs), [
      "test of placement",
      "test of facilitating",
      "placement",
      "placement",
      "placement",
      "placement",
      "facilitating",
    ]);
    // Each person placed is emailed their group once, at their own address.
    assert.deepEqual(sentTo("placement"), ["amara", "bea", "dev", "tariq"].map(addressOf).sort());
    // Each group with people in it tells its facilitator once, but never
    // the programme's lead, who signs the email.
    assert.deepEqual(sentTo("facilitating"), ["tess"].map(addressOf).sort());
    // The test reaches the presser and nobody else.
    assert.deepEqual(
      [...sentTo("test of placement"), ...sentTo("test of facilitating")],
      [addressOf("zach"), addressOf("zach")],
    );
    world.mail.length = 0;
    await steps.place([{ uid: "dev", groupId: GROUP.thursday }]);
    assert.equal(world.mail.length, 0, "a move after Publish emailed somebody");
  });
});
