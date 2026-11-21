/**
 * A programme's Overview says when a group's slips are not all copied in:
 * "Group C: 2 people are waiting for week 3’s case." under Needs attention,
 * for the programme's lead and admins, from the end of the session that
 * hands a week's slips out until that week's first session starts.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE LINE OVER BUILT WORLDS, through the real Overview page: before the
 *     hand-out session, during it, just after it ends (shown), once everybody
 *     has theirs (gone), once the week's session starts (gone); a hand-out
 *     session called off; week 1; a pathway each person picks, not picked
 *     (not counted) and picked with no case (counted); one person and
 *     several; pathway, plan, case and both, and a title that is a phrase or
 *     starts with capitals; two groups at once; and the way to
 *     the group's pathways and cases page on the rule's week, which is the
 *     week the group page's card opens it on.
 *  2. THE READS: the run's weeks once for the whole view, each group's own
 *     copies only for a group between sessions, nothing for a group in its
 *     session, the draw only of a week past its hand-out session, a group's
 *     own copy that gives out what the run's week does not, and a read that
 *     fails for one group leaving the other's line and the page. A course
 *     that gives nothing out, and a week where everybody has theirs, draw
 *     Needs attention and the page exactly as with the slips read answering
 *     nothing.
 *  3. WHO: the lead and an admin, each counting the people the card counts
 *     for them; a reviewer, the lead of another programme and everybody else
 *     refused as before, with nothing of the draw read.
 *  4. THE WORDS, every sentence, word for word.
 *
 * Built on `tests/lib/packsAndCasesWorld.mjs`: AGI Strategy, weeks 2 and 3
 * giving out a pack and a case, Group B on Tuesdays at 6pm (Chloe, Farah and
 * Kofi, with Rahul, Sofia and Farah facilitating), Group C on Wednesdays at
 * 1pm (Hamza, with Tom facilitating, and Una placed and not told). The clock
 * starts at noon on Tue 17 Nov 2026, between week 2's sessions and week 3's.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, mock, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, ROUND } from "./lib/hubAttendanceWorld.mjs";
import { B, C, D, NOW, RUN, W2, W3, blockWeekDoc, makePacksAndCasesWorld, packsSeed, textOf, weekBlocksFor } from "./lib/packsAndCasesWorld.mjs";

const w = await makePacksAndCasesWorld("__overviewSlips");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: OverviewPage } = await w.loadTs(join(PROGRAMME, "overview", "page.tsx"));
const line = await w.loadTs(join("lib", "courses", "drawCard", "overviewLine.ts"));

mock.timers.enable({ apis: ["Date"], now: NOW });

/** Group B's five, as its draw counts them. */
const GROUP_B = ["chloe", "farah", "kofi", "rahul", "sofia"];

/** Find every element a component of this name draws. */
function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  for (const value of Object.values(element.props ?? {})) find(value, name, out);
  return out;
}

/**
 * What the store is asked while `fn` runs: each top-level collection by its
 * name, each query of a subcollection as `query <path>`, and each `getAll` as
 * one array of its paths. Optionally `fail` a subcollection's query.
 */
async function watched(fn, { fail = null } = {}) {
  const db = w.world.db;
  const log = [];
  const { collection, getAll } = db;
  const wrapDoc = (ref) => ({
    ...ref,
    collection: (name) => {
      const path = `${ref.path}/${name}`;
      const inner = ref.collection(name);
      return {
        ...inner,
        get: async () => {
          log.push(`query ${path}`);
          if (path === fail) throw new Error(`the store refused ${path}`);
          return inner.get();
        },
      };
    },
  });
  db.collection = (name) => {
    log.push(name);
    const inner = collection(name);
    return { ...inner, doc: (id) => wrapDoc(inner.doc(id)) };
  };
  db.getAll = async (...refs) => {
    log.push(refs.map((ref) => ref.path));
    return getAll(...refs);
  };
  try {
    return { result: await fn(), log };
  } finally {
    db.collection = collection;
    db.getAll = getAll;
  }
}

/** The Overview as `who` reads it, on the applications' view of the store, as the page is served. */
async function overview(who, options = {}) {
  const { result, log } = await watched(async () => {
    w.world.user = who === null ? null : w.sessionFor(who);
    w.world.course = false;
    try {
      const element = await OverviewPage({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) });
      const html = renderToStaticMarkup(element);
      const [drawn] = find(element, "ProgrammeOverview");
      return { model: drawn?.props.model ?? null, html, text: textOf(html), to: null };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { model: null, html: "", text: "", to: err.to };
    }
  }, options);
  return { ...result, log };
}

/** The slips lines, as `{ title, href, label }`. */
const slipsOf = (model) => model.attention.filter((item) => item.kind === "slips").map(({ title, link }) => ({ title, href: link?.href, label: link?.label }));
/** One group's slips line's title, or null. */
const lineFor = (model, groupName) => slipsOf(model).find((item) => item.title.startsWith(`${groupName}: `))?.title ?? null;
const hrefTo = (groupId, week) => `/learn/draw/${encodeURIComponent(groupId)}?week=${week}`;

/** Week 3's blocks, changed by block id. */
function weekThree(change = {}) {
  const blocks = weekBlocksFor("w3");
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (typeof node.id === "string" && change[node.id]) Object.assign(node, change[node.id]);
    for (const value of Object.values(node)) if (value && typeof value === "object") walk(value);
  };
  walk(blocks);
  return { [`courseRuns/${RUN.agi}/weeks/w03`]: blockWeekDoc(3, "How sure are you, again?", blocks) };
}

/** Everybody in Group B has week `n`'s pack and case. */
function everybodyInB(n, except = []) {
  for (const uid of GROUP_B) {
    if (except.includes(uid)) continue;
    const ids = n === 2 ? W2 : W3;
    w.seedDraw(uid, `w${n}`, { pack: ids.markets, caseId: ids.crash });
  }
}

// ---------------------------------------------------------------------------
// 1. The line
// ---------------------------------------------------------------------------

describe("1. the line, from the end of the session that hands the slips out to the start of the week's session", () => {
  test("before, during and just after the hand-out session; once everybody has theirs; once the week's session starts", async () => {
    w.reset();
    everybodyInB(2);
    const table = [
      // [clock, Group B's line or null]
      ["2026-11-10T17:59:00Z", null],
      ["2026-11-10T18:00:00Z", null],
      ["2026-11-10T19:30:00Z", null],
      ["2026-11-10T19:59:00Z", null],
      // Ended at 8pm, as the member's own week page counts it (`handOutOf`).
      ["2026-11-10T20:00:00Z", "Group B: 5 people are waiting for week 3’s pack and case."],
      ["2026-11-10T20:01:00Z", "Group B: 5 people are waiting for week 3’s pack and case."],
      ["2026-11-17T12:00:00Z", "Group B: 5 people are waiting for week 3’s pack and case."],
      ["2026-11-17T17:59:00Z", "Group B: 5 people are waiting for week 3’s pack and case."],
      ["2026-11-17T18:00:00Z", null],
      ["2026-11-17T20:30:00Z", null],
    ];
    for (const [clock, expected] of table) {
      w.at(clock);
      const { model } = await overview("claudia");
      assert.equal(lineFor(model, "Group B"), expected, clock);
    }
    // Everybody has theirs: gone, while the week is still to come.
    w.at("2026-11-17T12:00:00Z");
    everybodyInB(3);
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), null);
  });

  test("it counts who has not got theirs, one person and several, and says it with the link to the page on the rule's week", async () => {
    w.reset();
    everybodyInB(3, ["kofi", "sofia"]);
    let { model, html } = await overview("claudia");
    const b = slipsOf(model).find((item) => item.title.startsWith("Group B: "));
    assert.deepEqual(b, { title: "Group B: 2 people are waiting for week 3’s pack and case.", href: hrefTo(B, 3), label: "Copy in the slips" });
    assert.ok(html.includes(`href="${hrefTo(B, 3)}"`));
    w.seedDraw("kofi", "w3", { pack: W3.markets, caseId: W3.crash });
    ({ model } = await overview("claudia"));
    assert.equal(lineFor(model, "Group B"), "Group B: 1 person is waiting for week 3’s pack and case.");
    // A pack and no case: waiting for the case alone.
    w.seedDraw("sofia", "w3", { pack: W3.markets });
    ({ model } = await overview("claudia"));
    assert.equal(lineFor(model, "Group B"), "Group B: 1 person is waiting for week 3’s case.");
  });

  test("the line's week is the week the group page's card opens the pathways and cases page on, at every clock time it shows", async () => {
    w.reset(packsSeed({ [`courseRuns/${RUN.agi}/weeks/w04`]: blockWeekDoc(4, "Who decides, again?", weekBlocksFor("w4")) }));
    for (const clock of ["2026-11-10T20:01:00Z", "2026-11-17T12:00:00Z", "2026-11-17T20:01:00Z", "2026-11-18T09:00:00Z"]) {
      w.at(clock);
      const { model } = await overview("zach");
      const shown = slipsOf(model).find((item) => item.title.startsWith("Group B: "));
      const card = new RegExp(`href="/learn/draw/${B}\\?week=(\\d+)"`).exec((await w.groupPage("rahul")).html);
      assert.ok(shown && card, clock);
      assert.equal(shown.href, hrefTo(B, Number(card[1])), clock);
    }
  });

  test("everything given out, the week's word: pathway, plan, case, and both", async () => {
    // A pathway given out and no case to give.
    w.reset(packsSeed(weekThree({ "w3-co-1": { title: "Pathway" }, "w3-cs-1": { givenBy: "fellow" } })));
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 5 people are waiting for week 3’s pathway.");
    w.reset(packsSeed(weekThree({ "w3-co-1": { title: "Plan" }, "w3-cs-1": { givenBy: "fellow" } })));
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 5 people are waiting for week 3’s plan.");
    // A title written as a phrase, or one that starts with capitals, is called a pathway, as the pathways and cases page calls it.
    for (const title of ["One career review that fits you", "AI pathway"]) {
      w.reset(packsSeed(weekThree({ "w3-co-1": { title } })));
      assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 5 people are waiting for week 3’s pathway and case.", title);
    }
    // A pathway and a case: some wait for both, one for the case alone.
    w.reset(packsSeed(weekThree({ "w3-co-1": { title: "Pathway" } })));
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 5 people are waiting for week 3’s pathway and case.");
    w.seedDraw("chloe", "w3", { pack: W3.markets });
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 5 people are waiting for week 3’s pathway or case.");
    // Only the case left for everybody.
    for (const uid of GROUP_B) w.seedDraw(uid, "w3", { pack: W3.markets });
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 5 people are waiting for week 3’s case.");
  });

  test("a pathway each person picks: not picked is not counted, picked with no case is", async () => {
    w.reset(packsSeed(weekThree({ "w3-co-1": { title: "Pathway", givenBy: "fellow" } })));
    // Nobody has picked: nobody waits on the facilitator, so no line.
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), null);
    // Chloe and Kofi picked; neither has a case.
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    w.seedDraw("kofi", "w3", { pack: W3.markets });
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 2 people are waiting for week 3’s case.");
    // Kofi is given one.
    w.seedDraw("kofi", "w3", { pack: W3.markets, caseId: W3.crash });
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 1 person is waiting for week 3’s case.");
    // The card still pins (it counts the three who have not picked as not having theirs); the line counts who waits on the facilitator.
    assert.match((await w.groupPage("rahul")).text, /Not given yet/);
  });

  test("a hand-out session called off: the slips go out at the last session held before the week, and the line follows from its end", async () => {
    w.reset();
    everybodyInB(2);
    w.world.db.poke(`courseGroups/${B}`, { sessionChanges: { w02: { kind: "cancelled", reason: "Room closed", dateKey: "2026-11-10" } } });
    // Tue 10 Nov at noon: session 2 is called off, so week 3's slips went out at the end of session 1, on Tue 3 Nov.
    w.at("2026-11-10T12:00:00Z");
    assert.equal(lineFor((await overview("claudia")).model, "Group B"), "Group B: 5 people are waiting for week 3’s pack and case.");
    assert.ok((await w.drawPage("rahul", B, 3)).text.includes("Session 2 is called off, so week 3’s slips go out at the end of session 1."));
  });

  test("week 1 has no session before it: no line before its first session", async () => {
    w.reset(packsSeed({ [`courseRuns/${RUN.agi}/weeks/w01`]: blockWeekDoc(1, "Who keeps the lamps", weekBlocksFor("w1")) }));
    // Mon 2 Nov at noon: Group A has met (Thu 29 Oct); Group B meets first on Tue 3 Nov.
    w.at("2026-11-02T12:00:00Z");
    const { model } = await overview("claudia");
    assert.ok(model.week, "the Overview is past Get ready for week 1");
    assert.equal(lineFor(model, "Group B"), null);
  });

  test("two groups at once, in the order every tab lists its groups, after the registers' lines and before the leavers'", async () => {
    w.reset();
    const { model } = await overview("claudia");
    assert.deepEqual(slipsOf(model).map((item) => [item.title, item.href]), [
      ["Group B: 5 people are waiting for week 3’s pack and case.", hrefTo(B, 3)],
      ["Group C: 2 people are waiting for week 3’s pack and case.", hrefTo(C, 3)],
    ]);
    // The slips lines sit together, straight after the last register line and before the first leaver.
    const kinds = model.attention.map((item) => item.kind);
    const first = kinds.indexOf("slips");
    assert.deepEqual(kinds.slice(first, first + 2), ["slips", "slips"]);
    assert.equal(kinds[first - 1], "register");
    assert.equal(kinds[first + 2], "left");
    assert.equal(kinds.lastIndexOf("register"), first - 1);
  });
});

// ---------------------------------------------------------------------------
// 2. The reads
// ---------------------------------------------------------------------------

describe("2. what the line reads", () => {
  /**
   * The draw's reads: each a `getAll` of the week's draw blocks alone (week 3's
   * pack and case study), one per group. The Overview's own read of the week's
   * work is a `getAll` too, of every block a person keeps a record in, so it
   * holds the week's other Choose one and talk as well and is told apart by them.
   */
  const DRAW_BLOCK = new RegExp(`__(?:${W3.given}|${W3.caseStudy})$`);
  const draws = (log) => log.filter((entry) => Array.isArray(entry) && entry.length > 0 && entry.every((path) => path.startsWith("coursePacksAndCases/") && DRAW_BLOCK.test(path)));
  const queries = (log) => log.filter((entry) => typeof entry === "string" && entry.startsWith("query "));
  const runWeekQueries = (log) => queries(log).filter((entry) => entry === `query courseRuns/${RUN.agi}/weeks`).length;
  const weekQueries = (log, groupId) => queries(log).filter((entry) => entry === `query courseGroups/${groupId}/weeks`).length;

  test("in a hand-out week: the course's weeks for each group between sessions, and the draw only for the groups past a hand-out session", async () => {
    w.reset();
    const { log } = await overview("claudia");
    // Groups B and C are past the session that hands week 3's slips out: one read each of their people's draw, by id.
    const people = draws(log).map((batch) => [...new Set(batch.map((path) => path.split("__").at(-2)))].sort());
    assert.deepEqual(people, [["chloe", "farah", "kofi", "rahul", "sofia"], ["hamza", "tom"]]);
    // The run's weeks once for the four groups, and each group's own copies once (all four are between sessions).
    assert.equal(runWeekQueries(log), 1);
    for (const groupId of [A, B, C, D]) assert.equal(weekQueries(log, groupId), 1, groupId);
    assert.equal(queries(log).length, 5);
  });

  test("in any other week: the course's weeks for each group between sessions and no slip; nothing at all for a group in its session", async () => {
    w.reset();
    // Thu 19 Nov at 7pm: Group A is in its week 4 session; B, C and D have met in week 3, and week 4 gives nothing out.
    w.at("2026-11-19T19:00:00Z");
    const { log, model } = await overview("zach");
    assert.deepEqual(draws(log), []);
    assert.deepEqual(slipsOf(model), []);
    assert.ok(model.sessions.some((session) => session.groupId === A && session.state === "today"));
    assert.equal(weekQueries(log, A), 0);
    assert.equal(runWeekQueries(log), 1);
    for (const groupId of [B, C, D]) assert.equal(weekQueries(log, groupId), 1, groupId);
    assert.equal(queries(log).length, 4);
  });

  test("a read that fails for one group draws no line for it, logs, and leaves the other's line and the page whole", async () => {
    w.reset();
    const errors = mock.method(console, "error", () => {});
    try {
      const { model, html } = await overview("claudia", { fail: `courseGroups/${B}/weeks` });
      assert.deepEqual(slipsOf(model).map((item) => item.title), ["Group C: 2 people are waiting for week 3’s pack and case."]);
      assert.match(html, /Needs attention/);
      assert.ok(errors.mock.calls.some((call) => String(call.arguments[0]).includes("[overview] the slips not copied in could not be read") && call.arguments[1] === B));
    } finally {
      errors.mock.restore();
    }
  });

  test("a group's own copy of a week is read over the run's weeks read once, and can give out what the run's week does not", async () => {
    const { resolveWeekDocs } = await w.loadTs(join("lib", "courses", "groupResolve.ts"));
    const legacy = (n) => ({ weekNumber: n, title: `Week ${n} readings`, summary: "", published: true });
    // The run's weeks give nothing out; Group B's own copy of week 3 gives out a pack and a case.
    w.reset(
      packsSeed({
        [`courseRuns/${RUN.agi}/weeks/w02`]: legacy(2),
        [`courseRuns/${RUN.agi}/weeks/w03`]: legacy(3),
        [`courseGroups/${B}/weeks/w03`]: { ...blockWeekDoc(3, "How sure are you, again?", weekBlocksFor("w3")), forkedByUid: "claudia" },
      }),
    );
    // Handed the run's weeks, the resolver answers as it does reading them itself, and queries only the group's copies.
    const runWeeks = await resolveWeekDocs(w.world.db, RUN.agi, null);
    const { result, log } = await watched(() => resolveWeekDocs(w.world.db, RUN.agi, B, { runWeeks }));
    assert.deepEqual(result, await resolveWeekDocs(w.world.db, RUN.agi, B));
    assert.deepEqual(log.filter((entry) => typeof entry === "string" && entry.startsWith("query ")), [`query courseGroups/${B}/weeks`]);
    const drawn = await overview("claudia");
    assert.deepEqual(slipsOf(drawn.model).map((item) => item.title), ["Group B: 5 people are waiting for week 3’s pack and case."]);
  });

  test("in a hand-out week, only the weeks past their hand-out session have their draw read", async () => {
    // Weeks 2, 3 and 4 give something out. At noon on Tue 17 Nov Group B's rule reads weeks 3 and 4; only week 3's
    // hand-out session (Tue 10 Nov) is over, so week 4's draw is not read for Group B. Group A met in week 3 on
    // Thu 12 Nov, so its week 4 is past its hand-out session, and is read.
    w.reset(packsSeed({ [`courseRuns/${RUN.agi}/weeks/w04`]: blockWeekDoc(4, "Who decides, again?", weekBlocksFor("w4")) }));
    const { log, model } = await overview("claudia");
    const batches = log.filter((entry) => Array.isArray(entry) && entry.length > 0 && entry.every((path) => path.startsWith("coursePacksAndCases/")));
    const ofB = batches.filter((batch) => batch.some((path) => path.includes("__chloe__")) && batch.every((path) => DRAW_BLOCK.test(path) || /__w4-(?:co-1|cs-1)$/.test(path)));
    assert.equal(ofB.length, 1);
    assert.ok(ofB[0].every((path) => DRAW_BLOCK.test(path)), "week 4's draw was read for Group B");
    assert.ok(batches.some((batch) => batch.every((path) => /__(?:amara|dev|bea|tariq|sofia)__w4-(?:co-1|cs-1)$/.test(path))));
    assert.equal(lineFor(model, "Group A"), "Group A: 5 people are waiting for week 4’s pack and case.");
    assert.equal(lineFor(model, "Group B"), "Group B: 5 people are waiting for week 3’s pack and case.");
  });

  test("a course that gives nothing out reads the run's weeks once and each group's copies, no slip, and Needs attention is exactly as it is with the slips read answering nothing", async () => {
    // Weeks written before blocks: nothing is given out.
    const legacy = (n) => ({ weekNumber: n, title: `Week ${n} readings`, summary: "", published: true });
    const errors = mock.method(console, "error", () => {});
    try {
      for (const [seed, then] of [
        [packsSeed({ [`courseRuns/${RUN.agi}/weeks/w01`]: legacy(1), [`courseRuns/${RUN.agi}/weeks/w02`]: legacy(2), [`courseRuns/${RUN.agi}/weeks/w03`]: legacy(3) }), () => {}],
        // A week where everybody in Group B and Group C has week 3's.
        [packsSeed(), () => {
          everybodyInB(3);
          for (const uid of ["hamza", "tom", "una"]) w.seedDraw(uid, "w3", { pack: W3.markets, caseId: W3.crash });
        }],
      ]) {
        for (const who of ["claudia", "zach"]) {
          w.reset(seed);
          then();
          const drawn = await overview(who);
          assert.deepEqual(slipsOf(drawn.model), []);
          assert.equal(runWeekQueries(drawn.log), 1);
          // The same page with the slips read answering nothing: its one shared read refused, so no group has a line.
          const nothing = await overview(who, { fail: `courseRuns/${RUN.agi}/weeks` });
          assert.deepEqual(drawn.model.attention, nothing.model.attention, who);
          assert.equal(drawn.html, nothing.html, who);
        }
      }
      const legacyRun = await (async () => {
        w.reset(packsSeed({ [`courseRuns/${RUN.agi}/weeks/w01`]: legacy(1), [`courseRuns/${RUN.agi}/weeks/w02`]: legacy(2), [`courseRuns/${RUN.agi}/weeks/w03`]: legacy(3) }));
        return overview("zach");
      })();
      assert.deepEqual(draws(legacyRun.log), []);
      assert.equal(queries(legacyRun.log).length, 5);
    } finally {
      errors.mock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Who
// ---------------------------------------------------------------------------

describe("3. for the lead and admins, counting whom the card counts for each", () => {
  test("the lead and an admin; an admin also counts somebody placed and not told, as the card does", async () => {
    w.reset();
    assert.equal(lineFor((await overview("claudia")).model, "Group C"), "Group C: 2 people are waiting for week 3’s pack and case.");
    assert.equal(lineFor((await overview("zach")).model, "Group C"), "Group C: 3 people are waiting for week 3’s pack and case.");
    // The facilitators of Group B count like anybody else, and nobody is named.
    const { model } = await overview("zach");
    const b = lineFor(model, "Group B");
    assert.equal(b, "Group B: 5 people are waiting for week 3’s pack and case.");
    for (const name of ["Chloe", "Farah", "Kofi", "Rahul", "Sofia"]) assert.ok(!b.includes(name));
  });

  test("everybody else is refused as before, and nothing of the draw is read", async () => {
    w.reset();
    const reviewer = await overview("lloyd");
    assert.match(reviewer.text, /Only the programme’s lead and admins can open Overview/);
    assert.deepEqual(reviewer.log, ["admissionRounds"]);
    const other = await overview("tess");
    assert.match(other.text, /There is no programme here/);
    for (const who of ["yusuf", "rahul", "chloe", "una", null]) {
      const drawn = await overview(who);
      assert.equal(drawn.to, "/dashboard", String(who));
      assert.deepEqual(drawn.log, [], String(who));
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The words
// ---------------------------------------------------------------------------

describe("4. every sentence, word for word", () => {
  const pack = (word) => ({ kind: "pack", id: `co-${word}`, word });
  const kase = { kind: "case", id: "cs-1" };
  const said = (people, things, every, weekNumber = 3, group = "Group C") =>
    line.slipsWaitingWords(group, { weekNumber, people, things, every });

  test("the owner's sentence, and the same sentence for one person and for the week's own words", () => {
    assert.equal(said([[kase], [kase]], ["case"], true), "Group C: 2 people are waiting for week 3’s case.");
    assert.equal(said([[kase]], ["case"], true), "Group C: 1 person is waiting for week 3’s case.");
    assert.equal(said([[pack("pathway")]], ["pathway"], true, 5, "Group A"), "Group A: 1 person is waiting for week 5’s pathway.");
    assert.equal(said([[pack("plan")], [pack("plan")], [pack("plan")]], ["plan"], true, 5), "Group C: 3 people are waiting for week 5’s plan.");
    assert.equal(said([[pack("pathway"), kase], [pack("pathway"), kase]], ["pathway", "case"], true), "Group C: 2 people are waiting for week 3’s pathway and case.");
    assert.equal(said([[pack("pathway"), kase], [kase]], ["pathway", "case"], false), "Group C: 2 people are waiting for week 3’s pathway or case.");
    assert.deepEqual(line.slipsWaitingLink("grp 1", { weekNumber: 3, people: [], things: [], every: true }), {
      href: "/learn/draw/grp%201?week=3",
      label: "Copy in the slips",
    });
  });
});
