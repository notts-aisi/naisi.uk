/**
 * What a group's facilitator is shown of the people placed in it, before and
 * after Publish has told them their group.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * The course hub boards: a facilitator "will see your group's names when
 * groups go out", and somebody's placement is shown to nobody but an admin
 * until Publish has emailed them their group (`placementIsShownTo` in
 * `src/lib/firestore/courseEnrolments.ts`). So, for a facilitator:
 *
 *  - FROM THE MOMENT THEY ARE ADDED they see that they facilitate the group,
 *    its day, its time and its room, and the run is open to them;
 *  - BEFORE PUBLISH no name of anybody placed in it: not on the roster, the
 *    register, the review queue, or in a mark, a note or a review they could
 *    make. They are told the names come when groups go out (`notYetTold`),
 *    and a group email reaches nobody;
 *  - AFTER PUBLISH the names of everybody Publish has told, and nobody it
 *    has not: somebody moved in afterwards is shown once Publish is pressed
 *    again;
 *  - AN ADMIN is shown everybody placed, everywhere, as before.
 *
 * `tests/lib/groupPublishedWorld.mjs` says what is real and what is stubbed.
 * `claudia` facilitates the Monday group (`dev`, `bea`); `tess` the Thursday
 * group (`amara`, `tariq`).
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { GROUP, RUN, makeGroupWorld, responseOf } from "./lib/groupPublishedWorld.mjs";

const made = await makeGroupWorld("__groupPublishedFacilitator");
const { world, reset, call, routes, steps, ask } = made;

beforeEach(() => {
  reset();
});

const MONDAY_PEOPLE = ["bea", "dev"];
/** Every word of the names of the people placed on the AGI run. */
const NAMES = ["Amara", "Okafor", "Dev Patel", "Bea", "Lindqvist", "Tariq", "Mensah"];

const mark = (who, groupId, uid) =>
  call(who, routes.register.POST, { groupId }, { body: { weekNumber: 1, marks: [{ uid, status: "present" }] } });
const note = (who, groupId, uid) =>
  call(who, routes.participantNotes.POST, { groupId }, { body: { weekNumber: 1, uid, note: "Asked a good question." } });
const review = (who, uid) =>
  call(who, routes.review.POST, { responseId: responseOf(uid) }, { body: { reviewStatus: "seen" } });
const groupEmail = (who, groupId) =>
  call(who, routes.groupEmail.POST, { groupId }, { body: { subject: "This week", body: "Bring the reading." } });
const notice = (who, groupId) =>
  call(who, routes.notice.POST, { groupId }, { body: { message: "We are in B52 tonight." } });

/** The uids in a roster or register answer. */
const uidsOf = (answer) => (answer.body.members ?? answer.body.rows ?? []).map((m) => m.uid).sort();

// ---------------------------------------------------------------------------
// From the moment they are added
// ---------------------------------------------------------------------------

describe("before Publish a facilitator sees their group, its day, time and room, and no names", () => {
  test("the run is theirs, and their group's card names the session and no member", async () => {
    await steps.placed();
    const hub = await ask.me("claudia");
    assert.deepEqual(hub.map((entry) => [entry.runId, entry.roles]), [[RUN.agi, ["facilitator"]]]);
    assert.equal((await ask.access("claudia")).canLearn, true);
    const overview = await ask.overview("claudia");
    assert.equal(overview.status, 200);
    const card = overview.body.groups.find((group) => group.id === GROUP.monday);
    assert.deepEqual(
      [card.name, card.sessionLabel, card.location],
      ["Monday evening", "Mondays 18:00–19:30", "Room B12"],
    );
    for (const name of NAMES) {
      assert.ok(!JSON.stringify(overview.body).includes(name), `the overview names ${name}`);
    }
  });

  test("the roster, the register and the review queue name nobody, and say names are to come", async () => {
    await steps.placed();
    const roster = await ask.roster("claudia", GROUP.monday);
    assert.equal(roster.status, 200);
    assert.deepEqual([roster.body.members, roster.body.notYetTold], [[], true]);
    assert.deepEqual(roster.body.facilitators.map((f) => f.uid), ["claudia"]);

    const register = await ask.register("claudia", GROUP.monday);
    assert.equal(register.status, 200, JSON.stringify(register.body));
    assert.deepEqual([register.body.members, register.body.notYetTold], [[], true]);

    const queue = await ask.queue("claudia", GROUP.monday);
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    assert.deepEqual([queue.body.rows, queue.body.notYetTold], [[], true]);

    for (const answer of [roster, register, queue]) {
      for (const name of NAMES) {
        assert.ok(!JSON.stringify(answer.body).includes(name), `an answer names ${name}`);
      }
      assert.ok(!JSON.stringify(answer.body).includes("dev wrote this."), "an answer carries a member's work");
    }
  });

  test("nothing they could do acts on somebody nobody has told: a mark, a note, a review", async () => {
    await steps.placed();
    const marked = await mark("claudia", GROUP.monday, "dev");
    assert.deepEqual([marked.status, marked.body.error], [400, "Someone in that batch isn't an active member of this group."]);
    const noted = await note("claudia", GROUP.monday, "dev");
    assert.deepEqual([noted.status, noted.body.error], [400, "That person isn't an active member of this group."]);
    const reviewed = await review("claudia", "dev");
    assert.deepEqual([reviewed.status, reviewed.body.error], [403, "Forbidden"]);
    assert.equal(world.db.read(`courseExerciseResponses/${responseOf("dev")}`).reviewStatus, "unreviewed");
  });

  test("a group email and a room notice from them reach nobody", async () => {
    await steps.placed();
    const emailed = await groupEmail("claudia", GROUP.monday);
    assert.deepEqual([emailed.status, emailed.body.sent], [200, 0], JSON.stringify(emailed.body));
    const told = await notice("claudia", GROUP.monday);
    assert.equal(told.status, 200, JSON.stringify(told.body));
    assert.equal(told.body.sent, 0);
    assert.equal(world.mail.length, 0);
    assert.equal(world.pushes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// After Publish
// ---------------------------------------------------------------------------

describe("after Publish a facilitator is shown the people Publish told", () => {
  test("the roster, the register and the review queue name them, and nobody is waiting", async () => {
    await steps.published();
    const roster = await ask.roster("claudia", GROUP.monday);
    assert.deepEqual([uidsOf(roster), roster.body.notYetTold], [MONDAY_PEOPLE, false]);
    const register = await ask.register("claudia", GROUP.monday);
    assert.deepEqual([uidsOf(register), register.body.notYetTold], [MONDAY_PEOPLE, false]);
    const queue = await ask.queue("claudia", GROUP.monday);
    assert.deepEqual([uidsOf(queue), queue.body.notYetTold], [MONDAY_PEOPLE, false]);
    assert.equal(queue.body.rows.find((row) => row.uid === "dev").responses[0].text, "dev wrote this.");
  });

  test("they can mark, note and review the people in their group", async () => {
    await steps.published();
    assert.equal((await mark("claudia", GROUP.monday, "dev")).status, 200);
    assert.equal((await note("claudia", GROUP.monday, "dev")).status, 200);
    assert.equal((await review("claudia", "dev")).status, 200);
    assert.equal(world.db.read(`courseExerciseResponses/${responseOf("dev")}`).reviewStatus, "seen");
  });

  test("a group email from them reaches each person in the group, one message each", async () => {
    await steps.published();
    world.mail.length = 0;
    const emailed = await groupEmail("claudia", GROUP.monday);
    assert.deepEqual([emailed.status, emailed.body.sent], [200, 2], JSON.stringify(emailed.body));
    assert.deepEqual(
      world.mail.map((m) => m.to).sort(),
      MONDAY_PEOPLE.map((uid) => world.db.read(`users/${uid}`).email).sort(),
    );
  });

  test("another group's facilitator is shown nothing of this group, as before", async () => {
    await steps.published();
    assert.equal((await ask.roster("tess", GROUP.monday)).status, 403);
    assert.equal((await ask.register("tess", GROUP.monday)).status, 403);
    assert.deepEqual(uidsOf(await ask.roster("tess", GROUP.thursday)), ["amara", "tariq"]);
  });
});

// ---------------------------------------------------------------------------
// Somebody moved in after Publish
// ---------------------------------------------------------------------------

describe("somebody moved into the group after Publish is shown to its facilitator once Publish tells them", () => {
  test("until then they are on no roster, register or queue, and no send reaches them", async () => {
    await steps.published();
    await steps.place([{ uid: "amara", groupId: GROUP.monday }]);
    const roster = await ask.roster("claudia", GROUP.monday);
    assert.deepEqual([uidsOf(roster), roster.body.notYetTold], [MONDAY_PEOPLE, true]);
    assert.deepEqual(uidsOf(await ask.register("claudia", GROUP.monday)), MONDAY_PEOPLE);
    assert.deepEqual(uidsOf(await ask.queue("claudia", GROUP.monday)), MONDAY_PEOPLE);
    assert.equal((await mark("claudia", GROUP.monday, "amara")).status, 400);
    assert.equal((await review("claudia", "amara")).status, 403);
    // The group they left: not theirs any more, and its facilitator waits for nobody.
    const left = await ask.roster("tess", GROUP.thursday);
    assert.deepEqual([uidsOf(left), left.body.notYetTold], [["tariq"], false]);
    // A send reaches the two Publish has told.
    world.mail.length = 0;
    assert.equal((await groupEmail("claudia", GROUP.monday)).body.sent, 2);
    assert.ok(!world.mail.some((m) => m.to === world.db.read("users/amara").email));

    await steps.publishes();
    const after = await ask.roster("claudia", GROUP.monday);
    assert.deepEqual([uidsOf(after), after.body.notYetTold], [["amara", ...MONDAY_PEOPLE], false]);
    assert.equal((await review("claudia", "amara")).status, 200);
  });
});

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

describe("an admin is shown everybody placed, before Publish and after it", () => {
  test("the roster, the register and the queue list the group, and an admin acts on it", async () => {
    await steps.placed();
    const roster = await ask.roster("zach", GROUP.monday);
    assert.deepEqual([uidsOf(roster), roster.body.notYetTold], [MONDAY_PEOPLE, false]);
    const register = await ask.register("zach", GROUP.monday);
    assert.deepEqual([uidsOf(register), register.body.notYetTold], [MONDAY_PEOPLE, false]);
    assert.deepEqual(uidsOf(await ask.queue("zach", GROUP.monday)), MONDAY_PEOPLE);
    assert.equal((await mark("zach", GROUP.monday, "dev")).status, 200);
    assert.equal((await review("zach", "dev")).status, 200);
  });

  test("an admin's group email reaches everybody the admin's roster lists, and says how many", async () => {
    await steps.placed();
    const emailed = await groupEmail("zach", GROUP.monday);
    assert.deepEqual([emailed.status, emailed.body.sent], [200, 2], JSON.stringify(emailed.body));
    assert.equal(uidsOf(await ask.roster("zach", GROUP.monday)).length, emailed.body.sent);
  });
});
