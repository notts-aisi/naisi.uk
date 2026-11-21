/**
 * WHAT POINTS TO THE PATHWAYS AND CASES PAGE AT THE SESSION THAT HANDS THE
 * SLIPS OUT, besides the group page's card (`tests/course-draw-card.test.mjs`):
 *
 *  1. THE REGISTER: one row beside the check-in, on the week the slips are
 *     for, only on the evening of the hand-out session while somebody has not
 *     got theirs, only on the register of that session (or one whose address
 *     names none), and only for whom that page's own gate admits: the group's
 *     facilitators and admins, never a run's track lead.
 *  2. HOME, through the group summary route: one fact, worked out for a
 *     facilitator of the group alone and absent at any other time, and the
 *     card it draws. A member is refused as before.
 *  3. THE GUIDE'S WEEK PAGE: the card after the week's plan, for the reader's
 *     own group, on the evening its session hands next week's slips out.
 *  4. A COURSE THAT GIVES NOTHING OUT AND HAS NO PAIRS: none of it, on the
 *     group page, the register, the summary, Home or the guide, on the very
 *     evening a hand-out would be.
 *
 * Runs in `tests/lib/facilitatorGuideWorld.mjs` (the facilitator pages' AGI
 * Strategy run, Group B on Tuesdays at 6pm with Rahul and Sofia facilitating,
 * Claudia leading the programme, Yusuf the run's track lead, Zach an admin,
 * and the course's guide with week 3's plan and notes), with weeks 2 to 4
 * written as blocks for parts 1 to 3: weeks 2, 3 and 4 give out packs and
 * cases. At 6:30pm on Tue 17 Nov 2026 week 3's session is on, and week 4's
 * slips are being handed out.
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { after, before, describe, mock, test } from "node:test";
import { B, NOW, RUN, find, guideSeed, makeFacilitatorGuideWorld } from "./lib/facilitatorGuideWorld.mjs";
import { blockWeekDoc, idsOf, weekBlocksFor } from "./lib/packsAndCasesWorld.mjs";

const w = await makeFacilitatorGuideWorld("__drawCardPointers");

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());

const TONIGHT = "2026-11-17T18:30:00Z";
const NOON = "2026-11-17T12:00:00Z";

/** Weeks 2 to 4 written as blocks, each week's ids its own. */
function blockSeed() {
  const over = {};
  for (const n of [2, 3, 4]) over[`courseRuns/${RUN.agi}/weeks/w0${n}`] = blockWeekDoc(n, `Week ${n} readings`, weekBlocksFor(`w${n}`));
  return guideSeed(over);
}

/** Everybody in Group B given a pack and a case for a week, as the pathways and cases page saves them. */
function everybodyHas(n) {
  const ids = idsOf(`w${n}`);
  for (const uid of ["chloe", "farah", "kofi", "rahul", "sofia"]) {
    const base = { runId: RUN.agi, uid, weekId: `w0${n}`, weekNumber: n, givenAt: new Date(NOW) };
    w.world.db.seed(`coursePacksAndCases/${RUN.agi}__${uid}__${ids.given}`, { ...base, blockId: ids.given, kind: "pack", packId: ids.elections });
    w.world.db.seed(`coursePacksAndCases/${RUN.agi}__${uid}__${ids.caseStudy}`, { ...base, blockId: ids.caseStudy, kind: "talk", caseId: ids.surprise, ready: false });
  }
}

/** The register page as `who`, with the session its address names. */
async function register(who, session = undefined) {
  const page = await w.draw(w.pages.register, who, { runId: RUN.agi, groupId: B }, session ? { session } : {});
  const grid = page.element ? find(page.element, "AttendanceGrid")[0] : null;
  return { ...page, grid, row: grid?.props.handOut ?? null };
}

async function at(clock, seed = blockSeed()) {
  w.reset(seed);
  w.at(clock);
  await w.seedGuide();
}

// ---------------------------------------------------------------------------
// 1. The register
// ---------------------------------------------------------------------------

describe("1. the register's row, at the session that hands the slips out", () => {
  test("tonight: a row to the page on week 4, for the group's facilitators and an admin, never a run's track lead", async () => {
    await at(TONIGHT);
    for (const who of ["rahul", "sofia", "zach"]) {
      const { row } = await register(who);
      assert.ok(row, who);
      assert.deepEqual([row.props.groupId, row.props.weekNumber], [B, 4], who);
    }
    // The run's track lead takes the register, and the pathways and cases page does not admit them.
    const yusuf = await register("yusuf");
    assert.ok(yusuf.grid);
    assert.ok(!Object.hasOwn(yusuf.grid.props, "handOut"), "the run's track lead is offered the page");
    // The programme's lead is sent from this register to the programme's, as before.
    assert.equal((await register("claudia")).to, `/learn/${RUN.agi}`);
    // Drawn: the words and the link.
    const html = renderToStaticMarkup((await register("rahul")).row);
    assert.match(html, />Week 4’s packs and cases</);
    assert.match(html, />Hand out the slips, then copy them in\.</);
    assert.match(html, new RegExp(`href="/learn/draw/${B}\\?week=4"[^>]*>Copy in the slips<`));
  });

  test("only on that session's register, only on its evening, and only while somebody has not got theirs", async () => {
    await at(TONIGHT);
    assert.ok((await register("rahul", "w03")).row, "the hand-out session's own register");
    assert.equal((await register("rahul", "w02")).row, null, "another session's register");
    // Before tonight's session, week 3's slips went out a week ago: nothing points there today.
    await at(NOON);
    assert.equal((await register("rahul")).row, null);
    // Everybody has week 4's.
    await at(TONIGHT);
    everybodyHas(4);
    const done = await register("rahul");
    assert.equal(done.row, null);
    assert.ok(!Object.hasOwn(done.grid.props, "handOut"), "the register is handed nothing new");
  });
});

// ---------------------------------------------------------------------------
// 2. Home
// ---------------------------------------------------------------------------

describe("2. Home, through the group summary: one fact, for the group's facilitators alone", () => {
  test("tonight a facilitator is told which week, and Home draws the way there", async () => {
    await at(TONIGHT);
    for (const who of ["rahul", "sofia"]) {
      const answer = await w.summary(who);
      assert.equal(answer.status, 200, who);
      assert.deepEqual(answer.body.slips, { weekNumber: 4, handOutDateKey: "2026-11-17", title: "Packs and cases" }, who);
    }
    const home = await w.home("rahul");
    assert.match(home.text, /After Tuesday’s session Copy in the packs and cases you hand out for week 4\. Packs and cases/);
    assert.match(home.html, new RegExp(`href="/learn/draw/${B}\\?week=4"`));
  });

  test("absent for an admin who does not facilitate the group, at any other time, and a member is refused as before", async () => {
    await at(TONIGHT);
    assert.ok(!Object.hasOwn((await w.summary("zach")).body, "slips"));
    const member = await w.summary("chloe");
    assert.deepEqual([member.status, member.body], [403, { error: "Forbidden" }]);
    await at(NOON);
    const noon = await w.summary("rahul");
    assert.equal(noon.status, 200);
    assert.ok(!Object.hasOwn(noon.body, "slips"));
    assert.doesNotMatch((await w.home("rahul")).html, /home-slips/);
    await at(TONIGHT);
    everybodyHas(4);
    assert.ok(!Object.hasOwn((await w.summary("rahul")).body, "slips"));
  });
});

// ---------------------------------------------------------------------------
// 3. The guide's week page
// ---------------------------------------------------------------------------

describe("3. the guide's week page, on the evening its session hands next week's slips out", () => {
  test("week 3's page tonight, for the group's facilitators: the card after the plan", async () => {
    await at(TONIGHT);
    for (const who of ["rahul", "sofia"]) {
      const page = await w.docPage(who, "week-3");
      assert.match(page.text, /After session 3 Copy in the pack and case slips you handed out for week 4\. Copy in week 4’s slips/, who);
      assert.match(page.html, new RegExp(`href="/learn/draw/${B}\\?week=4"`), who);
      // After the week's first part, never before it.
      assert.ok(page.html.indexOf(`href="/learn/draw/${B}`) > page.html.indexOf('class="part"'), who);
    }
  });

  test("not another week's page, not at noon, and not for an admin with no group on the course", async () => {
    await at(TONIGHT);
    assert.doesNotMatch((await w.docPage("rahul", "week-2")).html, /\/learn\/draw\//);
    assert.doesNotMatch((await w.docPage("zach", "week-3")).html, /\/learn\/draw\//);
    await at(NOON);
    assert.doesNotMatch((await w.docPage("rahul", "week-3")).html, /\/learn\/draw\//);
  });
});

// ---------------------------------------------------------------------------
// 4. A course that gives nothing out and has no pairs
// ---------------------------------------------------------------------------

describe("4. a course that gives nothing out and has no pairs answers as it always did", () => {
  test("on the evening a hand-out would be: no card, no row, no fact, no pointer", async () => {
    await at(TONIGHT, guideSeed());
    for (const who of ["rahul", "zach"]) {
      const group = await w.groupPage(who);
      assert.doesNotMatch(group.html, /data-testid="draw-card"|aria-labelledby="group-pairs"|\/learn\/draw\//, who);
      const page = await register(who);
      assert.ok(page.grid, who);
      assert.ok(!Object.hasOwn(page.grid.props, "handOut"), who);
      assert.ok(!Object.hasOwn((await w.summary(who)).body, "slips"), who);
      assert.doesNotMatch((await w.docPage(who, "week-3")).html, /\/learn\/draw\//, who);
    }
    assert.doesNotMatch((await w.home("rahul")).html, /home-slips|\/learn\/draw\//);
  });
});
