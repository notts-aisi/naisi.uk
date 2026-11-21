/**
 * A MOVE FOR GOOD ONCE SESSIONS HAVE MET IS MADE BY AN ADMIN OR THE
 * PROGRAMME'S LEAD, ON THE BOARD TOO. The board's mid-term path
 * (`POST /api/courses/runs/[runId]/allocate`, `saveBoardMove`: the week by
 * week record, a History row on each group) is held to the move page's own
 * rule (`movesForGoodMidTerm`), in the preview and at the press. A run's
 * track lead, who passes the board's gate, is refused it in one sentence
 * that says who to ask, and nothing is written or emailed; the same track
 * lead placing somebody before any session of their group has met is
 * answered as always.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Chloe is in Group B, which met weeks 1 and 2; she applied to the run
 * itself, so the run's track lead (Yusuf) is served her row. Claudia leads
 * the programme; Zach is an admin.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { A, B, C, D, NOW, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__boardMoveLeadOnly");
const { world, call } = w;

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));
const preview = (who, placements) => call(who, w.routes.allocate.POST, { runId: RUN.agi }, { body: { placements, preview: true }, course: true });
const place = (who, placements) => w.join.place(who, placements);
const REFUSED = "Chloe has already met with Group B, so only an admin or the programme’s lead can move Chloe now. Ask one of them.";

beforeEach(() => {
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
  world.mail.length = 0;
});

describe("a run's track lead and a move made mid-term", () => {
  test("refused in the preview and at the press, in one sentence that says who to ask; nothing written, nobody emailed", async () => {
    const shown = await preview("yusuf", [{ uid: "chloe", groupId: C }]);
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview, [{ uid: "chloe", groupId: C, fromWeek: null, words: null, refusal: { reason: "mid-term-lead-only", words: REFUSED } }]);
    const before = everything();
    for (const placement of [{ uid: "chloe", groupId: C }, { uid: "chloe", groupId: C, fromWeek: 3 }]) {
      const pressed = await place("yusuf", [placement]);
      assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
      assert.deepEqual([pressed.body.placed, pressed.body.rejected], [0, [{ uid: "chloe", reason: "mid-term-lead-only", words: REFUSED }]]);
    }
    assert.equal(everything(), before, "a refused move wrote something");
    assert.equal(world.mail.length, 0);
  });

  test("a seat that already has a week by week record: refused the same way, the record left as it is", async () => {
    world.db.poke(seatPath("chloe"), { groupsByWeek: [{ groupId: D, fromWeek: 1 }, { groupId: B, fromWeek: 2 }] });
    const before = everything();
    const pressed = await place("yusuf", [{ uid: "chloe", groupId: C }]);
    assert.deepEqual([pressed.status, pressed.body.placed, pressed.body.rejected], [200, 0, [{ uid: "chloe", reason: "mid-term-lead-only", words: REFUSED }]]);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("before any session of the group has met: the track lead's move is the board's plain move, as always", async () => {
    at("2026-10-30T12:00:00Z");
    const shown = await preview("yusuf", [{ uid: "chloe", groupId: C }]);
    assert.deepEqual(shown.body.preview, [{ uid: "chloe", groupId: C, fromWeek: null, words: null, refusal: null }]);
    const pressed = await place("yusuf", [{ uid: "chloe", groupId: C }]);
    assert.deepEqual([pressed.status, pressed.body.placed, pressed.body.rejected], [200, 1, []]);
    assert.equal(read(seatPath("chloe")).groupId, C);
    assert.equal(read(seatPath("chloe")).groupsByWeek, undefined);
  });

  test("an admin and the programme's lead: the week and the question, then the move from that week", async () => {
    for (const who of ["zach", "claudia"]) {
      w.reset();
      for (const [groupId, count] of [[A, 4], [B, 3], [C, 2], [D, 2]]) world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
      const shown = await preview(who, [{ uid: "chloe", groupId: C }]);
      const [entry] = shown.body.preview;
      assert.equal(typeof entry.fromWeek, "number", `${who}: ${JSON.stringify(entry)}`);
      assert.equal(entry.refusal, null, who);
      assert.match(entry.words, /^Move Chloe Nguyen to Group C from week \d+\?/, who);
      const pressed = await place(who, [{ uid: "chloe", groupId: C, fromWeek: entry.fromWeek }]);
      assert.deepEqual([pressed.status, pressed.body.placed, pressed.body.rejected], [200, 1, []], who);
      const seat = read(seatPath("chloe"));
      assert.equal(seat.groupId, C, who);
      assert.deepEqual(seat.groupsByWeek.map((each) => each.groupId), [B, C], who);
    }
  });
});
