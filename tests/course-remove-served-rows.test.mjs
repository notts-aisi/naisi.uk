/**
 * REMOVE SHOWS AND CALLS OFF A PERSON'S VISITS ONLY FOR A CALLER WHO IS
 * SERVED THAT PERSON'S ROW. `POST /api/courses/runs/[runId]/enrolments/[uid]/remove`
 * asks the board's own rule (`rowIsServedTo`) before anything about the
 * person is read: a row the application form placed is an admin's and the
 * programme lead's, so a run's track lead is answered about such a person as
 * about a uid with no place on the run, by the preview (which lists the
 * visits still to come) and by the press (which emails each host's
 * facilitators). A row the track lead is served, and an admin and the lead,
 * are answered as before.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Amara (Group A) holds her place through the form, and goes to Group B's
 * session in week 4; Chloe (Group B) applied to the run itself, and goes to
 * Group C's (Tom) tomorrow, for week 3. Yusuf is the
 * run's track lead, Claudia leads the programme, Zach is an admin.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__removeServedRows");
const { world, call } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const removeRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove");

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const remove = (who, uid, body) => call(who, removeRoute.POST, { runId: RUN.agi, uid }, { body, course: true });
const NOT_FOUND = [404, { error: "Enrolment not found" }];

/** A visit arranged by an admin the way the person's page arranges one. */
async function arrange(uid, weekNumber, hostGroupId) {
  const visit = (body) => call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
  const shown = await visit({ weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit({ weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}

beforeEach(async () => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  for (const [groupId, count] of [
    [A, 4],
    [B, 3],
    [C, 2],
    [D, 2],
  ]) {
    world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
  await arrange("amara", 4, B);
  await arrange("chloe", 3, C);
  world.mail.length = 0;
});

describe("a run's track lead and somebody the application form placed", () => {
  test("the preview and the press are answered as for a uid with no place: no visit named, nothing written, nobody emailed", async () => {
    assert.ok(read("courseApplications/" + `${RUN.agi}__amara`)?.fromForm, "Amara's row came from the form");
    const before = JSON.stringify(read(seatPath("amara")));
    const shown = await remove("yusuf", "amara", { preview: true });
    assert.deepEqual([shown.status, shown.body], NOT_FOUND);
    for (const body of [undefined, { emails: 0 }, { emails: 1 }, { emails: 2 }]) {
      const pressed = await remove("yusuf", "amara", body);
      assert.deepEqual([pressed.status, pressed.body], NOT_FOUND, JSON.stringify(body));
    }
    // The same answer as for somebody with no place on the run at all.
    assert.deepEqual(await remove("yusuf", "nobody-at-all", { preview: true }).then((r) => [r.status, r.body]), NOT_FOUND);
    assert.equal(JSON.stringify(read(seatPath("amara"))), before);
    assert.equal(world.mail.length, 0);
  });

  test("a row the track lead is served: the visit is named and called off as before", async () => {
    const shown = await remove("yusuf", "chloe", { preview: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview.visits, [{ hostName: "Group C", weekNumber: 3 }]);
    const pressed = await remove("yusuf", "chloe", { emails: shown.body.preview.emails });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.equal(read(seatPath("chloe")).status, "removed");
    assert.equal(world.mail.length, shown.body.preview.emails);
  });

  test("an admin and the programme's lead: Amara's visit is named, and the press goes through", async () => {
    for (const who of ["zach", "claudia"]) {
      const shown = await remove(who, "amara", { preview: true });
      assert.equal(shown.status, 200, `${who}: ${JSON.stringify(shown.body)}`);
      assert.deepEqual(shown.body.preview.visits, [{ hostName: "Group B", weekNumber: 4 }], who);
    }
    const shown = await remove("claudia", "amara", { preview: true });
    const pressed = await remove("claudia", "amara", { emails: shown.body.preview.emails });
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.equal(read(seatPath("amara")).status, "removed");
    assert.equal(world.mail.length, shown.body.preview.emails);
  });
});
