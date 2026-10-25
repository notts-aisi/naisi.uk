/**
 * "Course complete" no more (C43): what a member's own pages say once a
 * programme is over, for every kind of member, and that each one asks the
 * finished record.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/courses/runs/[runId]/overview   (the run home's one fetch)
 *   GET /api/courses/me                      (the hub's cards and Home)
 *   the run home, the hub's card, Home's line and its programmes list
 *
 * ## What this guards
 *
 *  1. SOMEBODY WHO FINISHED, by the rule (at its edge too) or by the lead's
 *     change, is told so: "You finished AGI Strategy Fellowship.", "Finished".
 *  2. SOMEBODY WHO DID NOT is told the programme has ended, and nothing on
 *     any of their pages claims they finished, says they did not, or names a
 *     number of sessions.
 *  3. SOMEBODY WHO LEFT, OR WAS NEVER TOLD, is shown nothing of the run, as
 *     before; a facilitator is told it has ended.
 *  4. BEFORE THE END, AND WITH NO RULE, nobody is told they finished.
 *  5. ONE RECORD: the lead's list, the run home's payload and the hub's entry
 *     agree for every person, and no payload carries the rule.
 *
 * Real: both routes, the four components, the libraries. Faked: the
 * session, the Admin SDK handle, the clock, the stylesheets, and the parts
 * of the pages drawn around these words.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BEFORE,
  END,
  RULE,
  RUN,
  decision,
  decisionPath,
  makeFinishWorld,
  rulePath,
  textOf,
} from "./lib/finishWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: END });

const made = await makeFinishWorld("__finishMember");
const { world, reset, ask, member, lib } = made;

const COURSE_TITLE = "AGI Strategy Fellowship";

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
  world.db.seed(rulePath, RULE(4));
  world.db.seed(decisionPath("kofi"), decision("kofi", true, "claudia"));
});

/** Every page a member reads about the run, as `who`, in words. */
async function pagesOf(who) {
  const overview = await ask.overview(who);
  const runs = await ask.me(who);
  const entry = runs.find((row) => row.runId === RUN.agi) ?? null;
  const out = { overview, entry, runs };
  if (overview.status === 200) {
    world.overview = overview.body;
    out.home = textOf(renderToStaticMarkup(createElement(member.RunHome, { runId: RUN.agi, isAdmin: false, canEmailCohort: false, pitching: null })));
  }
  if (entry) {
    out.card = textOf(renderToStaticMarkup(createElement(member.RunCard, { entry })));
    out.list = textOf(renderToStaticMarkup(createElement(member.MyCoursesSummary, { runs, loading: false, error: null, featuredRunId: null })));
    world.overview = overview.status === 200 ? overview.body : null;
    out.homeLine = textOf(
      renderToStaticMarkup(createElement(member.HomeProgramme, { given: "You", invite: null, entry, comingUp: null, applications: null, more: null })),
    );
  }
  return out;
}

const everything = (pages) => [pages.home, pages.card, pages.list, pages.homeLine].filter(Boolean).join(" \n ");

// ---------------------------------------------------------------------------
// 1 and 2. Finished, and not
// ---------------------------------------------------------------------------

describe("1. somebody who finished is told so", () => {
  for (const [who, why] of [
    ["amara", "came to every session"],
    ["dev", "came to exactly as many as the rule asks"],
    ["kofi", "came to fewer, and the lead ticked him"],
  ]) {
    test(`${who}, who ${why}`, async () => {
      const pages = await pagesOf(who);
      assert.equal(pages.overview.body.finished, true);
      assert.equal(pages.entry.finished, true);
      assert.match(pages.home, new RegExp(`You finished ${COURSE_TITLE}\\. Every week stays open, so you can go back to any of them\\.`));
      assert.match(pages.card, /Finished/);
      assert.match(pages.list, new RegExp(`${COURSE_TITLE} Finished`));
      assert.match(pages.homeLine, /· finished/);
      assert.doesNotMatch(everything(pages), /Course complete|Completed|has ended|cohort has finished/);
    });
  }
});

describe("2. somebody who did not finish is told it has ended, and nothing more", () => {
  for (const [who, why] of [
    ["bea", "came to 2"],
    ["tariq", "came to one fewer than the rule asks"],
    ["freya", "came to 1"],
  ]) {
    test(`${who}, who ${why}`, async () => {
      const pages = await pagesOf(who);
      assert.equal(pages.overview.body.finished, false);
      assert.equal(pages.entry.finished, false);
      assert.match(pages.home, new RegExp(`${COURSE_TITLE} has ended\\. Thanks for being part of it\\.`));
      assert.match(pages.card, /Ended/);
      assert.match(pages.list, new RegExp(`${COURSE_TITLE} Ended`));
      assert.match(pages.homeLine, /· ended/);
      const all = everything(pages);
      assert.doesNotMatch(all, /You finished|Finished|finished it|Course complete|Completed|cohort has finished/);
      assert.doesNotMatch(all, /didn’t finish|did not finish|not finished|at least \d|of \d sessions/i);
    });
  }

  test("the lead unticking somebody the rule ticked tells them it has ended", async () => {
    world.db.seed(decisionPath("amara"), decision("amara", false, "claudia"));
    const pages = await pagesOf("amara");
    assert.equal(pages.overview.body.finished, false);
    assert.match(pages.home, new RegExp(`${COURSE_TITLE} has ended\\.`));
  });
});

// ---------------------------------------------------------------------------
// 3. Left, never told, and staff
// ---------------------------------------------------------------------------

describe("3. somebody who left or was never told, and a facilitator", () => {
  test("somebody who left, or was taken off, is shown nothing of the run, as before", async () => {
    world.db.seed(decisionPath("sam"), decision("sam", true, "zach"));
    for (const who of ["sam", "omar"]) {
      const pages = await pagesOf(who);
      assert.equal(pages.overview.status, 403, who);
      assert.equal(pages.entry, null, who);
    }
  });

  test("somebody placed and never told by Publish is shown nothing either", async () => {
    const pages = await pagesOf("una");
    assert.equal(pages.overview.status, 403);
    assert.equal(pages.entry, null);
  });

  test("a facilitator is told the course has ended, and their payload claims nothing", async () => {
    const overview = await ask.overview("rahul");
    assert.equal(overview.status, 200);
    assert.equal(overview.body.finished, false);
    world.overview = overview.body;
    const home = textOf(renderToStaticMarkup(createElement(member.RunHome, { runId: RUN.agi, isAdmin: false, canEmailCohort: false })));
    assert.match(home, new RegExp(`${COURSE_TITLE} has ended\\.`));
  });
});

// ---------------------------------------------------------------------------
// 4. Before the end, and with no rule
// ---------------------------------------------------------------------------

describe("4. nobody is told they finished before the end, or with no rule and no change", () => {
  test("on the last day, before the last session, the run home is on week 6 and claims nothing", async () => {
    mock.timers.setTime(BEFORE.getTime());
    const pages = await pagesOf("amara");
    assert.equal(pages.overview.body.finished, false);
    assert.equal(pages.entry.finished, false);
    assert.match(pages.home, /Week 6 of 6/);
    assert.doesNotMatch(everything(pages), /You finished|has ended|Finished|Ended/);
  });

  test("with no rule and no change, everybody is told it has ended", async () => {
    world.db.seed(rulePath, { kind: "gone" });
    world.db.seed(decisionPath("kofi"), { kind: "gone" });
    for (const who of ["amara", "kofi", "bea"]) {
      const pages = await pagesOf(who);
      assert.equal(pages.overview.body.finished, false, who);
      assert.match(pages.home, /has ended\./, who);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. One record
// ---------------------------------------------------------------------------

describe("5. one record, asked by every page, and the rule never sent", () => {
  test("the lead's list, the run home and the hub agree for everybody taking part", async () => {
    const records = await lib.attendance.readRunRecords(world.courseDb, RUN.agi);
    const model = await lib.who.loadWhoFinished(world.courseDb, records, { isAdmin: false, uid: "claudia" }, new Date());
    assert.equal(model.state, "open");
    assert.equal(model.rows.length, 10);
    for (const row of model.rows) {
      const overview = await ask.overview(row.uid);
      const entry = (await ask.me(row.uid)).find((run) => run.runId === RUN.agi);
      assert.deepEqual([overview.body.finished, entry.finished], [row.finished, row.finished], row.name);
    }
  });

  test("no payload carries the rule, the suggestion or who changed what", async () => {
    for (const who of ["amara", "bea", "kofi", "rahul"]) {
      const json = JSON.stringify([(await ask.overview(who)).body, await ask.me(who)]);
      assert.doesNotMatch(json, /atLeast|suggest|byUid|decidedBy|"rule"|Changed by/, who);
    }
  });

  test("the run home asks the record only once the member's own calendar is past its last week", async () => {
    mock.timers.setTime(new Date("2026-11-17T12:00:00Z").getTime());
    world.db.stats.reads = 0;
    const reads = [];
    const collection = world.db.collection;
    world.db.collection = (path) => {
      reads.push(path);
      return collection(path);
    };
    try {
      await ask.overview("amara");
    } finally {
      world.db.collection = collection;
    }
    assert.ok(!reads.includes("courseFinishing"), "a run still going read who finished");
  });
});
