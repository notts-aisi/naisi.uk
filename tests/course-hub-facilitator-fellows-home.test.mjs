/**
 * Home, the hub and the group page for a facilitator who holds a place.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Their row on the run is a learner's and they facilitate through the group,
 * so the hub (`/api/courses/me`) reads the role off the groups too: their run
 * carries both roles, Home gives them the facilitator's Home as it gives
 * anybody who facilitates, and one line points to their own week. Their own
 * answers wait for the programme's lead or an admin, never for their
 * co-facilitators.
 *
 * The world is `tests/lib/facilitatorPagesWorld.mjs`'s: week 3 of AGI
 * Strategy's run, its registers and answers. Here Amara (Group A, told) also
 * facilitates Group A, with Sofia. Callers: Amara, Sofia (a co-facilitator),
 * Rahul (a facilitator of another group, who holds no place), Bea (a member
 * of Group A) and the admin (zach).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, NOW, RUN, makeFacilitatorPagesWorld, textOf } from "./lib/facilitatorPagesWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorPagesWorld("__facilitatorFellowsHome");
const { world, call, reset, routes, summary, components, words, ui } = w;
const me = await w.courseRoute("me");

beforeEach(() => {
  reset();
  world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "amara"] });
  // Rahul facilitates Group B and holds no place: the facilitator's row an
  // appointment writes, which this world's seed leaves out.
  world.db.seed(`courseEnrolments/${RUN.agi}__rahul`, {
    runId: RUN.agi,
    courseId: world.db.read(`courseRuns/${RUN.agi}`).courseId,
    uid: "rahul",
    groupId: null,
    status: "active",
    role: "facilitator",
    applicationId: null,
    joinedWeekNumber: 1,
  });
});

/** The hub's entry for the AGI run, as `who` reads it. */
async function hubEntry(who) {
  const answer = await call(who, me.GET, {}, { course: true });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body.runs.find((run) => run.runId === RUN.agi) ?? null;
}

/** The facilitator's Home as `who`, drawn with the hub's own entry for the run and the routes' answers. */
async function facilitatorHome(who, groupId = A) {
  const entry = await hubEntry(who);
  const overview = await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  ui.overview = overview.body;
  const answered = await summary(who, groupId);
  ui.summary = answered.status === 200 ? answered.body : null;
  const html = renderToStaticMarkup(createElement(components.HomeFacilitator, { given: "Amara", invite: null, entry, comingUp: null, more: null }));
  return { entry, html, text: textOf(html) };
}

describe("a facilitator who holds a place, on the hub, Home and their group's page", () => {
  test("the hub gives their run both roles, and everybody else theirs", async () => {
    assert.deepEqual((await hubEntry("amara"))?.roles, ["learner", "facilitator"]);
    assert.deepEqual((await hubEntry("bea"))?.roles, ["learner"]);
    assert.deepEqual((await hubEntry("rahul"))?.roles, ["facilitator"]);
  });

  test("a group naming somebody with no row on the run adds nothing to their hub: an appointment always writes one", async () => {
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "amara", "nobody"] });
    assert.equal(await hubEntry("nobody"), null);
  });

  test("taken off the group's facilitators, they are a learner on the hub again", async () => {
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia"] });
    assert.deepEqual((await hubEntry("amara"))?.roles, ["learner"]);
  });

  test("a group that is archived facilitates nobody: the hub gives no facilitator's role for it", async () => {
    world.db.poke(`courseGroups/${A}`, { archived: true });
    assert.deepEqual((await hubEntry("amara"))?.roles, ["learner"]);
  });

  test("before Publish tells them their own place, their run still reaches them as a facilitator's, with no seat", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { allocatedEmailAt: null });
    const entry = await hubEntry("amara");
    assert.deepEqual(entry?.roles, ["facilitator"]);
    assert.equal(JSON.stringify(entry).includes("Group A"), false, "the hub named the group of a place nobody has told them about");
  });

  test("Home is the facilitator's Home, with one line to their own week", async () => {
    const drawn = await facilitatorHome("amara");
    assert.match(drawn.text, /Take the register/);
    assert.ok(drawn.text.includes(words.TAKING_PART_TOO), drawn.text);
    assert.match(drawn.html, new RegExp(`<a href="/learn/${RUN.agi}" class="inlineLink">${words.OPEN_YOUR_PROGRAMME}</a>`));
  });

  test("a facilitator who holds no place is not told they are taking part", async () => {
    const entry = { runId: RUN.agi, courseTitle: "AGI Strategy Fellowship", groupName: null, roles: await hubEntry("rahul").then((e) => e.roles) };
    ui.overview = (await call("rahul", routes.overview.GET, { runId: RUN.agi }, { course: true })).body;
    ui.summary = (await summary("rahul")).body;
    const text = textOf(renderToStaticMarkup(createElement(components.HomeFacilitator, { given: "Rahul", invite: null, entry, comingUp: null, more: null })));
    assert.ok(!text.includes(words.TAKING_PART_TOO), text);
  });

  test("their own answer waits for the programme's lead or an admin: no facilitator's page counts it, an admin's does", async () => {
    // Amara sent week 2's answer, and nobody has reviewed it yet.
    for (const who of ["sofia", "amara"]) {
      const answered = await summary(who, A);
      assert.equal(answered.status, 200, `${who}: ${JSON.stringify(answered.body)}`);
      assert.equal(answered.body.toReview, 0, `${who}'s page counts Amara's own answer`);
    }
    assert.equal((await summary("zach", A)).body.toReview, 1);
  });
});
