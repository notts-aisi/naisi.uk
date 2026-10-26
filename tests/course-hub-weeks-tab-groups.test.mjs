/**
 * A week changed for one group, by Markdown round trip (Q39): copy the week
 * as Markdown, change it, paste it back, checked block by block.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The group's own route, `/api/courses/groups/[groupId]/weeks/[weekId]/blocks`,
 * driven as every kind of caller on week 3 of AGI Strategy's run
 * (`tests/lib/weeksTabWorld.mjs`, Tue 17 Nov 2026 at noon); the lead's card on
 * the Weeks tab's week page; the facilitator's group week editor; and the
 * member's own reading of the week (the overview route), which reads the
 * group's copy where one exists.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeWeeksTabWorld, textOf } from "./lib/weeksTabWorld.mjs";
import { syntheticGuideMarkdown } from "./lib/weekBlocksFixture.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWeeksTabWorld("__weeksTabGroups");
const { world, draw, tabsPage, call, courseRoute, loadTs } = w;
const route = await courseRoute("groups", "[groupId]", "weeks", "[weekId]", "blocks");
const overview = await courseRoute("runs", "[runId]", "overview");
const WeekPage = await tabsPage("weeks", "[weekId]", "page.tsx");
const { default: GroupWeekEditor } = await loadTs(join("features", "courses", "GroupWeekEditor.tsx"));
const { normalizeCourseWeek } = await loadTs(join("lib", "firestore", "courses.ts"));

const RUN_W3 = `courseRuns/${RUN.agi}/weeks/w03`;
const copyPath = (group, weekId = "w03") => `courseGroups/${group}/weeks/${weekId}`;
const as = (who, method, group, body, extra = {}) =>
  call(who, route[method], { groupId: group, weekId: extra.weekId ?? "w03" }, { ...(body !== undefined ? { body } : {}), course: true, viewAs: extra.viewAs ?? false });
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

/** Every id in a list of blocks, in order, however deep. */
function idsOf(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) idsOf(item, out);
  } else if (value && typeof value === "object") {
    if (typeof value.id === "string") out.push(value.id);
    for (const [key, inner] of Object.entries(value)) if (key !== "id") idsOf(inner, out);
  }
  return out;
}

/** The first source on the week's path, and the Markdown line that opens it. */
function firstSource(markdown) {
  const blocks = world.db.read(RUN_W3).blocks;
  const part = blocks.find((block) => block.type === "part");
  const source = part.blocks.find((block) => block.type === "source");
  const line = markdown.split("\n").find((text) => text.includes(`{#${source.id}}`));
  assert.ok(line, "the copied Markdown carries the source's id");
  return { id: source.id, line };
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. Who may change a group's week
// ---------------------------------------------------------------------------

describe("1. who may change one group's week", () => {
  const ADMITTED = [
    ["zach", B, "an admin, on any group"],
    ["claudia", A, "the programme's lead, on any group of the run"],
    ["claudia", D, "the programme's lead, on any group of the run"],
    ["rahul", B, "a facilitator, on their own group"],
    ["sofia", B, "the co-facilitator, on their own group"],
    ["sofia", A, "the co-facilitator, on the other group she facilitates"],
  ];
  for (const [who, group, what] of ADMITTED) {
    test(`${what}: Copy as Markdown and Read it`, async () => {
      assert.equal((await as(who, "GET", group)).status, 200, `${who} GET`);
      const read = await as(who, "POST", group, { markdown: syntheticGuideMarkdown() });
      assert.equal(read.status, 200, `${who} POST ${JSON.stringify(read.body)}`);
    });
  }

  test("everybody else is refused on every method before anything of the group's week is read, and nothing is written", async () => {
    const before = everything();
    const refused = [
      ["rahul", A, "a facilitator, on another group"],
      ["rahul", C, "a facilitator, on another group"],
      ["tom", B, "another group's facilitator"],
      ["tess", B, "the lead of another programme"],
      ["yusuf", B, "the run's track lead"],
      ["lloyd", B, "the programme's reviewer"],
      ["chloe", B, "a member placed in the group"],
      ["drew", B, "a course drafter"],
      ["nobody", B, "a member on nothing"],
    ];
    for (const [who, group, what] of refused) {
      for (const method of ["GET", "POST", "PUT"]) {
        const answer = await as(who, method, group, method === "GET" ? undefined : { markdown: syntheticGuideMarkdown() });
        assert.equal(answer.status, 403, `${what} ${method}`);
        assert.deepEqual(Object.keys(answer.body), ["error"], `${what} ${method}`);
      }
    }
    for (const method of ["GET", "POST", "PUT"]) {
      assert.equal((await as(null, method, B, method === "GET" ? undefined : { markdown: "# Week 3: A" })).status, 401, method);
    }
    assert.equal(everything(), before);
  });

  test("a view-as session is refused Read it and Save first", async () => {
    const before = everything();
    for (const method of ["POST", "PUT"]) {
      assert.equal((await as("zach", method, B, { markdown: syntheticGuideMarkdown() }, { viewAs: true })).status, 403, method);
    }
    assert.equal(everything(), before);
  });

  test("a group that no longer meets, or is not there: one 403 for its facilitator, said plainly to an admin", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await as("rahul", "POST", B, { markdown: syntheticGuideMarkdown() })).status, 403);
    assert.equal((await as("claudia", "POST", B, { markdown: syntheticGuideMarkdown() })).status, 403);
    const admin = await as("zach", "POST", B, { markdown: syntheticGuideMarkdown() });
    assert.deepEqual([admin.status, admin.body.error], [400, "This group no longer meets, so its weeks can’t be changed."]);
    assert.equal((await as("rahul", "GET", "no-such-group")).status, 403);
    assert.equal((await as("zach", "GET", "no-such-group")).status, 404);
  });

  test("a week that is not in the group's plan is refused", async () => {
    for (const weekId of ["w07", "w3", "x"]) {
      assert.equal((await as("rahul", "GET", B, undefined, { weekId })).status, 404, weekId);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The copy: made through the one copy function, ids kept
// ---------------------------------------------------------------------------

describe("2. the group's own copy", () => {
  test("Copy as Markdown, change it, paste it back: the group's copy is made, every id kept, the run's week untouched", async () => {
    const run = world.db.read(RUN_W3);
    const runIds = idsOf(run.blocks);
    const copied = await as("rahul", "GET", B);
    assert.equal(copied.status, 200);
    const changed = copied.body.markdown.replace("# Week 3: How sure are you?", "# Week 3: How sure is Group B?");
    assert.notEqual(changed, copied.body.markdown);
    const read = await as("rahul", "POST", B, { markdown: changed });
    assert.deepEqual([read.body.problems, read.body.removed, read.body.answers], [[], [], 0]);
    const saved = await as("rahul", "PUT", B, { markdown: changed });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.made, true);
    assert.equal(saved.body.minted, 0, "no id is minted on a round trip");

    const copy = world.db.read(copyPath(B));
    assert.equal(copy.title, "How sure is Group B?");
    assert.deepEqual(idsOf(copy.blocks), runIds, "every id stays with its block");
    // The rest of the copy is the run's week, through the one copy function.
    for (const field of ["weekNumber", "summary", "materials", "exercises", "checklist", "questions", "published"]) {
      assert.deepEqual(copy[field], run[field], field);
    }
    assert.equal(copy.forkedByUid, "rahul");
    assert.ok(copy.forkedAt, "the copy says when it was made");
    assert.equal(copy.ready, undefined, "a copy never carries Ready");
    assert.equal(copy.ownerUid, undefined, "nor the run's owner");
    assert.deepEqual(world.db.read(RUN_W3), run, "the run's week is as it was");
    for (const other of [A, C, D]) assert.equal(world.db.read(copyPath(other)), undefined, `no copy for ${other}`);

    // And the copy copies out again as itself.
    const again = await as("claudia", "GET", B);
    assert.equal(again.body.markdown, changed);
  });

  test("a second paste changes the copy's blocks and title alone", async () => {
    const copied = (await as("claudia", "GET", B)).body.markdown;
    assert.equal((await as("claudia", "PUT", B, { markdown: copied })).status, 200);
    const made = world.db.read(copyPath(B));
    world.db.poke(copyPath(B), { summary: "Kept" });
    const changed = copied.replace("# Week 3: How sure are you?", "# Week 3: Second go");
    const saved = await as("zach", "PUT", B, { markdown: changed });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.made, false);
    const after = world.db.read(copyPath(B));
    assert.equal(after.title, "Second go");
    assert.equal(after.summary, "Kept");
    assert.equal(after.forkedByUid, made.forkedByUid, "who made the copy is kept");
    assert.equal(after.updatedByUid, "zach");
  });

  test("a week not yet published for the run cannot have a group's copy, and nothing is written", async () => {
    world.db.poke(RUN_W3, { published: false });
    const before = everything();
    const copied = (await as("claudia", "GET", B)).body.markdown;
    const saved = await as("claudia", "PUT", B, { markdown: copied });
    assert.deepEqual(
      [saved.status, saved.body.error],
      [409, "Week 3 isn’t published for the run yet, so it can’t have a group’s own copy. It can once an admin publishes it."],
    );
    assert.equal(everything(), before);
  });

  test("a paste with a problem is refused, and another week's Markdown is one", async () => {
    const before = everything();
    const saved = await as("rahul", "PUT", B, { markdown: syntheticGuideMarkdown().replace("# Week 3:", "# Week 4:") });
    assert.equal(saved.status, 400);
    assert.equal(saved.body.error, "This is week 4’s Markdown, and you’re loading week 3. Check the week, or change the first line.");
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 3. Answers stay with their blocks, and the count is the group's
// ---------------------------------------------------------------------------

describe("3. answers stay with their blocks", () => {
  test("taking out a source somebody in the group ticked asks to confirm, counting the group's people alone", async () => {
    const copied = (await as("rahul", "GET", B)).body.markdown;
    const { id, line } = firstSource(copied);
    // Chloe is in Group B; Amara is in Group A, whose week this paste never touches.
    for (const uid of ["chloe", "amara"]) {
      world.db.seed(`courseProgress/${RUN.agi}__${uid}__${id}`, { runId: RUN.agi, uid, itemId: id, itemKind: "material", done: true });
    }
    const without = copied.replace(`${line}\n`, "");
    const read = await as("rahul", "POST", B, { markdown: without });
    assert.equal(read.status, 200);
    assert.equal(read.body.answers, 1, "only Chloe's tick: Amara reads the run's week");
    assert.deepEqual(read.body.removed.filter((item) => item.answers > 0).map((item) => [item.id, item.answers]), [[id, 1]]);
    const refused = await as("rahul", "PUT", B, { markdown: without });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "This paste takes out an item with 1 answer. Confirm to save it anyway.");
    assert.equal(world.db.read(copyPath(B)), undefined, "nothing saved until confirmed");
    const saved = await as("rahul", "PUT", B, { markdown: without, confirmAnswers: 1 });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    // The answers are never deleted: they stay stored, with their block's id.
    for (const uid of ["chloe", "amara"]) assert.ok(world.db.read(`courseProgress/${RUN.agi}__${uid}__${id}`), uid);
    assert.ok(!idsOf(world.db.read(copyPath(B)).blocks).includes(id), "the group's copy no longer holds it");
    assert.ok(idsOf(world.db.read(RUN_W3).blocks).includes(id), "the run's week still does");
  });

  test("the run's week loader still counts every row of the run, as it always has", async () => {
    // Unchanged by this piece: a paste to the run's own week counts the run's rows.
    const runRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "blocks");
    const copied = (await call("claudia", runRoute.GET, { runId: RUN.agi, weekId: "w03" }, { course: true })).body.markdown;
    const { id, line } = firstSource(copied);
    for (const uid of ["chloe", "amara"]) {
      world.db.seed(`courseProgress/${RUN.agi}__${uid}__${id}`, { runId: RUN.agi, uid, itemId: id, itemKind: "material", done: true });
    }
    const read = await call("claudia", runRoute.POST, { runId: RUN.agi, weekId: "w03" }, { body: { markdown: copied.replace(`${line}\n`, "") }, course: true });
    assert.equal(read.body.answers, 2);
  });
});

// ---------------------------------------------------------------------------
// 4. Who reads the group's copy
// ---------------------------------------------------------------------------

describe("4. the member's page reads the group's copy, and only that group's people read it", () => {
  test("Chloe, in Group B, is answered the group's week; Amara, in Group A, the run's", async () => {
    const copied = (await as("claudia", "GET", B)).body.markdown;
    assert.equal((await as("claudia", "PUT", B, { markdown: copied.replace("# Week 3: How sure are you?", "# Week 3: Group B's week") })).status, 200);
    const weekOf = async (who) => {
      const answer = await call(who, overview.GET, { runId: RUN.agi }, { course: true });
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body).slice(0, 200)}`);
      return answer.body.weeks.find((row) => row.weekNumber === 3);
    };
    const chloe = await weekOf("chloe");
    assert.deepEqual([chloe.title, chloe.forked], ["Group B's week", true]);
    const amara = await weekOf("amara");
    assert.deepEqual([amara.title, amara.forked], ["How sure are you?", false]);
  });
});

// ---------------------------------------------------------------------------
// 5. The two ways in
// ---------------------------------------------------------------------------

describe("5. the lead's card on the week's page, and the facilitator's group week editor", () => {
  test("the lead picks a group: where its week stands, its paste box, its save and its preview", async () => {
    const page = await draw("claudia", WeekPage, { roundId: ROUND, programmeId: AGI, weekId: "w03" });
    assert.match(page.text, /Week 3 for one group/);
    const pick = /<select[^>]*id="one-group-w03"[^>]*>(.*?)<\/select>/.exec(page.html);
    assert.ok(pick, "no group menu");
    assert.match(pick[0], /disabled=""/, "the menu waits for the page's script");
    assert.deepEqual([...pick[1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]), [
      "Group D · Mondays at 6pm",
      "Group B · Tuesdays at 6pm",
      "Group C · Wednesdays at 1pm",
      "Group A · Thursdays at 6pm",
    ]);
    assert.match(page.text, /Group D reads the programme’s week 3\. Saving here makes Group D its own copy, and from then on changes to the programme’s week no longer reach it\./);
    assert.match(page.html, /<label[^>]*for="week-markdown-w03-[^"]+"[^>]*>Paste the week’s Markdown<\/label>/);
    assert.match(page.text, /Paste Group D’s week, then check it/);
    assert.match(page.html, new RegExp(`href="[^"]*/weeks/w03/preview\\?group=${D}"`));
  });

  test("a group with its own copy says so, with the day it was made", async () => {
    const copied = (await as("rahul", "GET", B)).body.markdown;
    assert.equal((await as("rahul", "PUT", B, { markdown: copied })).status, 200);
    // Group B first in the menu.
    world.db.poke(`courseGroups/${D}`, { archived: true });
    const page = await draw("claudia", WeekPage, { roundId: ROUND, programmeId: AGI, weekId: "w03" });
    assert.match(page.text, /Group B has its own copy of week 3, made Tue 17 Nov\. Changes to the programme’s week no longer reach it\./);
  });

  test("the facilitator's editor offers a week written as blocks the paste card for their own group, and no fork or old lists", () => {
    const canonical = normalizeCourseWeek("w03", world.db.read(RUN_W3));
    world.groupWeek = { canonical, fork: null, forked: false, loading: false, error: null, reload() {} };
    const html = renderToStaticMarkup(
      createElement(GroupWeekEditor, {
        runId: RUN.agi,
        courseId: "c",
        groupId: B,
        groupName: "Group B",
        weekId: "w03",
        weekNumber: 3,
        from: "2026-11-12",
        to: "2026-11-18",
        mode: null,
        location: "Hallward B12",
        meetingUrl: null,
        viewerIsAdmin: false,
      }),
    );
    const text = textOf(html);
    assert.match(text, /Paste Group B’s week, then check it/);
    assert.match(text, /Only Group B’s week changes: the programme’s own week and every other group’s stay as they are\./);
    assert.match(text, /Saving makes Group B its own copy of Week 3/);
    assert.match(text, /Copy as Markdown/);
    assert.ok(!text.includes("Customise Week 3 for Group B"), "no fork door for a block week");
    assert.match(text, /How this week meets/, "the week's own way of meeting stays");
    assert.deepEqual(world.clientWrites, []);
  });

  test("a week written before blocks keeps the editor of its lists", () => {
    const canonical = normalizeCourseWeek("w02", world.db.read(`courseRuns/${RUN.agi}/weeks/w02`));
    world.groupWeek = { canonical, fork: null, forked: false, loading: false, error: null, reload() {} };
    const html = renderToStaticMarkup(
      createElement(GroupWeekEditor, {
        runId: RUN.agi,
        courseId: "c",
        groupId: B,
        groupName: "Group B",
        weekId: "w02",
        weekNumber: 2,
        from: "2026-11-05",
        to: "2026-11-11",
        mode: null,
        location: "Hallward B12",
        meetingUrl: null,
        viewerIsAdmin: false,
      }),
    );
    const text = textOf(html);
    assert.ok(!text.includes("Paste Group B’s week"));
    assert.match(text, /Customise Week 2 for Group B/);
  });
});

