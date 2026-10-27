/**
 * A facilitator who holds a place, leaving and being removed: both doors of
 * leaving ("Leave the programme" and "I can’t make it"), the programme page
 * that offers the way out, the confirmation page, and Remove.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The rule: they sit in the group they facilitate and run its sessions, so
 * they are taken off the group's facilitators first, by the programme's lead
 * or an admin (which leaves their place where it is), and then they can
 * leave, or be removed, like anybody else. Until then nothing is written,
 * and every door says why in one sentence.
 *
 * The world is `tests/lib/leavingWorld.mjs`'s: week 3 of AGI Strategy's run,
 * Amara in Group A, told, with a place that came through the form. Here Amara also
 * facilitates Group A, with Sofia. Callers: Amara, the programme's lead
 * (claudia), an admin (zach), and the run's track lead (yusuf).
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { A, NOW, OPEN_GROUP, OPEN_RUN, ROUND, RUN, leavingSeed, makeLeavingWorld } from "./lib/leavingWorld.mjs";

const made = await makeLeavingWorld("__facilitatorFellowsLeaving");
const { world, call, everything, routes, pages, reset, leave, draw, ui } = made;

mock.timers.enable({ apis: ["Date"], now: NOW });

/** Week 3, with Amara one of Group A's facilitators as well as one of its people. */
function begin() {
  mock.timers.setTime(NOW.getTime());
  reset(leavingSeed());
  world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "amara"] });
}

const SAYS = "You facilitate Group A, so you can’t leave the programme here. Ask the programme’s lead or an admin to take you off its facilitators first, then you can leave.";
const REMOVE_SAYS = "They facilitate Group A. Take them off its facilitators first, on the Facilitators view, then remove them.";

const rowOf = (uid) => world.db.read(`courseEnrolments/${RUN.agi}__${uid}`);
const remove = (who, uid) => call(who, routes.remove.POST, { runId: RUN.agi, uid }, { course: true });

describe("a facilitator who holds a place leaves once they are taken off the group's facilitators", () => {
  test("Leave the programme: refused in one sentence, and nothing is written", async () => {
    begin();
    const before = everything();
    const mailed = world.mail.length;
    assert.deepEqual(await leave("amara"), { status: 409, body: { error: SAYS } });
    assert.equal(everything(), before);
    assert.equal(world.mail.length, mailed, "a refused leave emailed somebody");
  });

  test("I can’t make it, on their own application page: the same sentence, and nothing is written", async () => {
    begin();
    const before = everything();
    const answer = await call("amara", routes.reply.POST, { roundId: ROUND }, { body: { reply: "cant-make-it", reason: { kind: "times", other: "" } } });
    assert.deepEqual(answer, { status: 409, body: { error: SAYS } });
    assert.equal(everything(), before);
  });

  test("their programme page draws no way out, and says why where it would be", async () => {
    begin();
    const drawn = await draw(pages.home, "amara", { runId: RUN.agi });
    assert.equal(drawn.to, null, JSON.stringify(drawn));
    assert.equal(ui.runHome.canLeave, false);
    assert.equal(ui.runHome.leaveNote, SAYS);
    // The confirmation page sends them back to the programme page.
    assert.equal((await draw(pages.leave, "amara", { runId: RUN.agi })).to, `/learn/${encodeURIComponent(RUN.agi)}`);
  });

  test("somebody else on the run, who facilitates nothing, still has the way out and no note", async () => {
    begin();
    await draw(pages.home, "dev", { runId: RUN.agi });
    assert.deepEqual([ui.runHome.canLeave, ui.runHome.leaveNote], [true, null]);
  });

  test("Remove is refused for them in one sentence, by the lead and by an admin, and nothing is written", async () => {
    begin();
    const before = everything();
    for (const who of ["claudia", "zach"]) {
      assert.deepEqual(await remove(who, "amara"), { status: 409, body: { error: REMOVE_SAYS } }, who);
    }
    assert.equal(everything(), before);
  });

  test("taken off the group's facilitators, their place is where it was, and they can leave, or be removed", async () => {
    begin();
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia"] });
    assert.deepEqual([rowOf("amara").status, rowOf("amara").groupId], ["active", A]);
    await draw(pages.home, "amara", { runId: RUN.agi });
    assert.deepEqual([ui.runHome.canLeave, ui.runHome.leaveNote], [true, null]);
    const left = await leave("amara");
    assert.equal(left.status, 200, JSON.stringify(left.body));
    assert.equal(rowOf("amara").status, "withdrawn");

    begin();
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia"] });
    const removed = await remove("claudia", "amara");
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(rowOf("amara").status, "removed");
  });

  test("on a run anyone can join, they keep their session while they facilitate it, and can change it once stood down", async () => {
    begin();
    // Kai took a seat in the open run's Tuesday drop-in, and facilitates it too.
    const OTHER = "pre-course-thursday__grp00010";
    world.db.seed(`courseGroups/${OTHER}`, {
      ...world.db.read(`courseGroups/${OPEN_GROUP}`),
      name: "Thursday drop-in",
      facilitatorUids: ["tom"],
      memberCount: 0,
      session: { weekday: 4, startTimeLocal: "17:00", durationMinutes: 60, location: "Room C2", meetingUrl: null, notes: "" },
    });
    world.db.poke(`courseGroups/${OPEN_GROUP}`, { facilitatorUids: ["tom", "kai"] });
    const move = () => call("kai", routes.enrol.PATCH, { runId: OPEN_RUN }, { body: { groupId: OTHER }, course: true });
    const before = everything();
    assert.deepEqual(await move(), {
      status: 409,
      body: { error: "You facilitate Tuesday drop-in, so your session is the one you run. Ask an admin to change which group you facilitate." },
    });
    assert.equal(everything(), before);
    // Leaving the open run is closed to them too, in leaving's own words.
    assert.equal((await leave("kai", { confirmName: world.db.read(`courseRuns/${OPEN_RUN}`).courseTitle }, OPEN_RUN)).status, 409);
    // Stood down, the session is theirs to change.
    world.db.poke(`courseGroups/${OPEN_GROUP}`, { facilitatorUids: ["tom"] });
    const moved = await move();
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(world.db.read(`courseEnrolments/${OPEN_RUN}__kai`).groupId, OTHER);
  });

  test("a facilitator of an archived group is no facilitator here: they leave like anybody else", async () => {
    begin();
    world.db.poke(`courseGroups/${A}`, { archived: true });
    // Their group archived, Amara is in no live group; leaving is the board's
    // own question then, and this rule asks nothing of an archived group.
    await draw(pages.home, "amara", { runId: RUN.agi });
    assert.equal(ui.runHome.leaveNote, null);
  });
});
