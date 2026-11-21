/**
 * THE PATHWAYS AND CASES CARD ON A GROUP'S PAGE, in every state, and the pairs
 * card beside it:
 *
 *  1. THE STATES, as the pure model (`src/lib/courses/drawCard/model.ts`)
 *     over the real reads of a built world, read as a facilitator, a
 *     co-facilitator, the programme's lead and an admin: before the session
 *     that hands the slips out; given out, nobody yet; some given, who has
 *     what and who has not; everybody has one; the next week gives nothing
 *     out; after the last session; a course that gives nothing out, and why;
 *     a course with neither a Choose one nor a Cases block, which has no card.
 *  2. THE PIN, by the one week rule, at its start and its end: a session
 *     about to start and started, the evening over, everybody has theirs, a
 *     moved session, a session called off, two sessions a week, week 1 and
 *     after the last session; and what the register and Home point to
 *     (`slipsTonightOf`), only on the hand-out evening.
 *  3. THE GROUP PAGE drawing each state, with the way on to the pathways and
 *     cases page, and the pairs card naming the week the pairs are for.
 *  4. Every sentence the card says, word for word.
 *
 * Runs in `tests/lib/packsAndCasesWorld.mjs` (AGI Strategy, Group B meeting
 * on Tuesdays at 6pm for two hours, Rahul, Sofia and Farah facilitating,
 * Farah from a place in the group, Claudia leading the programme, Zach an
 * admin), with week 4 written as blocks too, so weeks 2, 3 and 4 give
 * something out. The clock starts at noon on Tue 17 Nov 2026 (week 3).
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { A, B, NOW, RUN, W3, blockWeekDoc, idsOf, makePacksAndCasesWorld, packsSeed, weekBlocksFor } from "./lib/packsAndCasesWorld.mjs";

const w = await makePacksAndCasesWorld("__drawCard");
const card = await w.loadTs(join("lib", "courses", "drawCard", "model.ts"));
const words = await w.loadTs(join("lib", "courses", "drawCard", "words.ts"));
const pairsWords = await w.loadTs(join("lib", "courses", "pairs", "words.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const readers = w.lib.readers;
const { drawWeekRule } = await w.loadTs(join("lib", "courses", "packsAndCases", "drawWeek.ts"));
const { resolveSessions } = await w.loadTs(join("lib", "courses", "sessions.ts"));

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());

const W4 = idsOf("w4");
const EVERYBODY = ["chloe", "farah", "kofi", "rahul", "sofia"];

/** The world with week 4 written as blocks too. */
function seed(over = {}) {
  return packsSeed({ [`courseRuns/${RUN.agi}/weeks/w04`]: blockWeekDoc(4, "Who decides, again?", weekBlocksFor("w4")), ...over });
}

/** Everybody given a pack and a case for a week. */
function everybodyHas(prefix) {
  const ids = idsOf(prefix);
  for (const uid of EVERYBODY) w.seedDraw(uid, prefix, { pack: ids.elections, caseId: ids.surprise });
}

const VIEWERS = {
  facilitator: { uid: "rahul", isAdmin: false, lead: false },
  takingPart: { uid: "farah", isAdmin: false, lead: false },
  lead: { uid: "claudia", isAdmin: false, lead: true },
  admin: { uid: "zach", isAdmin: true, lead: false },
};

/** The card's model at `clock`, for a viewer, from the reads the group page makes. */
async function cardAt(clock, viewer = VIEWERS.facilitator) {
  w.at(clock);
  const now = new Date();
  const db = w.world.courseDb;
  const run = normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
  const group = normalizeCourseGroup(B, w.world.db.read(`courseGroups/${B}`));
  const people = (await readers.readDrawRoster(db, RUN.agi, group, { isAdmin: viewer.isAdmin }, now)).people;
  const course = await readers.readDrawWeeks(db, { run, group, people, now });
  return {
    model: card.drawCardModel({ course, people, viewer, now }),
    slips: card.slipsTonightOf({ course, people, now }),
  };
}

/** Every block of a week, its parts' too, changed by `fn`. */
function mapBlocks(blocks, fn) {
  return blocks.flatMap((block) => {
    const changed = fn(block);
    if (changed === null) return [];
    return [Array.isArray(changed.blocks) ? { ...changed, blocks: mapBlocks(changed.blocks, fn) } : changed];
  });
}

function rewriteWeeks(fn) {
  for (const n of [2, 3, 4]) {
    const path = `courseRuns/${RUN.agi}/weeks/w0${n}`;
    w.world.db.poke(path, { blocks: mapBlocks(w.world.db.read(path).blocks, fn) });
  }
}

function inOrder(text, phrases) {
  let at = 0;
  for (const phrase of phrases) {
    const found = text.indexOf(phrase, at);
    assert.ok(found >= 0, `missing, or out of order: "${phrase}"`);
    at = found + phrase.length;
  }
}

/** The card's own words on a group page, or null with no card. */
function cardText(page) {
  const found = /<section[^>]*data-testid="draw-card"[\s\S]*?<\/section>/.exec(page.html);
  return found ? found[0].replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim() : null;
}

// ---------------------------------------------------------------------------
// 1. The states
// ---------------------------------------------------------------------------

describe("1. the card's states, as each reader is shown them", () => {
  beforeEach(() => w.reset(seed()));

  test("some given: who has what by the name each goes by, who has not, and a facilitator named only to themself, the lead and admins", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    w.seedDraw("farah", "w3", { pack: W3.markets, caseId: W3.crash });
    const shown = {};
    for (const [name, viewer] of Object.entries(VIEWERS)) {
      const { model } = await cardAt("2026-11-17T12:00:00Z", viewer);
      assert.deepEqual([model.kind, model.weekNumber, model.phase, model.pinned, model.have, model.total], ["week", 3, "some", true, 2, 5], name);
      shown[name] = { tiles: model.tiles.map((tile) => [tile.name, tile.names]), notGiven: model.notGiven };
    }
    // A facilitator: Farah and Sofia facilitate too, so neither is named; Markets, which only Farah holds, has no row.
    assert.deepEqual(shown.facilitator, { tiles: [["Elections", ["Chloe"]]], notGiven: { names: ["Kofi", "Rahul"], unnamed: 1 } });
    // Farah, who facilitates from a place in the group, is shown her own, and neither of the others.
    assert.deepEqual(shown.takingPart, { tiles: [["Elections", ["Chloe"]], ["Markets", ["Farah"]]], notGiven: { names: ["Kofi"], unnamed: 2 } });
    // The lead and an admin are shown everybody.
    for (const name of ["lead", "admin"]) {
      assert.deepEqual(shown[name], { tiles: [["Elections", ["Chloe"]], ["Markets", ["Farah"]]], notGiven: { names: ["Kofi", "Rahul", "Sofia"], unnamed: 0 } }, name);
    }
  });

  test("before the session that hands them out, with the week before a tap away; given out, nobody yet; everybody has one", async () => {
    everybodyHas("w3");
    let { model } = await cardAt("2026-11-17T17:59:00Z");
    assert.deepEqual([model.weekNumber, model.phase, model.pinned, model.earlier?.weekNumber, model.facts.handOut.session.weekNumber], [4, "before", false, 3, 3]);
    ({ model } = await cardAt("2026-11-17T18:00:00Z"));
    assert.deepEqual([model.weekNumber, model.phase, model.pinned, model.earlier], [4, "giveOut", true, null]);
    everybodyHas("w4");
    ({ model } = await cardAt("2026-11-17T18:30:00Z"));
    assert.deepEqual([model.weekNumber, model.phase, model.pinned, model.otherWeeks], [4, "all", false, [2, 3]]);
    // At noon, before week 3 starts, with week 3's and week 4's both in: the first of them, and the others.
    ({ model } = await cardAt("2026-11-17T12:00:00Z"));
    assert.deepEqual([model.weekNumber, model.phase, model.otherWeeks], [3, "all", [2, 4]]);
  });

  test("the next week gives nothing out, and after the last session", async () => {
    let { model } = await cardAt("2026-11-24T18:30:00Z");
    assert.deepEqual(model, { kind: "nothingNext", nextWeek: 5, givenWeeks: [2, 3, 4] });
    ({ model } = await cardAt("2026-12-10T12:00:00Z"));
    assert.deepEqual(model, { kind: "finished", givenWeeks: [2, 3, 4] });
  });

  test("a course that gives nothing out says why, and only what is true: cases nobody can be given, then picks", async () => {
    // Every Choose one picked, and the case study not set to be given out: nobody can pick a case.
    rewriteWeeks((block) => (block.type === "chooseOne" || block.type === "cases" ? { ...block, givenBy: "fellow" } : block));
    let { model } = await cardAt("2026-11-17T12:00:00Z");
    assert.deepEqual(model, { kind: "notGivenOut", reason: "casesNotSet", weekNumber: 3, chooseOneTitle: "" });
    // Without the case study: what is left is picked by each person.
    rewriteWeeks((block) => (block.type === "cases" ? null : block));
    ({ model } = await cardAt("2026-11-17T12:00:00Z"));
    assert.deepEqual(model, { kind: "notGivenOut", reason: "picked", weekNumber: 3, chooseOneTitle: "Pack" });
    // With neither a Choose one nor a Cases block in any week, there is no card at all.
    rewriteWeeks((block) => (block.type === "chooseOne" ? null : block));
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w01`, { blocks: mapBlocks(w.world.db.read(`courseRuns/${RUN.agi}/weeks/w01`).blocks, (block) => (block.type === "chooseOne" || block.type === "cases" ? null : block)) });
    ({ model } = await cardAt("2026-11-17T12:00:00Z"));
    assert.equal(model, null);
    const page = await w.groupPage("rahul");
    assert.equal(cardText(page), null);
    assert.doesNotMatch(page.html, /\/learn\/draw\//);
  });
});

// ---------------------------------------------------------------------------
// 2. The pin
// ---------------------------------------------------------------------------

describe("2. pinned from the start of the session that hands the slips out until everybody has theirs, by the one rule", () => {
  beforeEach(() => w.reset(seed()));

  test("a session about to start and started, its evening over, and everybody has theirs; the register and Home are pointed there on the evening alone", async () => {
    everybodyHas("w3");
    const table = [
      // [clock, pinned, phase, slips tonight]
      ["2026-11-17T17:59:59Z", false, "before", null],
      ["2026-11-17T18:00:00Z", true, "giveOut", 4],
      ["2026-11-17T20:30:00Z", true, "giveOut", 4],
      ["2026-11-17T23:59:00Z", true, "giveOut", 4],
      // The next morning: still pinned, as nobody has theirs, and nothing points there.
      ["2026-11-18T09:00:00Z", true, "some", null],
      // Week 4 starts: it is no longer still to come.
      ["2026-11-24T18:00:00Z", false, null, null],
    ];
    for (const [clock, pinned, phase, slips] of table) {
      const { model, slips: tonight } = await cardAt(clock);
      assert.equal(model.kind === "week" && model.pinned, pinned, clock);
      if (phase) assert.equal(model.phase, phase, clock);
      assert.equal(tonight?.weekNumber ?? null, slips, clock);
    }
    // Some given on the evening: still pinned, still pointed at; everybody: neither.
    w.seedDraw("chloe", "w4", { pack: W4.elections, caseId: W4.surprise });
    let { model, slips } = await cardAt("2026-11-17T19:00:00Z");
    assert.deepEqual([model.phase, model.pinned, slips.weekNumber, slips.handOut.session.weekNumber], ["some", true, 4, 3]);
    everybodyHas("w4");
    ({ model, slips } = await cardAt("2026-11-17T19:00:00Z"));
    assert.deepEqual([model.phase, model.pinned, slips], ["all", false, null]);
  });

  test("a moved session: pinned from when it meets", async () => {
    everybodyHas("w3");
    w.world.db.poke(`courseGroups/${B}`, { sessionOverrides: { w03: { weekday: 1, startTimeLocal: "10:00" } } });
    let { model } = await cardAt("2026-11-16T09:59:00Z");
    assert.deepEqual([model.weekNumber, model.pinned], [4, false]);
    ({ model } = await cardAt("2026-11-16T10:00:00Z"));
    assert.deepEqual([model.weekNumber, model.pinned, model.phase], [4, true, "giveOut"]);
    // On the Tuesday it would have met, the evening is over: pinned, and nothing points there.
    const tuesday = await cardAt("2026-11-17T18:30:00Z");
    assert.deepEqual([tuesday.model.pinned, tuesday.slips], [true, null]);
  });

  test("the session that would hand them out called off: the slips went out at the last session held, which pins it", async () => {
    everybodyHas("w3");
    w.world.db.poke(`courseGroups/${B}`, { sessionChanges: { w03: { kind: "cancelled", reason: "Room closed", dateKey: "2026-11-17" } } });
    const { model, slips } = await cardAt("2026-11-17T12:00:00Z");
    assert.deepEqual([model.weekNumber, model.pinned, model.facts.handOut.session.weekNumber, model.facts.calledOff.weekNumber, slips], [4, true, 2, 3, null]);
  });

  test("two sessions a week: pinned from the start of the last of them", async () => {
    everybodyHas("w3");
    // A group's second weekly slot is not on its stored document (the session
    // resolver takes it on the group it is handed), so the rule is asked here
    // of Group B with a second session on Wednesdays at noon, as
    // `readDrawWeeks` asks it, over what that read: week 3's last session is
    // then Wed 18 Nov.
    const extra = { weekday: 3, startTimeLocal: "12:00", durationMinutes: 60, location: "", meetingUrl: null, notes: "" };
    const twice = async (clock) => {
      w.at(clock);
      const now = new Date();
      const db = w.world.courseDb;
      const run = normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
      const group = normalizeCourseGroup(B, w.world.db.read(`courseGroups/${B}`));
      const people = (await readers.readDrawRoster(db, RUN.agi, group, { isAdmin: false }, now)).people;
      const read = await readers.readDrawWeeks(db, { run, group, people, now });
      const sessions = resolveSessions(run, { ...group, extraSession: extra });
      const givingWeeks = read.giving.map((week) => week.weekNumber);
      const first = drawWeekRule({ sessions, givingWeeks, now });
      const states = new Map(await Promise.all(first.toRead.map(async (n) => [n, await readers.readDrawState(db, RUN.agi, read.weeks.get(n), people)])));
      const everybody = new Map([...states].map(([n, state]) => [n, readers.everybodyHasTheirs(read.weeks.get(n), people, state)]));
      const course = { ...read, sessions, states, rule: drawWeekRule({ sessions, givingWeeks, now, everybodyHas: everybody }) };
      return { model: card.drawCardModel({ course, people, viewer: VIEWERS.facilitator, now }), slips: card.slipsTonightOf({ course, people, now }) };
    };
    const tuesday = await twice("2026-11-17T18:30:00Z");
    assert.deepEqual([tuesday.model.weekNumber, tuesday.model.pinned, tuesday.model.phase, tuesday.slips], [4, false, "before", null]);
    const wednesday = await twice("2026-11-18T12:00:00Z");
    assert.deepEqual([wednesday.model.pinned, wednesday.model.phase, wednesday.slips.weekNumber, wednesday.slips.handOut.session.occurrence], [true, "giveOut", 4, 2]);
  });

  test("week 1 has no session before it: never pinned, set before the first session", async () => {
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w01`, { blocks: weekBlocksFor("w1") });
    const { model, slips } = await cardAt("2026-11-01T12:00:00Z");
    assert.deepEqual([model.weekNumber, model.pinned, model.phase, model.facts.handOut, slips], [1, false, "before", null, null]);
    w.at("2026-11-01T12:00:00Z");
    assert.match(cardText(await w.groupPage("rahul")), /Week 1 has no session before it, so you can set its slips any time before its first session and change them afterwards\./);
  });

  test("after the last session: never pinned", async () => {
    const { model, slips } = await cardAt("2026-12-10T12:00:00Z");
    assert.deepEqual([model.kind, slips], ["finished", null]);
  });
});

// ---------------------------------------------------------------------------
// 3. The group page
// ---------------------------------------------------------------------------

describe("3. the group page draws each state, and every way on leads to the pathways and cases page", () => {
  beforeEach(() => w.reset(seed()));
  const href = (week) => (week === null ? `href="/learn/draw/${B}"` : `href="/learn/draw/${B}?week=${week}"`);

  test("each state, word for word on the page", async () => {
    // Some given (pinned since session 2), to an admin.
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    let page = await w.groupPage("zach");
    assert.equal(cardText(page), "Packs and cases Week 3 · 1 of 5 given Elections Chloe Not given yet: Farah, Kofi, Rahul and Sofia Farah, Kofi, Rahul and Sofia are waiting for theirs. Copy in the slips");
    assert.ok(page.html.includes(href(3)));
    // Before the session that hands week 4's out, with week 3's a tap away.
    everybodyHas("w3");
    page = await w.groupPage("rahul");
    assert.equal(
      cardText(page),
      "Packs and cases Week 4 You hand these out at the end of Tuesday’s session, then copy them in here. Copy in week 4’s slips Week 3’s packs and cases Everybody has a pack and a case.",
    );
    assert.ok(page.html.includes(href(4)) && page.html.includes(href(3)));
    // From the start of that session.
    w.at("2026-11-17T18:05:00Z");
    page = await w.groupPage("rahul");
    assert.equal(cardText(page), "Give out week 4’s packs and cases before people leave. Then copy the slips in, so each person sees theirs. Copy in the slips");
    assert.match(page.html, /data-testid="draw-card" data-pinned="true"/);
    // Everybody has one.
    everybodyHas("w4");
    page = await w.groupPage("rahul");
    assert.equal(cardText(page), "Packs and cases Week 4 Everybody has a pack and a case. Change packs and cases Other weeks Weeks 2 and 3");
    assert.ok(page.html.includes(href(4)) && page.html.includes(href(null)));
    // The next week gives nothing out.
    w.at("2026-11-24T18:30:00Z");
    page = await w.groupPage("rahul");
    assert.equal(cardText(page), "Pathways and cases Nothing is given out in week 5. What was given out Weeks 2 to 4");
    // After the last session.
    w.at("2026-12-10T12:00:00Z");
    page = await w.groupPage("rahul");
    assert.equal(cardText(page), "Pathways and cases Group B’s sessions have finished. What was given out Weeks 2 to 4");
    assert.ok(page.html.includes(href(null)));
  });

  test("a course that gives nothing out names who changes the week: the programme's lead, or an admin", async () => {
    rewriteWeeks((block) => (block.type === "chooseOne" || block.type === "cases" ? { ...block, givenBy: "fellow" } : block));
    assert.equal(
      cardText(await w.groupPage("rahul")),
      "Pathways and cases Week 3’s cases aren’t set to be given out, so nobody can be given one. To give them out, ask Claudia or an admin to change the week.",
    );
    rewriteWeeks((block) => (block.type === "cases" ? null : block));
    assert.equal(
      cardText(await w.groupPage("rahul")),
      "Pathways and cases Week 3’s packs are picked by each person, so there’s nothing for you to give out. If you meant to hand them out, ask Claudia or an admin to change the week.",
    );
    assert.doesNotMatch(cardText(await w.groupPage("rahul")), /cases are picked/);
  });

  test("the pairs card: the week the pairs are for, the next week in pairs when the next session's is not, and never pinned", async () => {
    // Weeks 3 and 4 are in pairs: Before you come says so.
    for (const n of [3, 4]) {
      const path = `courseRuns/${RUN.agi}/weeks/w0${n}`;
      w.world.db.poke(path, { blocks: JSON.parse(JSON.stringify(w.world.db.read(path).blocks).replace("Bring your number on a slip of paper.", "You will be paired with someone.")) });
    }
    // Week 3 meets tonight in pairs.
    inOrder((await w.groupPage("rahul")).text, ["Pairs in Group B", "Week 3", "Nobody is paired yet.", "Pair people up"]);
    // Week 3 not in pairs: the next week that is, week 4.
    const path = `courseRuns/${RUN.agi}/weeks/w03`;
    w.world.db.poke(path, { blocks: mapBlocks(w.world.db.read(path).blocks, (block) => (block.type === "inTheSession" ? null : block)) });
    const page = await w.groupPage("rahul");
    inOrder(page.text, ["Pairs in Group B", "Week 4", "Nobody is paired yet.", "Pair people up"]);
    assert.ok(page.html.includes(`href="/learn/pairs/${B}?week=4"`));
    assert.doesNotMatch(/<section[^>]*aria-labelledby="group-pairs"[^>]*>/.exec(page.html)[0], /pinned/);
    // After the last session: the card stays and says so.
    w.at("2026-12-10T12:00:00Z");
    inOrder((await w.groupPage("rahul")).text, ["Pairs in Group B", "No week still to come is in pairs."]);
    void A;
  });
});

// ---------------------------------------------------------------------------
// 4. The words
// ---------------------------------------------------------------------------

describe("4. every sentence the card says", () => {
  test("word for word", () => {
    const at = (iso) => new Date(iso);
    const pathways = { packs: [{ title: "Pathway" }], cases: [{}] };
    assert.equal(words.DRAW_CARD_TITLE, "Pathways and cases");
    assert.equal(words.cardWeekWords(3, 6, 8), "Week 3 · 6 of 8 given");
    assert.equal(words.cardWeekWords(3, 0, 8), "Week 3");
    assert.equal(words.cardWeekWords(3, 8, 8), "Week 3");
    assert.equal(words.handOutAtWords({ dateKey: "2026-11-11", startsAt: at("2026-11-11T15:00:00Z") }, "2026-11-10"), "You hand these out at the end of Wednesday’s session, then copy them in here.");
    assert.equal(words.handOutAtWords({ dateKey: "2026-12-02", startsAt: at("2026-12-02T15:00:00Z") }, "2026-11-10"), "You hand these out at the end of the session on Wed 2 Dec, then copy them in here.");
    assert.equal(words.handOutUndatedWords(3), "You hand these out at the session before week 3, then copy them in here.");
    assert.equal(words.copyInWeekWords(3), "Copy in week 3’s slips");
    assert.equal(words.COPY_IN_THE_SLIPS, "Copy in the slips");
    assert.equal(words.giveOutWords(3, pathways), "Give out week 3’s pathways and cases before people leave.");
    assert.equal(words.GIVE_OUT_LINE, "Then copy the slips in, so each person sees theirs.");
    assert.equal(words.notGivenWords(["Daniel", "Chloe"], 0), "Not given yet: Daniel and Chloe");
    assert.equal(words.notGivenWords(["Daniel"], 1), "Not given yet: Daniel and 1 more");
    assert.equal(words.notGivenWords([], 2), "Not given yet: 2 people");
    assert.equal(words.waitingWords(["Daniel", "Chloe"], 0), "Daniel and Chloe are waiting for theirs.");
    assert.equal(words.waitingWords(["Daniel"], 0), "Daniel is waiting for theirs.");
    assert.equal(words.waitingWords([], 1), "1 person is waiting for theirs.");
    assert.equal(words.waitingWords(["Daniel"], 2), "Daniel and 2 more are waiting for theirs.");
    assert.equal(words.everybodyHasWords(pathways), "Everybody has a pathway and a case.");
    assert.equal(words.everybodyHasWords({ packs: [], cases: [{}] }), "Everybody has a case.");
    assert.equal(words.weekThingsWords(2, { packs: [], cases: [{}] }), "Week 2’s cases");
    assert.equal(words.OTHER_WEEKS, "Other weeks");
    assert.equal(words.WHAT_WAS_GIVEN_OUT, "What was given out");
    assert.equal(words.weeksListWords([2, 4, 5]), "Weeks 2, 4 and 5");
    assert.equal(words.weeksListWords([2, 3, 4, 5]), "Weeks 2 to 5");
    assert.equal(words.finishedWords("Group C"), "Group C’s sessions have finished.");
    assert.equal(words.NOTHING_STILL_TO_COME, "No week still to come gives anything out.");
    assert.equal(words.pickedWords(3, "Pathway", "Maya"), "Week 3’s pathways are picked by each person, so there’s nothing for you to give out. If you meant to hand them out, ask Maya or an admin to change the week.");
    assert.equal(words.pickedWords(6, "One career review that fits you", null), "In week 6 each person picks their own, so there’s nothing for you to give out. If you meant to hand them out, an admin can change the week.");
    assert.equal(words.casesNotSetWords(3, null), "Week 3’s cases aren’t set to be given out, so nobody can be given one. To give them out, an admin can change the week.");
    assert.equal(words.NOTHING_TO_GIVE_OUT, "Nothing on this course is given out, so there’s nothing for you to give out.");
    assert.equal(words.registerRowTitleWords(3, pathways), "Week 3’s pathways and cases");
    assert.equal(words.REGISTER_ROW_LINE, "Hand out the slips, then copy them in.");
    assert.equal(words.homeSlipsTitleWords("2026-11-11"), "After Wednesday’s session");
    assert.equal(words.homeSlipsLineWords(3, "Pathways and cases"), "Copy in the pathways and cases you hand out for week 3.");
    assert.equal(words.guideSlipsEyebrowWords(2), "After session 2");
    assert.equal(words.guideSlipsLineWords(3, pathways), "Copy in the pathway and case slips you handed out for week 3.");
    assert.equal(pairsWords.pairsCardWeekWords(4), "Week 4");
    assert.equal(pairsWords.NO_PAIRS_TO_COME, "No week still to come is in pairs.");
  });
});
