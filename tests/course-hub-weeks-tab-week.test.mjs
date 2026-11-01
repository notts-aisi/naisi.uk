/**
 * One week's page on a programme's Weeks tab (board pr-weeks, option B as
 * Q39 chose), the routes its controls send, and "Preview as a fellow".
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Drawn and driven for real (`tests/lib/weeksTabWorld.mjs`) as every kind of
 * caller, on week 3 of AGI Strategy's run, Tue 17 Nov 2026 at noon: the page
 * at `.../(tabs)/weeks/[weekId]`, its preview at `.../preview`, the owner
 * route, the route that sets how a whole week meets, the week loader (as the
 * lead) and the facilitator guide's loader (as the lead).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_W3 } from "./lib/facilitatorGuideFixture.mjs";
import { A, AGI, B, C, COURSE, D, NOW, PERSONAS, PROGRAMME_PATH, ROUND, RUN, makeWeeksTabWorld } from "./lib/weeksTabWorld.mjs";
import { syntheticGuideMarkdown } from "./lib/weekBlocksFixture.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWeeksTabWorld("__weeksTabWeek");
const { world, draw, tabsPage, call, courseRoute } = w;
const WeekPage = await tabsPage("weeks", "[weekId]", "page.tsx");
const PreviewPage = await tabsPage("weeks", "[weekId]", "preview", "page.tsx");
const ownerRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "owner");
const modeRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "mode");
const blocksRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks");
const readyRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "ready");
const guideRoute = await courseRoute("[courseId]", "facilitator-guide", "[slot]");

const at = (weekId) => ({ roundId: ROUND, programmeId: AGI, weekId });
const weekPath = (id) => `courseRuns/${RUN.agi}/weeks/${id}`;
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));
const owner = (who, weekId, ownerUid, extra = {}) =>
  call(who, ownerRoute.PUT, { runId: RUN.agi, weekId }, { body: { ownerUid }, course: true, ...extra });
const mode = (who, weekId, online, extra = {}) =>
  call(who, modeRoute.PUT, { runId: RUN.agi, weekId }, { body: { online }, course: true, ...extra });
const link = (url) => world.db.read(`courseGroups/${url}`);

/** Every group a meeting link, so a week can be held online. */
function linksForAll() {
  for (const group of [A, B, C, D]) {
    const session = world.db.read(`courseGroups/${group}`).session;
    world.db.poke(`courseGroups/${group}`, { session: { ...session, meetingUrl: `https://meet.example.com/${group}` } });
  }
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. The page, and who is shown it
// ---------------------------------------------------------------------------

describe("1. one week's page", () => {
  test("the lead and an admin: the weeks with this one current, then the week's page as the board draws it", async () => {
    const before = everything();
    for (const who of ["claudia", "zach"]) {
      const page = await draw(who, WeekPage, at("w03"));
      assert.equal(page.to, null, who);
      assert.equal([...page.html.matchAll(/aria-current="true"/g)].length, 1, `${who}: one current week`);
      assert.match(page.html, new RegExp(`href="${PROGRAMME_PATH}/weeks/w03"[^>]*aria-current="true"`), who);
      for (const said of [
        "Week 3 · How sure are you?",
        "Thu 12 to Wed 18 Nov",
        "Paste the week, then check it",
        "Paste the week’s Markdown",
        "Read it",
        "Copy as Markdown",
        "This week’s settings",
        "Owner",
        "The lead or a helper.",
        "This week is In person Online",
        "Online weeks show a join link on the programme page, never in emails.",
        "Facilitator guide",
        "Only facilitators, the programme’s lead and admins see this. Open week 3 of the facilitator guide",
        "Preview as a fellow",
        "Mark ready",
        "Due dates come from each group’s day: the written answer by the end of the day before its session.",
      ]) {
        assert.ok(page.text.includes(said), `${who}: missing ${JSON.stringify(said)}\n${page.text}`);
      }
      assert.match(page.html, new RegExp(`href="${PROGRAMME_PATH}/weeks/w03/preview"`), who);
      assert.match(page.html, new RegExp(`href="/learn/facilitator-guide/${COURSE.agi}/week-3"`), who);
    }
    assert.equal(everything(), before, "drawing the page writes nothing");
  });

  test("the owner is chosen from the lead and the run's helpers, and every control waits for the page's script", async () => {
    const page = await draw("claudia", WeekPage, at("w03"));
    const select = /<select[^>]*id="week-owner-w03"[^>]*>(.*?)<\/select>/.exec(page.html);
    assert.ok(select, "no owner menu");
    assert.match(select[0], /disabled=""/);
    // Each by the names rule for the reader, who is the lead or an admin: the full name.
    assert.deepEqual([...select[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]), [
      ["claudia", "Claudia Reyes"],
      ["yusuf", "Yusuf Demir"],
    ]);
    assert.match(page.html, /<label[^>]*for="week-owner-w03"[^>]*>Owner<\/label>/);
    const segments = [...page.html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[2], m[1], /disabled=""/.test(m[0])]);
    assert.deepEqual(segments, [["In person", "true", true], ["Online", "false", true]]);
  });

  test("a reviewer is told the tab is the lead's; another programme's lead is shown no programme; everybody else is sent away", async () => {
    assert.match((await draw("lloyd", WeekPage, at("w03"))).text, /Only the programme’s lead and admins can open Weeks/);
    assert.match((await draw("tess", WeekPage, at("w03"))).text, /There is no programme here/);
    for (const [who, what] of PERSONAS) {
      if (["zach", "claudia", "tess", "lloyd"].includes(who)) continue;
      assert.equal((await draw(who, WeekPage, at("w03"))).to, "/dashboard", what);
    }
  });

  test("an address that is no taught week of the plan goes back to the tab", async () => {
    for (const weekId of ["w07", "w00", "w3", "week-3", "x"]) {
      assert.equal((await draw("claudia", WeekPage, at(weekId))).to, `${PROGRAMME_PATH}/weeks`, weekId);
    }
  });

  test("a week with no page offers the paste, says its first save makes the page, and offers nothing to preview, mark or own", async () => {
    await world.db.collection(`courseRuns/${RUN.agi}/weeks`).doc("w06").delete();
    const page = await draw("claudia", WeekPage, at("w06"));
    assert.match(page.text, /Week 6 has no page on this run yet: saving its Markdown here makes it\./);
    assert.ok(page.text.includes("Paste the week’s Markdown"), "the paste box is offered");
    for (const absent of ["Preview as a fellow", "Mark ready", "Owner", "isn’t published yet"]) {
      assert.ok(!page.text.includes(absent), absent);
    }
    // The lead's first save makes the page, unpublished; then Mark ready is offered, and publishes it.
    const saved = await call("claudia", blocksRoute.PUT, { runId: RUN.agi, weekId: "w06" }, {
      body: { markdown: syntheticGuideMarkdown().replace("# Week 3:", "# Week 6:") },
      course: true,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(world.db.read(weekPath("w06")).published, false);
    const made = await draw("claudia", WeekPage, at("w06"));
    assert.ok(!made.text.includes("has no page on this run yet"));
    assert.match(made.text, /Week 6 isn’t published yet: marking it ready publishes it\./);
    assert.ok(made.text.includes("Mark ready") && made.text.includes("Preview as a fellow"));
  });

  test("an unpublished week offers Mark ready, which publishes it, with the way to the week editor for an admin alone", async () => {
    world.db.poke(weekPath("w03"), { published: false });
    const lead = await draw("claudia", WeekPage, at("w03"));
    assert.match(lead.text, /Week 3 isn’t published yet: marking it ready publishes it\./);
    assert.ok(lead.text.includes("Mark ready"));
    assert.ok(!lead.text.includes("Open the run’s week editor"));
    const admin = await draw("zach", WeekPage, at("w03"));
    assert.match(admin.html, new RegExp(`href="/admin/courses/${COURSE.agi}/runs/${RUN.agi}/weeks/w03"[^>]*>Open the run’s week editor</a>`));
    const marked = await call("claudia", readyRoute.PUT, { runId: RUN.agi, weekId: "w03" }, { body: { ready: true }, course: true });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(world.db.read(weekPath("w03")).published, true);
    const after = await draw("claudia", WeekPage, at("w03"));
    assert.ok(!after.text.includes("isn’t published yet"));
    assert.match(after.text, /Week 3 is marked ready\./);
  });

  test("a week with nothing in it offers the paste and nothing to mark, published or not", async () => {
    for (const published of [true, false]) {
      world.db.poke(weekPath("w03"), { blocks: [], published });
      const page = await draw("claudia", WeekPage, at("w03"));
      assert.ok(page.text.includes("Paste the week’s Markdown"), "the paste box is offered");
      for (const absent of ["Mark ready", "isn’t published yet", "has no page on this run yet"]) {
        assert.ok(!page.text.includes(absent), `${absent} (${published})`);
      }
    }
  });

  test("once marked ready the press reads Not ready, with what Ready means for the week", async () => {
    for (const weekId of ["w01", "w03"]) {
      const marked = await call("claudia", readyRoute.PUT, { runId: RUN.agi, weekId }, { body: { ready: true }, course: true });
      assert.equal(marked.status, 200, JSON.stringify(marked.body));
    }
    const three = await draw("claudia", WeekPage, at("w03"));
    assert.match(three.text, /Not ready/);
    assert.match(three.text, /Week 3 is marked ready\./);
    const one = await draw("claudia", WeekPage, at("w01"));
    assert.match(one.text, /Ready: everyone holding a place can open week 1\./);
  });

  test("a week written before blocks has no preview, and no Copy as Markdown", async () => {
    const page = await draw("claudia", WeekPage, at("w02"));
    assert.ok(!page.text.includes("Preview as a fellow"));
    assert.ok(!page.text.includes("Copy as Markdown"));
    assert.match(page.text, /Read it/);
  });
});

// ---------------------------------------------------------------------------
// 2. Paste, check, save a draft: the week loader, as the lead
// ---------------------------------------------------------------------------

describe("2. the lead pastes a week", () => {
  test("read, then saved as a draft: the run's week holds the blocks, and its Ready and Published are left alone", async () => {
    const markdown = syntheticGuideMarkdown();
    const params = { runId: RUN.agi, weekId: "w03" };
    const read = await call("claudia", blocksRoute.POST, params, { body: { markdown }, course: true });
    assert.equal(read.status, 200, JSON.stringify(read.body));
    const saved = await call("claudia", blocksRoute.PUT, params, { body: { markdown, confirmAnswers: read.body.answers }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const stored = world.db.read(weekPath("w03"));
    assert.equal(stored.published, true);
    assert.equal(stored.ready, undefined, "a save never marks a week ready");
    assert.equal(stored.updatedByUid, "claudia");
  });

  test("the lead of another programme, the run's track lead and a facilitator are refused, and nothing is written", async () => {
    const before = everything();
    for (const who of ["tess", "yusuf", "rahul", "sofia", "chloe", "drew"]) {
      const answer = await call(who, blocksRoute.PUT, { runId: RUN.agi, weekId: "w03" }, { body: { markdown: syntheticGuideMarkdown() }, course: true });
      assert.equal(answer.status, 403, who);
    }
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 3. Owner
// ---------------------------------------------------------------------------

describe("3. the owner route", () => {
  test("the lead chooses a helper, then the lead again, which is stored as nobody: the week follows the lead", async () => {
    assert.deepEqual((await owner("claudia", "w04", "yusuf")).body, { ok: true, week: { weekId: "w04", weekNumber: 4, ownerUid: "yusuf" } });
    assert.equal(world.db.read(weekPath("w04")).ownerUid, "yusuf");
    const page = await draw("claudia", WeekPage, at("w04"));
    assert.match(page.html, /<option value="yusuf" selected="">Yusuf Demir<\/option>/);
    assert.deepEqual((await owner("zach", "w04", "claudia")).body.week.ownerUid, null);
    assert.equal(world.db.read(weekPath("w04")).ownerUid, null);
    assert.equal((await owner("claudia", "w04", null)).status, 200);
  });

  test("anybody who is not the lead or a helper cannot be the owner", async () => {
    const before = everything();
    for (const uid of ["rahul", "chloe", "tess", "no-such-account"]) {
      const answer = await owner("claudia", "w04", uid);
      assert.deepEqual([answer.status, answer.body.error], [400, "Choose the programme’s lead or one of its helpers."], uid);
    }
    assert.equal(everything(), before);
  });

  test("only the programme's lead and admins: one 403 for everybody else, a 401 signed out, view-as refused first", async () => {
    const before = everything();
    for (const [who, what] of PERSONAS) {
      if (["zach", "claudia"].includes(who)) continue;
      const answer = await owner(who, "w04", "yusuf");
      assert.equal(answer.status, who === null ? 401 : 403, what);
    }
    assert.equal((await owner("zach", "w04", "yusuf", { viewAs: true })).status, 403);
    // The lead on a run her programme does not name.
    assert.equal((await call("claudia", ownerRoute.PUT, { runId: RUN.tais, weekId: "w01" }, { body: { ownerUid: null }, course: true })).status, 403);
    assert.equal(everything(), before);
  });

  test("a body or an address it cannot use", async () => {
    assert.equal((await owner("claudia", "w04", 7)).status, 400);
    assert.equal((await owner("claudia", "w04", "a/b")).status, 400);
    assert.equal((await owner("claudia", "w61", null)).status, 404);
    assert.equal((await owner("claudia", "w4", null)).status, 404);
    await world.db.collection(`courseRuns/${RUN.agi}/weeks`).doc("w06").delete();
    assert.deepEqual([(await owner("claudia", "w06", null)).status, (await owner("claudia", "w06", null)).body.error], [404, "Week 6 has no page on this run yet."]);
  });
});

// ---------------------------------------------------------------------------
// 4. In person or Online, for the whole week
// ---------------------------------------------------------------------------

describe("4. how a whole week meets", () => {
  test("online needs every group's link: without them nothing changes and every such group is named", async () => {
    const before = everything();
    const answer = await mode("claudia", "w04", true);
    assert.equal(answer.status, 400);
    assert.equal(
      answer.body.error,
      "Group D, Group B, Group C and Group A have no meeting link yet, so week 4 can’t be online for them. Its facilitators or an admin add the link in the group’s settings, then try again.",
    );
    assert.equal(everything(), before);
  });

  test("online for every group, then in person again: the groups' own week mode, and no email", async () => {
    linksForAll();
    const online = await mode("claudia", "w04", true);
    assert.equal(online.status, 200, JSON.stringify(online.body));
    assert.equal(online.body.message, "Week 4 is online now for 4 groups.");
    assert.deepEqual(online.body.left, []);
    for (const group of [A, B, C, D]) assert.equal(link(group).sessionModes.w04, "virtual", group);
    assert.equal(world.mail.length, 0, "nothing is emailed");
    // The list and the page say so.
    assert.match((await draw("claudia", WeekPage, at("w04"))).text, /AGI Strategy meets online in week 4, and in person the other weeks\./);
    const page = await draw("claudia", WeekPage, at("w04"));
    assert.match(page.html, /aria-pressed="true"[^>]*>Online<\/button>/);
    // Pressed again, nothing changes.
    assert.equal((await mode("zach", "w04", true)).body.message, "Week 4 was online already.");
    const back = await mode("claudia", "w04", false);
    assert.equal(back.body.message, "Week 4 is in person now for 4 groups.");
    for (const group of [A, B, C, D]) assert.equal(link(group).sessionModes?.w04, undefined, group);
  });

  test("a group that has met this week, or whose session was changed on its own, is left as it is and named", async () => {
    linksForAll();
    // Week 3: Group A met on Thursday and Group D on Monday; B meets tonight and C tomorrow.
    world.db.poke(`courseGroups/${C}`, {
      sessionChanges: { w03: { kind: "cancelled", reason: "Room closed", dateKey: "2026-11-18", byUid: "tom", at: NOW } },
    });
    const answer = await mode("claudia", "w03", true);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.message, "Week 3 is online now for 1 group.");
    // Monday first, the one order every tab of a programme lists groups in.
    assert.deepEqual(answer.body.left, [
      "Group D has met for this week already, so it was left as it was.",
      "Group C’s session this week was changed on its own (moved or cancelled), so it was left as it was.",
      "Group A has met for this week already, so it was left as it was.",
    ]);
    assert.equal(link(B).sessionModes.w03, "virtual");
    for (const group of [A, C, D]) assert.equal(link(group).sessionModes?.w03, undefined, group);
    // Some groups online that week: neither button is pressed, and the line names them.
    const page = await draw("claudia", WeekPage, at("w03"));
    assert.match(page.text, /Group B meets online this week; the other groups meet in person\./);
    assert.ok(![...page.html.matchAll(/aria-pressed="true"/g)].length, "neither In person nor Online is pressed");
  });

  test("in person takes away the record a held-online session left, and leaves a moved one alone", async () => {
    linksForAll();
    world.db.poke(`courseGroups/${B}`, {
      sessionModes: { w05: "virtual" },
      sessionChanges: { w05: { kind: "online", reason: "Strike", dateKey: "2026-12-01", byUid: "rahul", at: NOW } },
    });
    world.db.poke(`courseGroups/${A}`, {
      sessionChanges: { w05: { kind: "moved", reason: "Room swap", dateKey: "2026-11-26", byUid: "sofia", at: NOW } },
    });
    const answer = await mode("claudia", "w05", false);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.message, "Week 5 is in person now for 1 group.", "only Group B's arrangement is taken away");
    assert.ok(
      answer.body.left.includes("Group A’s session this week was changed on its own (moved or cancelled), so it was left as it was."),
      answer.body.left.join("\n"),
    );
    assert.equal(link(B).sessionModes?.w05, undefined);
    assert.equal(link(B).sessionChanges?.w05, undefined);
    assert.equal(link(A).sessionChanges.w05.kind, "moved");
  });

  test("only the programme's lead and admins, view-as refused first; a week outside the plan and a bad body", async () => {
    linksForAll();
    const before = everything();
    for (const [who, what] of PERSONAS) {
      if (["zach", "claudia"].includes(who)) continue;
      assert.equal((await mode(who, "w04", true)).status, who === null ? 401 : 403, what);
    }
    assert.equal((await mode("zach", "w04", true, { viewAs: true })).status, 403);
    assert.equal((await mode("claudia", "w09", true)).status, 404);
    assert.equal((await mode("claudia", "w4", true)).status, 404);
    assert.equal((await call("claudia", modeRoute.PUT, { runId: RUN.agi, weekId: "w04" }, { body: { online: "yes" }, course: true })).status, 400);
    assert.equal((await call("claudia", modeRoute.PUT, { runId: RUN.tais, weekId: "w01" }, { body: { online: true }, course: true })).status, 403);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 5. The facilitator guide box, through the guide's own route
// ---------------------------------------------------------------------------

describe("5. the facilitator guide box", () => {
  test("the lead loads the week's session plan through the guide's route, and the box says it is loaded", async () => {
    const before = await draw("claudia", WeekPage, at("w03"));
    assert.match(before.text, /Week 3 session plan/);
    assert.match(before.text, /Nothing is loaded here yet\./);
    const saved = await call("claudia", guideRoute.PUT, { courseId: COURSE.agi, slot: "w03-plan" }, { body: { markdown: PLAN_W3 }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const doc = world.db.read(`courseFacilitatorGuide/${COURSE.agi}__w03-plan`);
    assert.ok(doc && !JSON.stringify(doc).includes("claudia"), "nothing personal is stored");
    const after = await draw("claudia", WeekPage, at("w03"));
    assert.match(after.text, /Loaded now: “Session 3/);
  });

  test("the box is the lead's and an admin's: a facilitator of a group cannot load the guide through the route", async () => {
    const before = everything();
    for (const who of ["rahul", "tess", "yusuf"]) {
      const answer = await call(who, guideRoute.PUT, { courseId: COURSE.agi, slot: "w03-plan" }, { body: { markdown: PLAN_W3 }, course: true });
      assert.equal(answer.status, 403, who);
    }
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 6. Preview as a fellow
// ---------------------------------------------------------------------------

describe("6. preview as a fellow", () => {
  test("the member's own week page, with nothing ticked, written or pressable, and nothing written by drawing it", async () => {
    const before = everything();
    for (const who of ["claudia", "zach"]) {
      const page = await draw(who, PreviewPage, at("w03"));
      assert.equal(page.to, null, who);
      assert.match(page.text, /Week 3 as a fellow reads it\. This is a preview: nothing here can be ticked or sent, and nobody’s answers are shown\./, who);
      assert.match(page.text, /How sure are you\?/, who);
      assert.match(page.text, /This week/, who);
      // Every box is read only, and every tick is disabled.
      const boxes = [...page.html.matchAll(/<textarea[^>]*>/g)].map((m) => m[0]);
      assert.ok(boxes.length > 0, `${who}: the reflection boxes are drawn`);
      assert.ok(boxes.every((box) => /readOnly=""|readonly=""/.test(box)), `${who}: a box can be written in`);
      const ticks = [...page.html.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>/g)].map((m) => m[0]);
      assert.ok(ticks.every((tick) => /disabled=""/.test(tick)), `${who}: a tick can be pressed`);
      assert.match(page.html, new RegExp(`href="${PROGRAMME_PATH}/weeks/w03"`), "the way back to the week");
    }
    assert.equal(everything(), before);
  });

  test("a group's own copy is previewed when asked for one of the run's groups", async () => {
    const copy = { ...world.db.read(weekPath("w03")), title: "How sure is Group B?", forkedAt: NOW, forkedByUid: "rahul" };
    world.db.seed(`courseGroups/${B}/weeks/w03`, copy);
    const page = await draw("claudia", PreviewPage, at("w03"), { searchParams: { group: B } });
    assert.match(page.text, /Week 3 as a fellow in Group B reads it\./);
    assert.match(page.text, /How sure is Group B\?/);
    // An id that is not one of the run's groups previews the run's week.
    const other = await draw("claudia", PreviewPage, at("w03"), { searchParams: { group: "no-such-group" } });
    assert.match(other.text, /Week 3 as a fellow reads it\./);
    assert.match(other.text, /How sure are you\?/);
  });

  test("a week written before blocks has nothing to preview; an address outside the plan goes back to the tab", async () => {
    assert.match((await draw("claudia", PreviewPage, at("w02"))).text, /Week 2 isn’t written as blocks yet, so there is nothing to preview\./);
    assert.equal((await draw("claudia", PreviewPage, at("w09"))).to, `${PROGRAMME_PATH}/weeks`);
  });

  test("a reviewer is told it is the lead's; everybody else is sent away", async () => {
    assert.match((await draw("lloyd", PreviewPage, at("w03"))).text, /Only the programme’s lead and admins can open Weeks/);
    for (const [who, what] of PERSONAS) {
      if (["zach", "claudia", "tess", "lloyd"].includes(who)) continue;
      assert.equal((await draw(who, PreviewPage, at("w03"))).to, "/dashboard", what);
    }
  });
});

