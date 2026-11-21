/**
 * PUTTING SOMEBODY BACK ON THE RUN IS ANSWERED ONLY FOR A CALLER SERVED THAT
 * PERSON'S ROW, as Remove is. `POST /api/courses/runs/[runId]/enrolments/[uid]/reinstate`
 * asks the board's own rule (`rowIsServedTo`) before anything about the
 * person is read: a row the application form placed is an admin's and the
 * programme lead's, so a run's track lead is answered about such a person as
 * about a uid with no place on the run. A row the track lead is served, an
 * admin and the lead are answered as before.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Amara holds her place through the form; Chloe applied to the run itself.
 * Yusuf is the run's track lead, Claudia leads the programme, Zach is an
 * admin.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { NOW, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__reinstateServedRows");
const { world, call } = w;
const reinstateRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "reinstate");

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const reinstate = (who, uid) => call(who, reinstateRoute.POST, { runId: RUN.agi, uid }, { course: true });
const NOT_FOUND = [404, { error: "Enrolment not found" }];
const LEFT = { status: "withdrawn", droppedOutAt: new Date("2026-11-16T10:00:00Z") };

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  world.mail.length = 0;
});

describe("putting somebody back, as a run's track lead", () => {
  test("somebody the application form placed: answered as a uid with no place, nothing written", async () => {
    assert.ok(read(`courseApplications/${RUN.agi}__amara`)?.fromForm, "Amara's row came from the form");
    world.db.poke(seatPath("amara"), LEFT);
    const before = JSON.stringify(read(seatPath("amara")));
    assert.deepEqual(await reinstate("yusuf", "amara").then((r) => [r.status, r.body]), NOT_FOUND);
    assert.deepEqual(await reinstate("yusuf", "nobody-at-all").then((r) => [r.status, r.body]), NOT_FOUND);
    assert.equal(JSON.stringify(read(seatPath("amara"))), before);
    assert.equal(world.mail.length, 0);
  });

  test("a row the track lead is served: put back as before", async () => {
    world.db.poke(seatPath("chloe"), { ...LEFT, selfEnrolled: true });
    const answer = await reinstate("yusuf", "chloe");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(read(seatPath("chloe")).status, "active");
  });

  test("an admin and the programme's lead are answered about Amara as before", async () => {
    world.db.poke(seatPath("amara"), LEFT);
    for (const who of ["zach", "claudia"]) {
      const answer = await reinstate(who, "amara");
      assert.deepEqual(
        [answer.status, answer.body.error],
        [409, "This member was placed by admissions rather than signing themselves up. Re-place them on the allocation board."],
        who,
      );
    }
  });
});
