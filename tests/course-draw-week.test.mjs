/**
 * WHICH WEEK THE SLIPS BEING HANDED OUT ARE FOR, and what the draw does about
 * a week that has met:
 *
 *  1. THE RULE (`src/lib/courses/packsAndCases/drawWeek.ts`) over built
 *     worlds, through the one session resolver with each group's own
 *     calendar: a session about to start, in progress and just over; a moved
 *     session; a pushed-back plan; a break week; two sessions a week; a
 *     hand-out session called off; week 1; after the last session; a course
 *     that gives nothing out; everybody already has theirs; the bound of two.
 *  2. THE GUARD: the draw's page, its route and the group page's card ask
 *     the one rule and work no week out for themselves, held in the source
 *     and by driving the three over one world at a run of clock times. So do
 *     the register's row, Home, the guide's card and the programme Overview's
 *     line about slips not copied in (driven in
 *     `tests/course-overview-slips-waiting.test.mjs`).
 *  3. THE ROUTE AND THE PAGE: read only once the programme has closed; a yes
 *     for a save into the week people are working on now or a week that has
 *     met, and none for a week to come; `?week=` for any week; the Week
 *     picker's list; and every sentence word for word.
 *
 * Parts 2 and 3 run in `tests/lib/packsAndCasesWorld.mjs` (AGI Strategy,
 * Group B meeting on Tuesdays at 6pm, the clock at noon on Tue 17 Nov 2026),
 * with week 4 written as blocks too, so weeks 2, 3 and 4 give something out.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { B, NOW, RUN, W3, blockWeekDoc, idsOf, makePacksAndCasesWorld, packsSeed, weekBlocksFor } from "./lib/packsAndCasesWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

const w = await makePacksAndCasesWorld("__drawWeek");
const { drawWeekRule, DRAW_WEEKS_READ } = await w.loadTs(join("lib", "courses", "packsAndCases", "drawWeek.ts"));
const { resolveSessions } = await w.loadTs(join("lib", "courses", "sessions.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const words = w.lib.words;

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

/** Six taught weeks from Mon 2 Nov 2026; a group on Wednesdays, 3pm to 5pm (London is on GMT all month). */
const SIX = [1, 2, 3, 4, 5, 6].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` }));

function sessionsOf({ plan = SIX, group = {}, extra = null } = {}) {
  const run = normalizeCourseRun("run-1", { startDate: "2026-11-02", weekPlan: plan });
  const normal = normalizeCourseGroup("grp-1", {
    runId: "run-1",
    name: "Group C",
    session: { weekday: 3, startTimeLocal: "15:00", durationMinutes: 120, location: "Portland A21" },
    ...group,
  });
  return resolveSessions(run, extra ? { ...normal, extraSession: extra } : normal);
}

const at = (iso) => new Date(iso);
const GIVING = [2, 3, 4, 5];

function rule(sessions, now, everybodyHas = undefined, givingWeeks = GIVING) {
  return drawWeekRule({ sessions, givingWeeks, now: at(now), everybodyHas });
}

describe("1. which week the slips are for", () => {
  test("a session about to start, in progress and just over: from its start, the week its slips are for", () => {
    const sessions = sessionsOf();
    // Before session 2: week 2 is still to come, and somebody has not got theirs.
    let answer = rule(sessions, "2026-11-11T14:59:00Z");
    assert.deepEqual([answer.weekNumber, answer.ahead, answer.toRead], [2, true, [2, 3]]);
    assert.equal(answer.facts.get(2).standing, "ahead");
    // ... unless everybody has, when it is week 3, set before the session that hands them out.
    answer = rule(sessions, "2026-11-11T14:59:00Z", new Map([[2, true]]));
    assert.equal(answer.weekNumber, 3);
    assert.equal(answer.facts.get(3).handOutNight, false);
    // From the first second of session 2: week 3, never session 2's own week, and it is the hand-out night.
    for (const now of ["2026-11-11T15:00:00Z", "2026-11-11T16:30:00Z", "2026-11-11T17:00:00Z"]) {
      answer = rule(sessions, now);
      assert.equal(answer.weekNumber, 3, now);
      assert.equal(answer.facts.get(2).standing, "now", now);
      assert.equal(answer.facts.get(3).handOutNight, true, now);
      assert.equal(answer.facts.get(3).handOut.session.weekNumber, 2, now);
    }
    // Just over: week 2 has met; still the hand-out night until midnight, and not the next morning.
    answer = rule(sessions, "2026-11-11T17:00:01Z");
    assert.deepEqual([answer.weekNumber, answer.facts.get(2).standing, answer.facts.get(3).handOutNight], [3, "met", true]);
    answer = rule(sessions, "2026-11-12T09:00:00Z");
    assert.deepEqual([answer.weekNumber, answer.facts.get(3).handOutNight], [3, false]);
  });

  test("a moved session: the week starts, and its slips go out, when it meets that week", () => {
    // Session 2 moved to Tue 10 Nov at 6pm: week 3's slips go out then.
    let sessions = sessionsOf({ group: { sessionOverrides: { w02: { weekday: 2, startTimeLocal: "18:00" } } } });
    let answer = rule(sessions, "2026-11-10T18:30:00Z");
    assert.equal(answer.weekNumber, 3);
    assert.equal(answer.facts.get(3).handOutNight, true);
    assert.equal(answer.facts.get(3).handOut.startsAt.toISOString(), "2026-11-10T18:00:00.000Z");
    // On the Wednesday it would have met, it has already met.
    assert.equal(rule(sessions, "2026-11-11T15:30:00Z").facts.get(2).standing, "met");
    // Session 3 moved to Thu 19 Nov at 10am: on Wednesday afternoon week 3 is still to come.
    sessions = sessionsOf({ group: { sessionOverrides: { w03: { weekday: 4, startTimeLocal: "10:00" } } } });
    answer = rule(sessions, "2026-11-18T15:30:00Z");
    assert.deepEqual([answer.weekNumber, answer.facts.get(3).standing], [3, "ahead"]);
    answer = rule(sessions, "2026-11-19T10:30:00Z");
    assert.deepEqual([answer.weekNumber, answer.facts.get(4).handOutNight, answer.facts.get(4).handOut.session.weekNumber], [4, true, 3]);
  });

  test("a pushed-back plan and a break week: the week after the break is handed out at the session before the break", () => {
    const withBreak = [...SIX.slice(0, 2), { kind: "break", label: "Reading week" }, ...SIX.slice(2)];
    for (const sessions of [sessionsOf({ group: { paceWeekPlan: withBreak } }), sessionsOf({ plan: withBreak })]) {
      // In the break week (Wed 18 Nov), week 3 is still to come: it meets Wed 25 Nov.
      const answer = rule(sessions, "2026-11-18T15:30:00Z");
      assert.equal(answer.weekNumber, 3);
      assert.equal(answer.facts.get(3).startsAt.toISOString(), "2026-11-25T15:00:00.000Z");
      assert.equal(answer.facts.get(3).handOut.session.weekNumber, 2);
      assert.equal(answer.facts.get(3).calledOff, null);
    }
  });

  test("two sessions a week: the slips go out at the last one before the week, and the week is on until its last session ends", () => {
    const sessions = sessionsOf({ extra: { weekday: 5, startTimeLocal: "12:00", durationMinutes: 60, location: "", meetingUrl: null, notes: "" } });
    // Wednesday's session of week 2 has started: week 3, whose slips go out at Friday's.
    let answer = rule(sessions, "2026-11-11T16:00:00Z");
    assert.equal(answer.weekNumber, 3);
    assert.deepEqual([answer.facts.get(3).handOut.session.occurrence, answer.facts.get(3).handOutNight], [2, false]);
    assert.equal(rule(sessions, "2026-11-12T09:00:00Z").facts.get(2).standing, "now");
    answer = rule(sessions, "2026-11-13T12:30:00Z");
    assert.deepEqual([answer.weekNumber, answer.facts.get(3).handOutNight], [3, true]);
    assert.equal(rule(sessions, "2026-11-13T13:00:01Z").facts.get(2).standing, "met");
  });

  test("a hand-out session called off: the slips go out at the last session held before the week, and the facts say which is off", () => {
    const sessions = sessionsOf({ group: { sessionChanges: { w04: { kind: "cancelled", reason: "Strike", dateKey: "2026-11-25" } } } });
    const answer = rule(sessions, "2026-11-18T15:30:00Z", new Map([[4, true]]));
    assert.equal(answer.weekNumber, 5);
    const five = answer.facts.get(5);
    assert.deepEqual([five.handOut.session.weekNumber, five.calledOff.weekNumber, five.handOutNight], [3, 4, true]);
    // The evening called off is when week 4 was due to begin: from then it is no week still to come.
    assert.equal(rule(sessions, "2026-11-25T15:30:00Z").weekNumber, 5);
    assert.equal(rule(sessions, "2026-11-25T15:30:00Z").facts.get(4).startsCalledOff, true);
    assert.equal(words.handOutCalledOffWords(5, 4, 3), "Session 4 is called off, so week 5’s slips go out at the end of session 3.");
  });

  test("week 1 has no session before it: no hand-out session, set before the first session", () => {
    const answer = rule(sessionsOf(), "2026-11-01T12:00:00Z", undefined, [1, 3]);
    assert.equal(answer.weekNumber, 1);
    assert.deepEqual([answer.facts.get(1).handOut, answer.facts.get(1).calledOff, answer.facts.get(1).handOutNight], [null, null, false]);
    assert.equal(answer.facts.get(3).handOut.session.weekNumber, 2);
  });

  test("after the last session: the last week that gave something out, no longer to come", () => {
    const answer = rule(sessionsOf(), "2026-12-10T12:00:00Z");
    assert.deepEqual([answer.weekNumber, answer.ahead, answer.toRead], [5, false, []]);
    assert.ok(GIVING.every((n) => answer.facts.get(n).standing === "met"));
  });

  test("a course that gives nothing out has no answer", () => {
    const answer = rule(sessionsOf(), "2026-11-11T16:00:00Z", undefined, []);
    assert.deepEqual([answer.weekNumber, answer.ahead, answer.toRead, answer.facts.size], [null, false, [], 0]);
  });

  test("everybody already has theirs: the first week still to come, and never further than the next two that give something out", () => {
    const sessions = sessionsOf();
    assert.equal(DRAW_WEEKS_READ, 2);
    let answer = rule(sessions, "2026-11-11T16:00:00Z", new Map([[3, true], [4, true]]));
    assert.deepEqual([answer.weekNumber, answer.ahead, answer.toRead], [3, true, [3, 4]]);
    // Week 5 is missing slips, but it is the third week to come: not read, never the answer.
    answer = rule(sessions, "2026-11-11T16:00:00Z", new Map([[3, true], [4, true], [5, false]]));
    assert.equal(answer.weekNumber, 3);
    answer = rule(sessions, "2026-11-11T16:00:00Z", new Map([[3, true], [4, false]]));
    assert.equal(answer.weekNumber, 4);
  });

  test("a group with no time set: nothing can be dated, so every week is still to come", () => {
    const sessions = sessionsOf({ group: { session: { weekday: -1, startTimeLocal: "", durationMinutes: 0 } } });
    const answer = rule(sessions, "2026-11-11T16:00:00Z");
    assert.deepEqual([answer.weekNumber, answer.facts.get(2).standing, answer.facts.get(2).startsAt, answer.facts.get(2).handOut], [2, "ahead", null, null]);
  });
});

// ---------------------------------------------------------------------------
// 2. The guard: one rule, asked by the page, the route and the card
// ---------------------------------------------------------------------------

/** The world with week 4 written as blocks too: weeks 2, 3 and 4 give something out. */
function weekFourSeed(over = {}) {
  return packsSeed({ [`courseRuns/${RUN.agi}/weeks/w04`]: blockWeekDoc(4, "Who decides, again?", weekBlocksFor("w4")), ...over });
}
const W4 = idsOf("w4");

/** The week a draw page opened without `?week=` is about: its picker's chosen option. */
function pageWeek(page) {
  const picker = /<select[^>]*>(.*?)<\/select>/.exec(page.html);
  const chosen = picker && /<option value="(\d+)" selected="">/.exec(picker[1]);
  return chosen ? Number(chosen[1]) : null;
}

/** The week the group page's card opens the draw on, or null with no card. */
function cardWeek(group) {
  const link = new RegExp(`href="/learn/draw/${B}\\?week=(\\d+)"`).exec(group.html);
  return link ? Number(link[1]) : null;
}

describe("2. one rule, asked by the draw page, its route and the group page's card", () => {
  test("the rule is written once, and each of the three asks it and works no week out for itself", () => {
    const rulesWritten = [];
    for (const file of walkSource(SRC)) {
      if (/function drawWeekRule\b|const drawWeekRule\b/.test(readFileSync(file, "utf8"))) rulesWritten.push(file.slice(SRC.length + 1));
    }
    assert.deepEqual(rulesWritten, [join("lib", "courses", "packsAndCases", "drawWeek.ts")]);

    const readers = read("lib", "courses", "packsAndCases", "readers.ts");
    assert.match(readers, /const first = drawWeekRule\(\{ sessions, givingWeeks, now \}\);/);
    assert.match(readers, /const rule = drawWeekRule\(\{ sessions, givingWeeks, now, everybodyHas \}\);/);
    assert.match(readers, /const sessions = resolveSessions\(run, group, resolveGroupCalendar\(run, group, now\)\.calendar\);/);

    const page = read("app", "(app)", "learn", "draw", "[groupId]", "page.tsx");
    assert.match(page, /const course = await readDrawWeeks\(db, \{ run, group, people, now \}\);/);
    assert.match(page, /: \(course\.rule\.weekNumber \?\? course\.fallbackWeek\);/);
    for (const own of [/sessionRange\(/, /resolveSessions\(/, /\.next\?\.weekNumber/, /readGroupWeek\(/, /from "@\/lib\/courses\/sessions"/]) {
      assert.doesNotMatch(page, own, `the draw page works a week out for itself: ${own}`);
    }

    const route = read("app", "api", "courses", "groups", "[groupId]", "draw", "route.ts");
    assert.match(route, /const facts = drawWeekRule\(\{ sessions, givingWeeks: \[weekNumber\], now \}\)\.facts\.get\(weekNumber\);/);
    assert.match(route, /const sessions = resolveSessions\(run, group, resolveGroupCalendar\(run, group, now\)\.calendar\);/);
    assert.doesNotMatch(route, /sessionRange\(|sessionInstants\(/, "the route works a session's time out for itself");

    const group = read("app", "(app)", "learn", "[runId]", "group", "[groupId]", "page.tsx");
    assert.match(group, /const course = group\.archived \? null : await readDrawWeeks\(db, \{ run: access\.run, group, people: drawList, now \}\);/);
    assert.match(group, /drawCardModel\(\{ course, people: drawList, viewer: \{ uid: access\.user\.uid, isAdmin: access\.isAdmin, lead: false \}, now \}\)/);
    assert.doesNotMatch(group, /readGroupWeek\(|readDrawState\(|spreadOf\(|drawWeekRule\(/, "the group page reads a draw of its own choosing");

    // The card's model, and every other reader of the slips' week: each asks
    // the rule through what `readDrawWeeks` read, and none works a session's
    // time out for itself.
    const model = read("lib", "courses", "drawCard", "model.ts");
    assert.match(model, /const \{ rule \} = course;/);
    assert.match(model, /const n = rule\.weekNumber;/);
    assert.match(model, /const facts = rule\.facts\.get\(n\);/);
    const reads = read("lib", "courses", "drawCard", "reads.ts");
    assert.match(reads, /const dates = await readDrawWeeks\(db, \{ run, group, people: \[\], now \}\);/);
    assert.match(reads, /return slipsTonightOf\(\{ course: withDraws\(dates, states, people, now\), people, now \}\);/);
    assert.match(reads, /const sessions = resolveSessions\(run, group, resolveGroupCalendar\(run, group, now\)\.calendar\);/);
    assert.match(reads, /const after = weekAfter\(sessions, pageWeek\);/);
    // The week queries are made once: `readDrawWeeks` once in the slips' reads.
    assert.equal([...reads.matchAll(/readDrawWeeks\(/g)].length, 1, "the slips' reads ask for the course's weeks twice");

    // No caller works a week, a session's time or "tonight" out by hand. The
    // card's model keeps the two such things it needs in two named helpers
    // beside the rule (`handOutStarted`, `weekAfter`), each written once and
    // left out of the scan; everything else asks the rule's facts.
    const uncommented = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const helper = (name) => new RegExp(`export function ${name}\\([^)]*\\)[^{]*\\{[\\s\\S]*?\\n\\}\\n`);
    for (const name of ["handOutStarted", "weekAfter"]) {
      assert.equal([...model.matchAll(new RegExp(`export function ${name}\\(`, "g"))].length, 1, `the card's model no longer has one ${name}`);
    }
    const BY_HAND = [
      [/sessionInstants\(/, "a session's time from the resolver"],
      [/sessionRange\(/, "the next session"],
      [/\b\w*[wW]eek\w*\s*[+-]\s*\d\b|\bn\s*[+-]\s*\d\b|\)\s*[+-]\s*\d\b/, "a week by arithmetic"],
      [/londonDateKey\(\s*now\s*\)\s*[!=]==|[!=]==\s*londonDateKey\(\s*now\s*\)/, "tonight, by the day's date"],
      [/\.getTime\(\)\s*[<>]=?[^;\n]*startsAt|startsAt[^;\n]*\.getTime\(\)\s*[<>]=?/, "a session's start, by its instant"],
    ];
    const summary = read("app", "api", "courses", "groups", "[groupId]", "summary", "route.ts");
    for (const [file, code] of [
      ["the card's model", uncommented(model).replace(helper("handOutStarted"), "").replace(helper("weekAfter"), "")],
      ["the slips' reads", uncommented(reads)],
      ["the pairs card's week", uncommented(read("lib", "courses", "pairs", "cardWeek.ts"))],
      ["the card", uncommented(read("features", "courses", "groupPage", "DrawCard.tsx"))],
      ["the register page", uncommented(read("app", "(app)", "learn", "[runId]", "group", "[groupId]", "register", "page.tsx"))],
      ["the register's row", uncommented(read("features", "courses", "register", "HandOutRowLoader.tsx"))],
      // The summary's one `sessionRange` is the explainer's next session, held below and left out here.
      ["the group summary route", uncommented(summary).replace("const next = sessionRange(resolveSessions(run, group, resolveGroupCalendar(run, group, now).calendar), now).next;", "")],
      ["the guide's week page", uncommented(read("app", "(app)", "learn", "facilitator-guide", "[courseId]", "[doc]", "page.tsx"))],
      ["Home", uncommented(read("app", "(app)", "dashboard", "HomeFacilitator.tsx"))],
      ["the Overview's line", uncommented(read("lib", "courses", "drawCard", "overviewLine.ts"))],
      ["the Overview's reads", uncommented(read("lib", "courses", "drawCard", "overviewReads.ts"))],
    ]) {
      for (const [shape, what] of BY_HAND) assert.doesNotMatch(code, shape, `${file} works out ${what} for itself`);
    }
    assert.match(summary, /const next = sessionRange\(resolveSessions\(run, group, resolveGroupCalendar\(run, group, now\)\.calendar\), now\)\.next;\s*const \[line, writtenQueue, explainer, slips\]/);
    // The scan sees what it claims to: each shape is caught where it is written.
    for (const [shape, sample] of [
      [BY_HAND[2][0], "readGroupWeek(db, runId, groupId, pageWeek + 1)"],
      [BY_HAND[2][0], "const later = n + 1;"],
      [BY_HAND[2][0], "(range.next?.weekNumber ?? 0) + 1"],
      [BY_HAND[3][0], "londonDateKey(now) === session.dateKey"],
      [BY_HAND[4][0], "now.getTime() >= facts.handOut.startsAt.getTime()"],
    ]) {
      assert.match(sample, shape, sample);
    }
    assert.match(read("app", "(app)", "learn", "[runId]", "group", "[groupId]", "register", "page.tsx"), /readHandOutDates\(db, \{ run: access\.run, group: gated\.group, now \}\)/);
    assert.match(read("features", "courses", "register", "HandOutRowLoader.tsx"), /const slips = await slipsTonightFrom\(db, \{ runId, dates, people: roster\.people, now \}\);/);
    assert.match(summary, /\? readSlipsTonight\(db, \{ run, group, now, people: async \(\) => drawPeople\(model\.people, model\.facilitators\) \}\)/);
    assert.match(read("app", "(app)", "learn", "facilitator-guide", "[courseId]", "[doc]", "page.tsx"), /readGuideSlips\(db, \{ groups, pageWeek: page\.weekNumber, now \}\)/);
    // The Overview's line: the course's weeks through `readDrawWeeks` once, the card's people from the records it
    // read (the same reader `readDrawRoster` answers through), the rule asked again with the draw (`withDraws`),
    // and the week, the session's end and who waits each asked of what answers them.
    const overviewReads = read("lib", "courses", "drawCard", "overviewReads.ts");
    assert.match(overviewReads, /const sessions = resolveSessions\(run, group, resolveGroupCalendar\(run, group, now\)\.calendar\);/);
    assert.match(overviewReads, /const dates = await readDrawWeeks\(db, \{ run, group, people: \[\], now \}\);/);
    assert.equal([...overviewReads.matchAll(/readDrawWeeks\(/g)].length, 1, "the Overview's reads ask for the course's weeks twice");
    assert.match(overviewReads, /const \{ people \} = drawRosterOf\(records, group, viewer, now\);/);
    assert.match(overviewReads, /slipsWaitingOf\(\{ weeks: withDraws\(dates, states, people, now\), people, now \}\)/);
    assert.match(readers, /if \(!records\) return null;\s*return drawRosterOf\(records, group, viewer, now\);/);
    const overviewLine = read("lib", "courses", "drawCard", "overviewLine.ts");
    assert.match(overviewLine, /const \{ rule \} = weeks;\s*const n = rule\.weekNumber;/);
    assert.match(overviewLine, /const facts = rule\.facts\.get\(n\);/);
    assert.match(overviewLine, /const handOut = handOutOf\(sessions, facts\.weekNumber, now\);/);
    assert.match(overviewLine, /return waitingOf\(week\.blocks, \{/);
    assert.doesNotMatch(overviewLine, /everybodyHasTheirs\(|readDrawState\(|readGroupWeek\(/, "the Overview's line decides who has theirs a second way");
    assert.doesNotMatch(read("lib", "courses", "programmeOverview.ts"), /drawWeekRule\(|readDrawWeeks\(|\/learn\/draw\//, "the Overview works the slips' week out for itself");

    // Every file that asks the rule, and why.
    const asking = [];
    for (const file of walkSource(SRC)) {
      if (/\bdrawWeekRule\(/.test(readFileSync(file, "utf8"))) asking.push(file.slice(SRC.length + 1));
    }
    assert.deepEqual(asking.sort(), [
      // The rule itself.
      join("lib", "courses", "packsAndCases", "drawWeek.ts"),
      // The pathways and cases page and the group page's card, through `readDrawWeeks`.
      join("lib", "courses", "packsAndCases", "readers.ts"),
      // The route's standing of the week saved into.
      join("app", "api", "courses", "groups", "[groupId]", "draw", "route.ts"),
      // The card's states: the next week to come, and the guide's card.
      join("lib", "courses", "drawCard", "model.ts"),
      // The pairs card: the next week in pairs still to come.
      join("lib", "courses", "pairs", "cardWeek.ts"),
      // A member's own week page: which session hands their week's slips out ("gives these out at the end of week 2's session").
      join("lib", "courses", "weekWork", "handOut.ts"),
      // The programme Overview's line: whether any week still to come is past its hand-out session, before anything is read.
      join("lib", "courses", "drawCard", "overviewLine.ts"),
    ].sort());

    // Nothing else in the tree links to the draw page on a week of its own
    // choosing: each link takes its week from the rule's answer.
    const linking = [];
    for (const file of walkSource(SRC)) {
      if (/\/learn\/draw\/[^"'`]*\?week=/.test(readFileSync(file, "utf8"))) linking.push(file.slice(SRC.length + 1));
    }
    assert.deepEqual(linking.sort(), [
      join("app", "(app)", "dashboard", "HomeFacilitator.tsx"),
      join("app", "(app)", "learn", "facilitator-guide", "[courseId]", "[doc]", "page.tsx"),
      join("features", "courses", "groupPage", "DrawCard.tsx"),
      join("features", "courses", "packsAndCases", "DrawWeekPicker.tsx"),
      join("features", "courses", "register", "HandOutRow.tsx"),
      join("lib", "courses", "drawCard", "overviewLine.ts"),
    ].sort());
    const card = read("features", "courses", "groupPage", "DrawCard.tsx");
    assert.deepEqual(
      [...card.matchAll(/weekHref\(([^)]*)\)/g)].map(([, arg]) => arg).sort(),
      // The rule's week (taken from the model, below) in each phase, and the week before it, when everybody has that one's.
      ["model.earlier.weekNumber", "weekNumber", "weekNumber", "weekNumber", "weekNumber"],
    );
    assert.match(card, /const \{ weekNumber, draw, facts, phase \} = model;/);
    assert.match(read("app", "(app)", "dashboard", "HomeFacilitator.tsx"), /\?week=\$\{known\.slips\.weekNumber\}/);
    assert.match(read("app", "(app)", "learn", "facilitator-guide", "[courseId]", "[doc]", "page.tsx"), /\?week=\$\{entry\.weekNumber\}/);
    assert.match(read("features", "courses", "register", "HandOutRowLoader.tsx"), /<HandOutRow groupId=\{group\.id\} weekNumber=\{slips\.weekNumber\} draw=\{slips\.draw\} \/>/);
    assert.match(read("lib", "courses", "drawCard", "overviewLine.ts"), /\?week=\$\{waiting\.weekNumber\}/);
  });

  test("over one world at a run of clock times, the page opens on the week the card names, and the route asks a yes exactly where the page warns", async () => {
    const table = [
      // [clock, the week, the card's week (null: no card), the week's standing]
      ["2026-11-17T12:00:00Z", 3, 3, "ahead"],
      ["2026-11-17T18:00:00Z", 4, 4, "ahead"],
      ["2026-11-17T20:01:00Z", 4, 4, "ahead"],
      ["2026-11-18T09:00:00Z", 4, 4, "ahead"],
      ["2026-11-24T18:30:00Z", 4, null, "now"],
      ["2026-12-10T12:00:00Z", 4, null, "met"],
    ];
    for (const [clock, week, card, standing] of table) {
      w.reset(weekFourSeed());
      w.at(clock);
      const page = await w.drawPage("rahul");
      assert.equal(pageWeek(page), week, `${clock}: the page`);
      assert.equal(cardWeek(await w.groupPage("rahul")), card, `${clock}: the card`);
      const warned = page.html.includes('class="drawWarn"');
      assert.equal(warned, standing !== "ahead", `${clock}: the warning`);
      const blockId = idsOf(`w${week}`).given;
      const answer = await w.saveDraw("rahul", `w0${week}`, [["kofi", blockId, idsOf(`w${week}`).markets]]);
      assert.equal(answer.status === 409 && answer.body.confirm === true, standing !== "ahead", `${clock}: the route`);
    }
  });

  test("everybody has week 3's: the page and the card move on to week 4, set before the session that hands its slips out", async () => {
    w.reset(weekFourSeed());
    for (const uid of ["chloe", "farah", "kofi", "rahul", "sofia"]) {
      const elections = uid !== "kofi";
      w.seedDraw(uid, "w3", { pack: elections ? W3.elections : W3.markets, caseId: elections ? W3.surprise : W3.crash });
    }
    const page = await w.drawPage("rahul");
    assert.equal(pageWeek(page), 4);
    assert.equal(cardWeek(await w.groupPage("rahul")), 4);
    assert.match(page.text, /Week 4’s slips go out at Tuesday’s session\. You can set them early and change them afterwards\./);
    assert.match(page.text, /Group B · after session 3/);
  });
});

// ---------------------------------------------------------------------------
// 3. The route and the page
// ---------------------------------------------------------------------------

describe("3. saving late, read only once closed, any week by its address, and the words", () => {
  beforeEach(() => w.reset(weekFourSeed()));

  const ONE = (week) => [["kofi", idsOf(`w${week}`).given, idsOf(`w${week}`).markets]];

  test("a week that has met needs a yes: refused without it, saved with it; a week to come needs none", async () => {
    // Week 2 met on Tue 10 Nov.
    let answer = await w.saveDraw("rahul", "w02", ONE(2));
    assert.deepEqual([answer.status, answer.body], [
      409,
      {
        error:
          "Week 2’s session was on Tue 10 Nov. This save needs a yes first. Changing a pack means that person’s week is done only once the new pack is ticked. Changing a case takes back that person’s Ready for my talk.",
        confirm: true,
        ask: [
          "Week 2’s session was on Tue 10 Nov.",
          "Changing a pack means that person’s week is done only once the new pack is ticked.",
          "Changing a case takes back that person’s Ready for my talk.",
        ],
      },
    ]);
    assert.deepEqual(w.records(), []);
    answer = await w.call("rahul", w.routes.draw.PUT, { groupId: B }, {
      course: true,
      body: { weekId: "w02", entries: ONE(2).map(([uid, blockId, value]) => ({ uid, blockId, value })), confirmed: true },
    });
    assert.deepEqual([answer.status, answer.body], [200, { ok: true, saved: 1 }]);
    // Only a strict true is a yes.
    answer = await w.call("rahul", w.routes.draw.PUT, { groupId: B }, {
      course: true,
      body: { weekId: "w02", entries: [{ uid: "chloe", blockId: idsOf("w2").given, value: idsOf("w2").markets }], confirmed: "yes" },
    });
    assert.equal(answer.status, 409);
    // Weeks 3 and 4 are to come at noon on the 17th.
    for (const week of [3, 4]) {
      answer = await w.saveDraw("rahul", `w0${week}`, ONE(week));
      assert.equal(answer.status, 200, `week ${week}`);
    }
  });

  test("the week people are working on now: from the start of its session, a yes", async () => {
    w.at("2026-11-17T18:30:00Z");
    let answer = await w.saveDraw("sofia", "w03", ONE(3));
    assert.deepEqual([answer.status, answer.body.confirm, answer.body.ask[0]], [409, true, "Week 3 is the week people are working on now. Its session has started."]);
    answer = await w.call("sofia", w.routes.draw.PUT, { groupId: B }, {
      course: true,
      body: { weekId: "w03", entries: ONE(3).map(([uid, blockId, value]) => ({ uid, blockId, value })), confirmed: true },
    });
    assert.equal(answer.status, 200);
    // A changed case still takes back the ready mark: the save writes what it always wrote.
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise, ready: true });
    answer = await w.call("sofia", w.routes.draw.PUT, { groupId: B }, {
      course: true,
      body: { weekId: "w03", entries: [{ uid: "chloe", blockId: W3.caseStudy, value: null }], confirmed: true },
    });
    assert.equal(answer.status, 200);
    assert.deepEqual([w.recordOf("chloe", W3.caseStudy).caseId, w.recordOf("chloe", W3.caseStudy).ready], [null, false]);
    // Week 4 is the week the slips are for: no yes.
    assert.equal((await w.saveDraw("sofia", "w04", ONE(4))).status, 200);
    // The page says so before any change, and Save asks first.
    const page = await w.drawPage("rahul", B, 3);
    assert.match(page.text, /Week 3 is the week people are working on now\. Its session has started\./);
    assert.match(page.html, /class="drawWarn"/);
    const week4 = await w.drawPage("rahul", B, 4);
    assert.doesNotMatch(week4.html, /class="drawWarn"/);
  });

  test("once the programme has closed the page is read only and the route refuses a save, in the members' sentence", async () => {
    // The run's last session is Wed 9 Dec; it closes at the end of Wed 23 Dec.
    w.at("2026-12-24T12:00:00Z");
    const closed = "The programme closed at the end of Wed 23 Dec, so this week can’t change now.";
    const answer = await w.call("rahul", w.routes.draw.PUT, { groupId: B }, {
      course: true,
      body: { weekId: "w04", entries: ONE(4).map(([uid, blockId, value]) => ({ uid, blockId, value })), confirmed: true },
    });
    assert.deepEqual([answer.status, answer.body], [409, { error: closed }]);
    assert.deepEqual(w.records(), []);
    const page = await w.drawPage("rahul");
    assert.equal(pageWeek(page), 4);
    assert.ok(page.text.includes("Group B’s sessions have finished. This is what was given out."));
    assert.ok(page.text.includes(closed));
    assert.doesNotMatch(page.html, />Save</);
    assert.doesNotMatch(page.html, /Swap two people/);
    // Every list is shown and none takes a press, the picker aside (held until the page is live).
    const lists = [...page.html.matchAll(/<select([^>]*)>/g)].slice(1);
    assert.ok(lists.length > 0 && lists.every(([, attrs]) => / disabled=""/.test(attrs)));
    // Before then, after the last session, it is still a week that has met: open, with a yes.
    w.at("2026-12-10T12:00:00Z");
    const open = await w.drawPage("rahul");
    assert.ok(open.text.includes("Group B’s sessions have finished. This is what was given out."));
    assert.ok(open.text.includes("Week 4’s session was on Tue 24 Nov."));
    assert.match(open.html, />Save</);
  });

  test("`?week=` opens any week, and the Week picker lists every week that gives something out, past ones too", async () => {
    w.at("2026-11-24T18:30:00Z");
    const list = (page) => [...(/<select[^>]*>(.*?)<\/select>/.exec(page.html)?.[1] ?? "").matchAll(/<option value="\d+"( selected="")?>([^<]*)<\/option>/g)].map(([, chosen, label]) => `${chosen ? "*" : ""}${label}`);
    const week2 = await w.drawPage("rahul", B, 2);
    assert.deepEqual(list(week2), ["*Week 2 · Packs and cases", "Week 3 · Packs and cases", "Week 4 · Packs and cases"]);
    assert.ok(week2.text.includes("Week 2’s session was on Tue 10 Nov."));
    assert.ok(week2.text.includes("Weeks 2 to 4 give something out. Weeks 1, 5 and 6 don’t."));
    assert.match(week2.text, /Group B · after session 1/);
    const week9 = await w.drawPage("rahul", B, 9);
    assert.deepEqual(list(week9), ["Week 2 · Packs and cases", "Week 3 · Packs and cases", "Week 4 · Packs and cases", "*Week 9"]);
    assert.ok(week9.text.includes("Nothing is given out in week 9."));
    assert.ok(week9.text.includes("Back to Group B"));
    // Week 1 has no session before it: the eyebrow names the group alone.
    const week1 = await w.drawPage("rahul", B, 1);
    assert.match(week1.html, /<p class="drawEyebrow">Group B<\/p>/);
  });

  test("a hand-out session called off: the page says which session the slips go out at", async () => {
    w.world.db.poke(`courseGroups/${B}`, { sessionChanges: { w03: { kind: "cancelled", reason: "Room closed", dateKey: "2026-11-17" } } });
    const page = await w.drawPage("rahul", B, 4);
    assert.ok(page.text.includes("Session 3 is called off, so week 4’s slips go out at the end of session 2."));
    assert.match(page.text, /Group B · after session 2/);
    // Once week 4 has met, the line is gone: the slips went out, and the page says when its session was.
    w.at("2026-11-25T12:00:00Z");
    const met = await w.drawPage("rahul", B, 4);
    assert.ok(!met.text.includes("is called off, so week 4"));
    assert.ok(met.text.includes("Week 4’s session was on Tue 24 Nov."));
    // The evening called off itself: the week people are working on now, its session called off, never "started".
    w.at("2026-11-17T18:30:00Z");
    const off = await w.drawPage("rahul", B, 3);
    assert.ok(off.text.includes("Week 3 is the week people are working on now. Its session on Tue 17 Nov is called off."), off.text);
    assert.ok(!off.text.includes("Its session has started."));
  });

  test("a page opened before the session, saved after it started: what Save then asks is the route's, which week it is first", async () => {
    // At 5:59pm week 3 is still to come: the page warns of nothing and Save would not ask.
    w.at("2026-11-17T17:59:00Z");
    const page = await w.drawPage("rahul", B, 3);
    assert.doesNotMatch(page.html, /class="drawWarn"/);
    // At 7:30pm the tab, left open, saves: refused, with the lines to ask.
    w.at("2026-11-17T19:30:00Z");
    const answer = await w.saveDraw("rahul", "w03", ONE(3));
    assert.equal(answer.status, 409);
    const asked = words.askAfterRefusal(answer.body);
    assert.deepEqual(asked, [
      "Week 3 is the week people are working on now. Its session has started.",
      "Changing a pack means that person’s week is done only once the new pack is ticked.",
      "Changing a case takes back that person’s Ready for my talk.",
    ]);
    assert.deepEqual(w.records(), []);
    // The editor asks exactly those, never lines of its own.
    const editor = read("features", "courses", "packsAndCases", "DrawEditor.tsx");
    assert.match(editor, /if \(res\.status === 409 && answer\?\.confirm === true\) \{\s*\/\/[^\n]*\n\s*setAsk\(\{ kind: "confirm", lines: askAfterRefusal\(answer\), then \}\);/);
    assert.match(editor, /\(ask\.kind === "leave" \? \[leavingUnsavedWords\(changedPeople\)\] : ask\.lines\)\.map/);
    assert.doesNotMatch(editor, /READY_TAKEN_BACK/, "the editor says a sentence of its own instead of the lines it is handed");
    // A refusal with no lines says the route's sentence, and with nothing at all the failed save's.
    assert.deepEqual(words.askAfterRefusal({ error: "Week 3 is the week people are working on now." }), ["Week 3 is the week people are working on now."]);
    assert.deepEqual(words.askAfterRefusal(null), [words.DRAW_NOT_SAVED]);
  });

  test("what a late save says it changes follows what the week gives out", async () => {
    const plan = { packs: [{ id: "co-plan", title: "Plan", packs: [] }], cases: [] };
    const blocks = (covered) => [
      { id: "tw", type: "thisWeek", rows: covered ? [{ type: "task", what: "", time: "", when: "before", whenText: "", covers: ["co-plan"] }] : [], total: "", note: [] },
      { id: "co-plan", type: "chooseOne", title: "Plan", givenBy: "facilitator", packs: [] },
    ];
    // A plan that counts towards the week, and no cases: the plan's sentence, not the case's.
    const counted = w.lib.model.countedPackTitlesOf(blocks(true), plan);
    assert.deepEqual(counted, ["Plan"]);
    assert.deepEqual(words.lateSaveChangesWords({ countedPackTitles: counted, givesCases: false }), [
      "Changing a plan means that person’s week is done only once the new plan is ticked.",
    ]);
    // A plan no task counts changes only what the person reads: nothing to say of it.
    assert.deepEqual(w.lib.model.countedPackTitlesOf(blocks(false), plan), []);
    // Cases alone: the owner's sentence alone. Both: both.
    assert.deepEqual(words.lateSaveChangesWords({ countedPackTitles: [], givesCases: true }), ["Changing a case takes back that person’s Ready for my talk."]);
    assert.deepEqual(words.lateSaveChangesWords({ countedPackTitles: ["Pathway"], givesCases: true }), [
      "Changing a pathway means that person’s week is done only once the new pathway is ticked.",
      "Changing a case takes back that person’s Ready for my talk.",
    ]);
  });

  test("the Week picker opens a week on a deliberate choice, the ask is named by its sentences, and a save fetches the route's data again", () => {
    const picker = read("features", "courses", "packsAndCases", "DrawWeekPicker.tsx");
    // A pointer opens the week at once; the keyboard waits for Enter or the button beside it.
    assert.match(picker, /onPointerDown=\{\(\) => \{\s*keyboard\.current = false;\s*\}\}/);
    assert.match(picker, /onKeyDown=\{\(event\) => \{\s*keyboard\.current = true;\s*if \(event\.key === "Enter"\) \{\s*event\.preventDefault\(\);\s*open\(pending\);/);
    assert.match(picker, /setPending\(chosen\);\s*if \(!keyboard\.current\) open\(chosen\);/);
    assert.match(picker, /\{pending !== current && \(\s*<button type="button" className=\{facilitator\.buttonGhost\} onClick=\{\(\) => open\(pending\)\}>\s*\{openWeekWords\(pending\)\}/);
    const editor = read("features", "courses", "packsAndCases", "DrawEditor.tsx");
    assert.match(editor, /aria-labelledby=\{/);
    assert.doesNotMatch(editor, /aria-label=\{ask\./, "the ask is announced by a button's word");
    assert.match(editor, /if \(then\) go\(then\);\s*\/\/[^\n]*\n\s*else router\.refresh\(\);/);
  });

  test("the group page's card names the week it is about", async () => {
    w.at("2026-11-17T18:30:00Z");
    const group = await w.groupPage("rahul");
    assert.match(group.text, /Give out week 4’s packs and cases before people leave\. /);
    assert.match(group.html, new RegExp(`href="/learn/draw/${B}\\?week=4"`));
    void W4;
  });

  test("every sentence the draw says, word for word", () => {
    assert.equal(words.DRAW_LEDE, "Copy in the slips you handed out tonight.");
    assert.equal(words.savedDrawWords(3, 6, 8, "a pathway and a case"), "Saved. 6 of 8 have a pathway and a case. Each person sees theirs on their week 3 page.");
    assert.equal(words.savedDrawWords(5, 1, 8, "a plan"), "Saved. 1 of 8 has a plan. Each person sees theirs on their week 5 page.");
    assert.equal(words.drawHoldingWords({ packs: [{ title: "Pathway" }], cases: [{}] }), "a pathway and a case");
    assert.equal(words.drawHoldingWords({ packs: [{ title: "Plan" }], cases: [] }), "a plan");
    assert.equal(words.drawHoldingWords({ packs: [], cases: [{}] }), "a case");
    assert.equal(words.drawHoldingWords({ packs: [{ title: "Example" }], cases: [] }), "an example");
    assert.equal(words.DRAW_NOT_SAVED, "That didn’t save, so nothing has changed. Try again.");
    assert.equal(words.leavingUnsavedWords(2), "You’ve changed 2 people and haven’t saved.");
    assert.equal(words.leavingUnsavedWords(1), "You’ve changed 1 person and haven’t saved.");
    assert.equal(words.LEAVE_WITHOUT_SAVING, "Leave without saving");
    assert.equal(words.READY_TAKEN_BACK, "Changing a case takes back that person’s Ready for my talk.");
    assert.equal(words.SAVE_ANYWAY, "Save anyway");
    assert.equal(words.WEEK, "Week");
    assert.equal(
      words.setBeforeWords(3, { dateKey: "2026-11-11", startsAt: at("2026-11-11T15:00:00Z") }, "2026-11-10"),
      "Week 3’s slips go out at Wednesday’s session. You can set them early and change them afterwards.",
    );
    assert.equal(
      words.setBeforeWords(5, { dateKey: "2026-12-02", startsAt: at("2026-12-02T15:00:00Z") }, "2026-11-10"),
      "Week 5’s slips go out at the session on Wed 2 Dec. You can set them early and change them afterwards.",
    );
    assert.equal(words.noSessionBeforeWords(1), "Week 1 has no session before it, so you can set its slips any time before its first session and change them afterwards.");
    assert.equal(words.handOutCalledOffWords(2, 1, null), "Session 1 is called off, so there is no session before week 2 to hand its slips out at.");
    assert.equal(words.nothingGivenOutWords(6), "Nothing is given out in week 6.");
    assert.equal(words.sessionsFinishedWords("Group C"), "Group C’s sessions have finished. This is what was given out.");
    const tue = at("2026-11-10T18:00:00Z");
    assert.equal(words.weekStandingWords(3, "now", tue, false), "Week 3 is the week people are working on now. Its session has started.");
    assert.equal(words.weekStandingWords(3, "now", tue, true), "Week 3 is the week people are working on now. Its session on Tue 10 Nov is called off.");
    assert.equal(words.weekStandingWords(2, "met", tue, false), "Week 2’s session was on Tue 10 Nov.");
    assert.equal(words.weekStandingWords(2, "met", tue, true), "Week 2’s session was due on Tue 10 Nov and was called off.");
    assert.equal(
      words.lateSaveRefusedWords(["Week 2’s session was on Tue 10 Nov.", "Changing a case takes back that person’s Ready for my talk."]),
      "Week 2’s session was on Tue 10 Nov. This save needs a yes first. Changing a case takes back that person’s Ready for my talk.",
    );
    assert.equal(words.openWeekWords(4), "Open week 4");
    assert.equal(words.givingWeeksWords([2, 3, 4, 5], [1, 6]), "Weeks 2 to 5 give something out. Weeks 1 and 6 don’t.");
    assert.equal(words.givingWeeksWords([3], [1, 2, 4, 5, 6]), "Week 3 gives something out. Weeks 1, 2 and 4 to 6 don’t.");
    assert.equal(words.givingWeeksWords([2, 4], [6]), "Weeks 2 and 4 give something out. Week 6 doesn’t.");
    assert.equal(words.givingWeeksWords([1, 2, 3, 4, 5, 6], []), "Weeks 1 to 6 give something out.");
    assert.equal(words.drawWeekOptionWords(3, { packs: [{ title: "Pathway" }], cases: [{}] }), "Week 3 · Pathways and cases");
    assert.equal(words.drawWeekOptionWords(6, null), "Week 6");
    assert.equal(words.drawCardWeekWords(4), "Week 4");
    assert.equal(words.backToWords("Group C"), "Back to Group C");
  });
});
