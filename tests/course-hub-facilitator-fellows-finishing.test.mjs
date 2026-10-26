/**
 * Who finished, for a facilitator who holds a place: they count towards it
 * like everybody in their group, on the programme's Overview, behind the
 * lead's switch, and on their own programme page and hub.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/finishWorld.mjs`'s: the end of AGI Strategy's run,
 * every register finished, a rule of 4 of 6 sessions. Here Amara (Group A,
 * 6 of 6) also facilitates Group A, with Sofia. Callers: the programme's
 * lead (claudia), an admin (zach), Amara, a co-facilitator (sofia),
 * a member of the group (bea) and somebody signed out.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { A, END, RULE, RUN, decisionPath, makeFinishWorld, rulePath } from "./lib/finishWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: END });

const made = await makeFinishWorld("__facilitatorFellowsFinishing");
const { world, reset, pages, renderPage, ask, lib } = made;

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
  world.db.seed(rulePath, RULE(4));
  world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "amara"] });
});

/** Who finished as the lead's Overview is built from it. */
async function whoFinished(viewer = { isAdmin: false, uid: "claudia" }) {
  const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
  return lib.who.loadWhoFinished(world.courseDb, records, viewer, new Date());
}

describe("a facilitator who holds a place counts towards who finished, like everybody in their group", () => {
  test("the lead's list has them, with their sessions and answers, and counts them", async () => {
    const model = await whoFinished();
    assert.equal(model.state, "open");
    const amara = model.rows.find((row) => row.uid === "amara");
    assert.deepEqual([amara?.groupName, amara?.came, amara?.exercises, amara?.finished], ["Group A", "6 of 6", "6 of 6", true]);
    assert.equal(model.rows.length, 10, "the list counts a facilitator who holds a place, or counts somebody twice");
    // The Overview draws it as the lead reads it.
    const drawn = await renderPage(pages.overview, "claudia");
    assert.match(drawn.text, /Amara Okafor/);
    // Ten taking part, Amara among them: five over the rule and five not.
    assert.match(drawn.text, /5 finished · 5 not/);
    assert.match(drawn.text, /People 10 taking part/);
  });

  test("the lead switches them like anybody else, and the record says so", async () => {
    const off = await ask.decide("claudia", "amara", false);
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(world.db.read(decisionPath("amara")).finished, false);
    assert.equal((await whoFinished()).rows.find((row) => row.uid === "amara").finished, false);
  });

  test("their own programme page and hub say they finished, from the same record", async () => {
    const overview = await ask.overview("amara");
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    assert.equal(overview.body.finished, true);
    const entry = (await ask.me("amara")).find((run) => run.runId === RUN.agi);
    assert.equal(entry?.finished, true);
  });

  test("their co-facilitator, a member of the group and somebody signed out switch nothing", async () => {
    for (const who of ["sofia", "amara", "bea"]) {
      const refused = await ask.decide(who, "amara", false);
      assert.ok(refused.status === 403 || refused.status === 404, `${who}: ${refused.status}`);
    }
    assert.equal((await ask.decide(null, "amara", false)).status, 401);
    assert.equal(world.db.read(decisionPath("amara")), undefined);
    // An admin switches them, as the lead does.
    assert.equal((await ask.decide("zach", "amara", false)).status, 200);
  });
});
