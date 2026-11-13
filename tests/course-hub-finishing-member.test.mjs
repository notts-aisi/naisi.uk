/**
 * "Course complete" no more: what a member's own pages say once a
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
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  A,
  BEFORE,
  C,
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
/**
 * The page after the end, whether somebody finished or not, names the programme, by
 * the name it goes by, in the head of the page somebody who took part reads
 * once it is over, and under it the term and their group: with its
 * facilitators for somebody who finished, after the thanks for everybody
 * else. Staff read the course's title over the page, as before.
 */
const PROGRAMME = "AGI Strategy";
const GROUP_LINE = {
  amara: "Autumn 2026 · Group A · with Sofia",
  dev: "Autumn 2026 · Group A · with Sofia",
  kofi: "Autumn 2026 · Group B · with Rahul and Sofia",
  bea: "Autumn 2026 · Group A.",
  tariq: "Autumn 2026 · Group A.",
  freya: "Autumn 2026 · Group D.",
};

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
      assert.ok(pages.home.startsWith(`My programmes ${PROGRAMME} You finished ${PROGRAMME}. ${GROUP_LINE[who]} What you keep `), pages.home);
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
      assert.ok(pages.home.startsWith(`My programmes ${PROGRAMME} ${PROGRAMME} has ended. Thanks for being part of it. ${GROUP_LINE[who]} What you keep `), pages.home);
      assert.match(pages.card, /Ended/);
      assert.match(pages.list, new RegExp(`${COURSE_TITLE} Ended`));
      assert.match(pages.homeLine, /· ended/);
      const all = everything(pages);
      assert.doesNotMatch(all, /You finished|Finished|finished it|Course complete|Completed|cohort has finished/);
      assert.doesNotMatch(all, /didn’t finish|did not finish|not finished|at least \d|of \d sessions/i);
    });
  }

  test("at least 6, Chloe, at every session Group B held, is told she finished; Yasmin, at five of Group D's six, that it has ended", async () => {
    world.db.seed(rulePath, RULE(6));
    const chloe = await pagesOf("chloe");
    assert.deepEqual([chloe.overview.body.finished, chloe.entry.finished], [true, true]);
    assert.match(chloe.home, new RegExp(`You finished ${PROGRAMME}\\. Autumn 2026 · Group B · with Rahul and Sofia What you keep`));
    const yasmin = await pagesOf("yasmin");
    assert.deepEqual([yasmin.overview.body.finished, yasmin.entry.finished], [false, false]);
    assert.match(yasmin.home, new RegExp(`${PROGRAMME} has ended\\. Thanks for being part of it\\. Autumn 2026 · Group D\\. What you keep`));
  });

  test("the lead unticking somebody the rule ticked tells them it has ended", async () => {
    world.db.seed(decisionPath("amara"), decision("amara", false, "claudia"));
    const pages = await pagesOf("amara");
    assert.equal(pages.overview.body.finished, false);
    assert.match(pages.home, new RegExp(`${PROGRAMME} has ended\\. Thanks for being part of it\\. Autumn 2026 · Group A\\. What you keep`));
    assert.doesNotMatch(pages.home, /You finished/);
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

  test("the one answer is false for somebody who left, whatever is stored about them", async () => {
    world.db.seed(decisionPath("sam"), decision("sam", true, "zach"));
    const { normalizeCourseRun } = await made.loadTs(join("lib", "firestore", "courses.ts"));
    const { normalizeCourseEnrolment } = await made.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
    const run = normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const sam = normalizeCourseEnrolment(`${RUN.agi}__sam`, world.db.read(`courseEnrolments/${RUN.agi}__sam`));
    assert.equal(sam.status, "withdrawn");
    assert.equal(await lib.record.finishedForMember(world.courseDb, run, sam, new Date()), false);
    // The same person with the same decision, taking part, would be answered true: the refusal is about leaving.
    assert.equal(await lib.record.finishedForMember(world.courseDb, run, { ...sam, status: "active" }, new Date()), true);
  });

  test("no payload carries the rule, the suggestion or who changed what", async () => {
    for (const who of ["amara", "bea", "kofi", "rahul"]) {
      const json = JSON.stringify([(await ask.overview(who)).body, await ask.me(who)]);
      assert.doesNotMatch(json, /atLeast|suggest|byUid|decidedBy|"rule"|Changed by/, who);
    }
  });

  test("while the run is going, the run home reads nothing of who finished but the rule, by its address, for somebody taking part", async () => {
    // CHANGED ON PURPOSE (November 2026): a learner is told what a
    // certificate needs, so the run home reads the run's rule, and nothing
    // else of who finished (no decision, no list); a facilitator reads none of it.
    mock.timers.setTime(new Date("2026-11-17T12:00:00Z").getTime());
    const finishingReads = async (who) => {
      const reads = [];
      const collection = world.db.collection;
      world.db.collection = (path) => {
        reads.push(path);
        return collection(path);
      };
      try {
        await ask.overview(who);
      } finally {
        world.db.collection = collection;
      }
      return reads.filter((path) => path === "courseFinishing").length;
    };
    assert.equal(await finishingReads("amara"), 1, "a run still going read more of who finished than its rule");
    assert.equal(await finishingReads("rahul"), 0, "a facilitator's run home read who finished");
  });
});

// ---------------------------------------------------------------------------
// 6. What a certificate needs
// ---------------------------------------------------------------------------

describe("6. what a certificate needs, told to somebody taking part on a run with a rule", () => {
  /** Tue 17 Nov 2026: the run is going, every group mid-term. */
  const MID = new Date("2026-11-17T12:00:00Z");
  const EXCUSED = " A session you’re excused from doesn’t count as coming.";
  const needs = (who) => ask.overview(who).then((answer) => answer.body.certificateNeeds);

  test("the sentence: a rule and six sessions, a group due fewer, no count, somebody who joined late, an incubator, and no rule", () => {
    const words = lib.words.certificateNeedsWords;
    assert.equal(
      words({ atLeast: 5, due: 6, noOf: false, incubator: false }),
      "To get your certificate you need to come to at least 5 of your group’s 6 sessions. A session you’re excused from doesn’t count as coming.",
    );
    // A group due fewer than the rule asks holds them to every one it holds: its number, for both.
    assert.equal(words({ atLeast: 5, due: 4, noOf: false, incubator: false }), `To get your certificate you need to come to at least 4 of your group’s 4 sessions.${EXCUSED}`);
    // No count to say simply and truly: no "of".
    assert.equal(words({ atLeast: 5, due: null, noOf: false, incubator: false }), `To get your certificate you need to come to at least 5 sessions.${EXCUSED}`);
    assert.equal(words({ atLeast: 5, due: 4, noOf: true, incubator: false }), `To get your certificate you need to come to at least 4 sessions.${EXCUSED}`);
    assert.equal(words({ atLeast: 1, due: null, noOf: false, incubator: false }), `To get your certificate you need to come to at least 1 session.${EXCUSED}`);
    // An incubator's people are told of no group.
    assert.equal(words({ atLeast: 5, due: 6, noOf: false, incubator: true }), `To get your certificate you need to come to at least 5 of your 6 sessions.${EXCUSED}`);
    // No rule: nothing.
    assert.equal(words({ atLeast: null, due: 6, noOf: false, incubator: false }), null);
    for (const said of [words({ atLeast: 5, due: 6, noOf: false, incubator: false }), words({ atLeast: 5, due: null, noOf: false, incubator: true })]) {
      assert.doesNotMatch(said ?? "", /[\u2013\u2014]|collate/i);
    }
  });

  test("the run home's answer: each learner's group counted as who finished counts it; nothing for a facilitator, a learner who facilitates, with no rule, or once it is over", async () => {
    mock.timers.setTime(MID.getTime());
    // Rule 4 (the suite's): Group A holds six sessions, Group B five (its week 4 was called off).
    assert.equal(await needs("amara"), `To get your certificate you need to come to at least 4 of your group’s 6 sessions.${EXCUSED}`);
    assert.equal(await needs("kofi"), `To get your certificate you need to come to at least 4 of your group’s 5 sessions.${EXCUSED}`);
    // A rule above what Group B is due: its own number, for both.
    world.db.seed(rulePath, RULE(6));
    assert.equal(await needs("kofi"), `To get your certificate you need to come to at least 5 of your group’s 5 sessions.${EXCUSED}`);
    assert.equal(await needs("amara"), `To get your certificate you need to come to at least 6 of your group’s 6 sessions.${EXCUSED}`);
    // A facilitator's place, and a learner who facilitates a group of the run: nothing.
    assert.equal(await needs("rahul"), null);
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "hamza"] });
    assert.equal(await needs("hamza"), null);
    // Nothing of their own count, nor anybody else's.
    assert.doesNotMatch(JSON.stringify((await ask.overview("amara")).body), /"atLeast"|suggest|decidedBy|"rule"/);
    // No rule: nothing, as before.
    reset();
    assert.equal(await needs("amara"), null);
    // Once the programme is over they are told whether they finished instead.
    world.db.seed(rulePath, RULE(4));
    mock.timers.setTime(END.getTime());
    assert.equal(await needs("amara"), null);
  });

  test("a group meeting twice in a week is told the number with no \"of\", and a session whose old register says it was not held is not counted, as the record counts neither", async () => {
    mock.timers.setTime(MID.getTime());
    assert.equal(await needs("amara"), `To get your certificate you need to come to at least 4 of your group’s 6 sessions.${EXCUSED}`);
    // An old register that says Group A's week 2 was not held: the record leaves it out, and so does the count.
    world.db.poke(`courseAttendance/${RUN.agi}__${A}__w02`, { held: false });
    assert.equal(await needs("amara"), `To get your certificate you need to come to at least 4 of your group’s 5 sessions.${EXCUSED}`);
    // The same, as the pure function counts it, by session key.
    const [needsLib, groups, runs] = await Promise.all([
      made.loadTs(join("lib", "courses", "finishing", "needs.ts")),
      made.loadTs(join("lib", "firestore", "courseGroups.ts")),
      made.loadTs(join("lib", "firestore", "courses.ts")),
    ]);
    const runDoc = runs.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const groupDoc = groups.normalizeCourseGroup(A, world.db.read(`courseGroups/${A}`));
    const base = { rule: { atLeast: 4 }, run: runDoc, enrolment: { role: "learner", status: "active", joinedWeekNumber: 1 }, facilitates: false, incubator: false };
    assert.equal(needsLib.sessionsDueFor(runDoc, groupDoc, 1), 6);
    assert.equal(needsLib.sessionsDueFor(runDoc, groupDoc, 1, new Set(["w02", "w05"])), 4);
    assert.equal(
      needsLib.certificateNeedsFor({ ...base, group: groupDoc, registers: new Map([["w02", { held: false }], ["w03", { held: true }], ["w04", {}]]) }),
      `To get your certificate you need to come to at least 4 of your group’s 5 sessions.${EXCUSED}`,
    );
    // A group with a second session a week: the record counts one a week, so
    // no "of". No stored group has one yet (the group's reader keeps no
    // second slot), so it is given to the function as the sessions read it.
    const twice = { ...groupDoc, extraSession: { weekday: 1, startTimeLocal: "18:00", durationMinutes: 120, location: "Hallward B12", meetingUrl: null, notes: "" } };
    assert.equal(needsLib.certificateNeedsFor({ ...base, group: twice }), `To get your certificate you need to come to at least 4 sessions.${EXCUSED}`);
    assert.equal(needsLib.certificateNeedsFor({ ...base, group: twice, incubator: true }), `To get your certificate you need to come to at least 4 sessions.${EXCUSED}`);
  });

  test("the programme page says it under the marks, and Home beside its certificate line in the last week; neither says anything with no rule", async () => {
    mock.timers.setTime(MID.getTime());
    const sentence = `To get your certificate you need to come to at least 4 of your group’s 6 sessions.${EXCUSED}`;
    world.overview = (await ask.overview("amara")).body;
    const home = textOf(renderToStaticMarkup(createElement(member.RunHome, { runId: RUN.agi, isAdmin: false, canEmailCohort: false, pitching: null })));
    assert.ok(home.includes(sentence), home);
    world.overview = (await ask.overview("rahul")).body;
    assert.doesNotMatch(textOf(renderToStaticMarkup(createElement(member.RunHome, { runId: RUN.agi, isAdmin: false, canEmailCohort: false, pitching: null }))), /To get your certificate/);
    // Group A's last week: Home's "After tonight" says it under "Everyone who finishes gets a certificate."
    mock.timers.setTime(new Date("2026-12-03T12:00:00Z").getTime());
    const pages = await pagesOf("amara");
    assert.ok(pages.homeLine.includes(`Everyone who finishes gets a certificate. ${sentence}`), pages.homeLine);
  });
});
