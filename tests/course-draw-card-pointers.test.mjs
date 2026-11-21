/**
 * WHAT POINTS TO THE PATHWAYS AND CASES PAGE AT THE SESSION THAT HANDS THE
 * SLIPS OUT, besides the group page's card (`tests/course-draw-card.test.mjs`):
 *
 *  1. THE REGISTER: one row beside the check-in, on the week the slips are
 *     for, only on the evening of the hand-out session while somebody has not
 *     got theirs, only on the register of that session (or one whose address
 *     names none), and only for whom that page's own gate admits: the group's
 *     facilitators and admins, never a run's track lead or somebody covering
 *     one session. The row streams in its own `Suspense`: the register
 *     answers, the same, whether the row's reads finish, hang or fail.
 *  2. HOME, through the group summary route: one fact, worked out for a
 *     facilitator of the group alone and absent at any other time, and the
 *     card it draws. A member is refused as before.
 *  3. THE GUIDE'S WEEK PAGE: the card after the week's plan, for each of the
 *     reader's own groups, on the evening its session hands next week's slips
 *     out, each named by its group when there are two.
 *  4. A COURSE THAT GIVES NOTHING OUT AND HAS NO PAIRS: the group page, the
 *     register, the summary, Home and the guide in the shapes they had before
 *     the card's states (their regions and fields as drawn then), and nothing
 *     that leads to the pathways and cases page, on the very evening a
 *     hand-out would be.
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
import { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after, before, describe, mock, test } from "node:test";
import { B, NOW, RUN, find, guideSeed, makeFacilitatorGuideWorld } from "./lib/facilitatorGuideWorld.mjs";
import { A } from "./lib/facilitatorPagesWorld.mjs";
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

/** The row's own server component, as the register's slot holds it, drawn now: what it would stream in, or null. */
async function streamed(slot) {
  if (!slot) return null;
  assert.equal(slot.type, Suspense, "the row is not in a Suspense of its own");
  assert.equal(slot.props.fallback, null, "the row's Suspense shows something while it waits");
  const loader = slot.props.children;
  w.world.course = true;
  try {
    return await loader.type(loader.props);
  } finally {
    w.world.course = false;
  }
}

/**
 * The register page as `who`, with the session its address names: the page,
 * the grid it hands the register, the slot (absent unless tonight can be a
 * hand-out evening), and the row that slot streams in, drawn after the page
 * has answered.
 */
async function register(who, session = undefined) {
  const page = await w.draw(w.pages.register, who, { runId: RUN.agi, groupId: B }, session ? { session } : {});
  const grid = page.element ? find(page.element, "AttendanceGrid")[0] : null;
  const slot = grid?.props.handOut ?? null;
  return { ...page, grid, slot, row: await streamed(slot) };
}

/** Reads the test store has served so far. */
const reads = () => w.world.db.stats.reads;

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
    assert.equal(yusuf.row, null, "the run's track lead is offered the page");
    // Somebody given this one session (Tom, who facilitates Group C) takes it, and is not offered the page either.
    w.world.db.seed(`courseAttendance/${RUN.agi}__${B}__w03`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 3,
      occurrence: 1,
      records: {},
      held: true,
      pushedAt: null,
      pushedByUid: "",
      participantNotes: {},
      notes: "",
      markedByUid: "",
      updatedAt: new Date(NOW),
      cover: { kind: "given", byUid: "tom", at: new Date(NOW), until: new Date("2026-11-18T00:00:00Z"), covering: ["rahul", "sofia"] },
    });
    const tom = await register("tom", "w03");
    assert.ok(tom.grid, "somebody given the session does not reach its register");
    assert.equal(tom.row, null, "somebody covering one session is offered the page");
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
  });

  test("the register never waits for the row: drawn and answered with the row's reads unfinished, and the same when they fail", async () => {
    await at(TONIGHT);
    const ordinary = await register("rahul");
    // The row's draw reads hang: the page still answers, with the slot unread.
    const db = w.world.courseDb;
    const getAll = db.getAll;
    const draws = (refs) => refs.some((ref) => String(ref.path ?? "").startsWith("coursePacksAndCases/"));
    db.getAll = (...refs) => (draws(refs) ? new Promise(() => {}) : getAll.apply(db, refs));
    const before = reads();
    const page = await w.draw(w.pages.register, "rahul", { runId: RUN.agi, groupId: B }, {});
    const pageReads = reads() - before;
    const grid = find(page.element, "AttendanceGrid")[0];
    assert.equal(grid.props.handOut.type, Suspense);
    // Its markup and the grid's every other prop are the ones it draws when the row arrives.
    const others = (props) => JSON.stringify({ ...props, handOut: undefined });
    assert.equal(page.html, ordinary.html);
    assert.equal(others(grid.props), others(ordinary.grid.props));
    // The row's reads fail: it draws nothing, and the register is as it was.
    db.getAll = (...refs) => (draws(refs) ? Promise.reject(new Error("unavailable")) : getAll.apply(db, refs));
    const failed = await register("rahul");
    assert.equal(failed.row, null);
    assert.equal(failed.html, ordinary.html);
    assert.equal(others(failed.grid.props), others(ordinary.grid.props));
    db.getAll = getAll;
    // What the page itself asked for: the register's own reads and the
    // course's weeks, never the run's every register or account (the people
    // the row counts) and never a draw, which only the row reads.
    const asked = [];
    const collection = db.collection;
    db.collection = (path) => {
      const ref = collection.call(db, path);
      const where = ref.where;
      return { ...ref, where: (field, ...rest) => (asked.push(`${path} ${field}`), where(field, ...rest)) };
    };
    const drawn = await w.draw(w.pages.register, "rahul", { runId: RUN.agi, groupId: B }, {});
    const slot = find(drawn.element, "AttendanceGrid")[0].props.handOut;
    assert.ok(slot, "tonight the register is handed the row's slot");
    assert.ok(!asked.includes("courseAttendance runId"), `the register's page read the run's every register: ${asked.join(", ")}`);
    // The row, read after, reads them: the spy sees it.
    assert.ok(await streamed(slot));
    db.collection = collection;
    assert.ok(asked.includes("courseAttendance runId"), "the spy no longer sees the row's people read");
    assert.ok(pageReads > 0);
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
    assert.match(home.text, /Slips from Tuesday’s session Copy in the packs and cases you hand out for week 4\. Packs and cases/);
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

  test("two of the reader's groups handing out the same evening: a card each, each named by its group", async () => {
    await at(TONIGHT);
    // Rahul facilitates Group A too, which meets on Tuesdays at 6pm as well.
    const groupA = w.world.db.read(`courseGroups/${A}`);
    w.world.db.poke(`courseGroups/${A}`, { facilitatorUids: [...groupA.facilitatorUids, "rahul"], session: { ...groupA.session, weekday: 2, startTimeLocal: "18:00" } });
    const page = await w.docPage("rahul", "week-3");
    const labels = [...page.html.matchAll(/<section[^>]*aria-label="([^"]*After session 3)"/g)].map(([, label]) => label);
    assert.equal(labels.length, 2, page.text);
    assert.equal(new Set(labels).size, 2, `two cards share one name: ${labels.join(", ")}`);
    for (const label of labels) assert.match(label, /^.+ · After session 3$/);
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
  /** Every region and named part of a page, in the markup's order. */
  const regions = (html) => [...html.matchAll(/(?:aria-labelledby|data-testid|aria-label)="([^"]+)"/g)].map(([, id]) => id);

  test("on the evening a hand-out would be: the group page, the register, the summary, Home and the guide in the shapes they had", async () => {
    await at(TONIGHT, guideSeed());
    // Each as it was before the card's states, read off the pages as they were drawn then.
    assert.deepEqual(regions((await w.groupPage("rahul")).html), [
      "Your next session", "session-card", "before-the-session", "group-updates", "group-meets-facilitator", "Weeks",
      "Week 1, Tue 3 Nov · met", "Week 2, Tue 10 Nov · met", "Week 3, Tue 17 Nov · no register", "Week 4, Tue 24 Nov",
      "Week 5, Tue 1 Dec", "Week 6, Tue 8 Dec", "meeting-links", "Set the link: Week 3", "Set the link: Week 4",
      "Set the link: Week 5", "Set the link: Week 6", "group-to-review", "Review Farah Hussain, week 2 exercise",
      "Review Chloe Nguyen, week 2 exercise", "Review Chloe Nguyen, week 1 exercise", "group-people", "group-roster",
      "Members of this group", "Week 1: Present", "Week 2: Present", "Week 1: Present", "Week 2: Late", "Week 1: Excused",
      "Week 2: Present", "Week 1: Present", "Week 2: Had left", "group-registers", "group-pace", "group-notes",
    ]);
    const page = await register("rahul");
    assert.deepEqual(Object.keys(page.grid.props), ["groupId", "runId", "reportHref", "session", "didntHappen", "requestsBase"]);
    assert.equal(page.slot, null);
    assert.deepEqual(Object.keys((await w.summary("rahul")).body), [
      "groupId", "expected", "notYetTold", "toReview", "nextEmail", "leftRecently", "coFacilitators", "whosComing", "write", "explainer",
    ]);
    assert.deepEqual(regions((await w.home("rahul")).html), ["Your next session", "This week"]);
    assert.deepEqual(regions((await w.docPage("rahul", "week-3")).html), ["Group B", "On this page", "w03-plan-title", "w03-notes-title"]);
  });

  test("and nothing that leads to the pathways and cases page, for a facilitator or an admin", async () => {
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
