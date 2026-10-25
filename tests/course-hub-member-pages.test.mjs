/**
 * The pages a member uses every week: their programme's home (boards
 * st-programme before the first session, wk-programme once it has started),
 * their marks with no target (C26), and Home's card for their programme
 * (wk-home-phone), where a reading is ticked off as it is on its week (C33).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE PROGRAMME HOME, before the start and in week 3, word for word: the
 *     head (the programme, the group's usual day, time and room, with whom),
 *     the next session's ticket (tonight, a room changed this week, a session
 *     cancelled as Change a session says), "This week" or week 1's readings to
 *     tick, the weeks with their dates and states and when the next one opens,
 *     the updates, the group by first names, and nothing the boards draw that
 *     does not exist yet ("Add to calendar", "Can’t make it").
 *  2. YOUR MARKS: one per session with its mark, a legend of the marks used,
 *     the board's line, and NO COUNT anywhere a member reads: no "of", no "in
 *     full", no "so far". Late and left early are drawn as having come.
 *  3. EVERY CALLER: a facilitator and an admin are shown no marks, no ticks and
 *     no group card; somebody who left, or was never told, reads nothing.
 *  4. HOME'S CARD: the next session, the reading before it with its ticks, the
 *     group, and no attendance count.
 *  5. ONE TICK, ONE RECORD: a reading ticked on Home, on the programme home
 *     before the start and on its week's own page is the same write of the
 *     same document; a facilitator's or a finished enrolment's tick writes
 *     nothing.
 *  6. No sentence on these pages has a dash (C35).
 *
 * Real: the overview, roster and hub routes, the three pages, the libraries.
 * Faked: the session, the Admin SDK handle, the clock, the stylesheets, the
 * browser's data hooks, and the browser SDK's write (recorded where it would
 * have gone). See the world.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { B, NOW, RUN, makeMemberPagesWorld } from "./lib/memberPagesWorld.mjs";
import { register, registerPath } from "./lib/hubAttendanceWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeMemberPagesWorld("__memberPages");
const t = await makeMemberPagesWorld("__memberTicks", { recordTickRows: true });

const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
  t.reset();
});

/** Group B's stored document, changed in place. */
function changeGroupB(world, change) {
  const path = `courseGroups/${B}`;
  world.world.db.seed(path, { ...world.world.db.read(path), ...change });
}

/** A count of sessions, in any of the shapes a target could take. */
const COUNTS = /\b\d+ of \d+ (sessions|so far)|in full|so far|attendance/i;

// ---------------------------------------------------------------------------
// 1. The programme home
// ---------------------------------------------------------------------------

describe("1. the programme home", () => {
  test("before the first session (st-programme), on Sat 31 Oct", async () => {
    at("2026-10-31T12:00:00Z");
    await w.asBrowser("chloe");
    const { text } = w.programmeHome("chloe");
    assert.equal(
      text,
      "My programmes AGI Strategy " +
        "Fellowship · Autumn 2026 AGI Strategy Fellowship Group B · Tuesdays 6pm · Hallward B12 · with Rahul and Sofia " +
        "Tue 3 Nov Your first session · week 1 Tue 3 Nov, 6pm to 8pm Hallward B12 R S with Rahul and Sofia " +
        "Before your first session 0 of 3 done Week 1 · Week 1 readings Thu 29 Oct to Wed 4 Nov " +
        "Week 1 reading one Reading 25 min Open Week 1 reading one " +
        "Week 1 talk Video 20 min Open Week 1 talk " +
        "Week 1 reading two Reading 30 min Open Week 1 reading two Open week 1 → " +
        "Your group Group B CN Chloe (you) FH Farah KA Kofi R S Facilitators: Rahul and Sofia " +
        "Names only. Nobody here sees your email address. [RunUpdates] " +
        "The 6 weeks Week 1 Week 1 readings Tue 3 Nov Next Week 2 Week 2 readings Tue 10 Nov " +
        "Week 3 Who decides what AGI means Tue 17 Nov Week 4 Week 4 readings Tue 24 Nov " +
        "Week 5 Week 5 readings Tue 1 Dec Week 6 Week 6 readings Tue 8 Dec " +
        "Each week opens straight after your previous session. See your progress week by week →",
    );
    assert.doesNotMatch(text, /Week \d of 6|Your marks|Add to calendar|Can’t make it/);
  });

  test("in week 3, the day of the session (wk-programme)", async () => {
    await w.asBrowser("chloe");
    w.ui.progress = new Map([["w3r1", { itemId: "w3r1", completed: true }]]);
    const { text, html } = w.programmeHome("chloe");
    assert.equal(
      text,
      "My programmes AGI Strategy " +
        "Fellowship · Autumn 2026 AGI Strategy Fellowship Week 3 of 6 Group B · Tuesdays 6pm · Hallward B12 · with Rahul and Sofia " +
        "Tue 17 Nov Tonight · week 3 Tue 17 Nov, 6pm to 8pm Hallward B12 R S with Rahul and Sofia " +
        "This week 1 of 3 done Week 3 · Who decides what AGI means Thu 12 to Wed 18 Nov Open week 3 → " +
        "The 6 weeks Week 1 Week 1 readings Tue 3 Nov · Done 0 of 3 Week 2 Week 2 readings Tue 10 Nov · Done 0 of 3 " +
        "Week 3 Who decides what AGI means Tonight 1 of 3 " +
        "Week 4 Week 4 readings Tue 24 Nov · Opens tonight, after your session " +
        "Week 5 Week 5 readings Tue 1 Dec Week 6 Week 6 readings Tue 8 Dec See your progress week by week → " +
        "Your marks P 3 Nov P 10 Nov · 17 Nov · 24 Nov · 1 Dec · 8 Dec P Present · Not yet " +
        "Your facilitators fill these in after each session. [RunUpdates] " +
        "Your group Group B CN Chloe (you) FH Farah KA Kofi R S Facilitators: Rahul and Sofia",
    );
    // Open weeks are links; a week that is not open is not.
    for (const n of [1, 2, 3]) assert.match(html, new RegExp(`href="/learn/[^"]+/weeks/${n}"`));
    for (const n of [4, 5, 6]) assert.doesNotMatch(html, new RegExp(`href="/learn/[^"]+/weeks/${n}"`));
    assert.match(html, /aria-current="step"/);
    assert.doesNotMatch(text, /Add to calendar|Can’t make it|Names only/);
  });

  test("only the next week to open says when: a later published week shows its date alone", async () => {
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w05`, { published: true });
    await w.asBrowser("chloe");
    const { text } = w.programmeHome("chloe");
    assert.match(text, /Week 4 Week 4 readings Tue 24 Nov · Opens tonight, after your session Week 5 Week 5 readings Tue 1 Dec Week 6 /);
  });

  test("a room changed for this week only: the ticket says so, the head keeps the group's own room", async () => {
    changeGroupB(w, { sessionOverrides: { w03: { location: "Room C21" } } });
    await w.asBrowser("chloe");
    const { text } = w.programmeHome("chloe");
    assert.match(text, /Group B · Tuesdays 6pm · Hallward B12 · with Rahul and Sofia Tue 17 Nov Tonight · week 3 Tue 17 Nov, 6pm to 8pm Room C21 Room changed this week This week/);
  });

  test("a session cancelled through Change a session: the notice, the next session covering both weeks, and the week says so", async () => {
    changeGroupB(w, {
      sessionChanges: { w03: { kind: "cancelled", reason: "Rahul and Sofia are both away.", dateKey: "2026-11-17", byUid: "rahul", at: new Date("2026-11-13T09:00:00Z") } },
    });
    await w.asBrowser("chloe");
    const { text } = w.programmeHome("chloe");
    assert.match(text, /No session tonight Tue 17 Nov is cancelled\. Rahul and Sofia are both away\. Do week 3’s reading anyway\. On Tue 24 Nov you’ll talk about weeks 3 and 4 together\./);
    assert.match(text, /Tue 24 Nov Your next session · weeks 3 and 4 Tue 24 Nov, 6pm to 8pm/);
    assert.match(text, /Week 3 Who decides what AGI means Tue 17 Nov · Cancelled/);
  });

  test("after the end: no ticket, no week to do, the record's own words, and every week done", async () => {
    at("2026-12-10T12:00:00Z");
    for (const n of [5, 6]) w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w0${n}`, { published: true });
    await w.asBrowser("chloe");
    const { text } = w.programmeHome("chloe");
    assert.match(text, /^My programmes AGI Strategy Fellowship · Autumn 2026 AGI Strategy Fellowship Group B · Tuesdays 6pm · Hallward B12 · with Rahul and Sofia AGI Strategy Fellowship has ended\. Thanks for being part of it\. Every week stays open, so you can go back to any of them\. The 6 weeks /);
    assert.doesNotMatch(text, /Tonight|This week|Your next session|You finished/);
    for (const day of ["Tue 3 Nov", "Tue 10 Nov", "Tue 17 Nov", "Tue 24 Nov", "Tue 1 Dec", "Tue 8 Dec"]) assert.match(text, new RegExp(`${day} · Done`));
  });

  test("a facilitator of the group: the ticket and every published week, no marks, no ticks, no group card", async () => {
    await w.asBrowser("rahul");
    const { text, html } = w.programmeHome("rahul");
    assert.match(text, /Tonight · week 3 Tue 17 Nov, 6pm to 8pm/);
    assert.match(text, /Week 4 Week 4 readings Tue 24 Nov /);
    assert.match(html, /href="\/learn\/[^"]+\/weeks\/4"/);
    assert.doesNotMatch(text, /Your marks|Your group|This week|See your progress|Opens tonight/);
    assert.doesNotMatch(html, /type="checkbox"/);
  });

  test("an admin on no group: the weeks with no dates of anybody's, and no member's cards", async () => {
    await w.asBrowser("zach");
    const { text } = w.programmeHome("zach");
    assert.match(text, /Week 3 of 6/);
    assert.match(text, /The 6 weeks Week 1 Week 1 readings Done/);
    assert.doesNotMatch(text, /Your marks|Your group|This week|Tonight/);
  });

  for (const [who, why] of [
    ["sam", "who left"],
    ["una", "placed and not told"],
    ["claudia", "the programme's lead, who is not on the run"],
    [null, "signed out"],
  ]) {
    test(`somebody ${why} is answered nothing to draw`, async () => {
      const answer = await w.asBrowser(who);
      assert.notEqual(answer.status, 200);
      assert.equal(w.ui.overview, null);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Your marks
// ---------------------------------------------------------------------------

describe("2. your marks: one per session, a legend, and no count", () => {
  /** Group B's six registers, finished, with Kofi's marks as given. `null` leaves him unmarked. */
  function kofiMarks(marks, { notHeld = [] } = {}) {
    for (let week = 1; week <= 6; week += 1) {
      const records = marks[week - 1] ? { kofi: marks[week - 1] } : {};
      w.world.db.seed(registerPath(B, week), register(B, week, records, { held: !notHeld.includes(week) }));
    }
  }

  test("every mark there is, each said whole, with the legend of those used and the board's line", async () => {
    at("2026-12-10T12:00:00Z");
    kofiMarks(["present", "late", "left-early", "excused", "absent", null], { notHeld: [] });
    await w.asBrowser("kofi");
    const { text, html } = w.programmeHome("kofi");
    assert.match(
      text,
      /Your marks P 3 Nov L 10 Nov LE 17 Nov E 24 Nov A 1 Dec 8 Dec P Present L Late LE Left early E Excused A Absent Not marked Your facilitators fill these in after each session\./,
    );
    for (const label of [
      "Week 1, Tue 3 Nov: Present",
      "Week 2, Tue 10 Nov: Late",
      "Week 3, Tue 17 Nov: Left early",
      "Week 4, Tue 24 Nov: Excused",
      "Week 5, Tue 1 Dec: Absent",
      "Week 6, Tue 8 Dec: Not marked",
    ]) {
      assert.match(html, new RegExp(`aria-label="${label}"`));
    }
    // Late and left early are drawn as having come, as Present is.
    assert.match(html, /class="markBox markHere"[^>]*aria-label="Week 2, Tue 10 Nov: Late"/);
    assert.match(html, /class="markBox markHere"[^>]*aria-label="Week 3, Tue 17 Nov: Left early"/);
    assert.doesNotMatch(text, COUNTS);
  });

  test("a session cancelled through Change a session, and a register that says it did not happen", async () => {
    at("2026-12-10T12:00:00Z");
    kofiMarks(["present", "present", null, "present", "present", "present"], { notHeld: [5] });
    changeGroupB(w, {
      sessionChanges: { w03: { kind: "cancelled", reason: "Away.", dateKey: "2026-11-17", byUid: "rahul", at: new Date("2026-11-13T09:00:00Z") } },
    });
    await w.asBrowser("kofi");
    const { html, text } = w.programmeHome("kofi");
    assert.match(html, /aria-label="Week 3, Tue 17 Nov: Cancelled"/);
    assert.match(html, /aria-label="Week 5, Tue 1 Dec: Didn’t happen"/);
    assert.match(text, /P Present Cancelled Didn’t happen Your facilitators/);
    assert.doesNotMatch(text, COUNTS);
  });

  test("a session whose register is not finished yet is Not yet, never an absence", async () => {
    w.world.db.seed(registerPath(B, 3), register(B, 3, { chloe: "absent" }, { pushed: false }));
    at("2026-11-18T12:00:00Z");
    await w.asBrowser("chloe");
    const { html } = w.programmeHome("chloe");
    assert.match(html, /aria-label="Week 3, Tue 17 Nov: Not yet"/);
  });

  test("nothing a member reads counts their sessions: the programme home and Home, before, during and after", async () => {
    for (const when of ["2026-10-31T12:00:00Z", NOW.toISOString(), "2026-12-10T12:00:00Z"]) {
      at(when);
      for (const who of ["chloe", "farah", "kofi", "amara"]) {
        await w.asBrowser(who);
        assert.doesNotMatch(w.programmeHome(who).text, COUNTS, `${who} at ${when}`);
        const home = await w.homeCard(who);
        assert.doesNotMatch(home.text, COUNTS, `${who}'s Home at ${when}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Home's card
// ---------------------------------------------------------------------------

describe("3. Home's card (wk-home-phone)", () => {
  test("on the day of a session: the ticket, the reading before tonight to tick, the group", async () => {
    await w.asBrowser("chloe");
    const home = await w.homeCard("chloe");
    assert.equal(
      home.text,
      "AGI Strategy · week 3 of 6 Hi Chloe. AGI Strategy Fellowship · Group B · week 3 of 6 " +
        "Tue 17 Nov Tonight · week 3 Group B, 6pm to 8pm Hallward B12 R S with Rahul and Sofia " +
        "Before tonight 0 of 3 done Week 3 · Who decides what AGI means " +
        "Week 3 reading one Reading 25 min Week 3 talk Video 20 min Week 3 reading two Reading 30 min Open week 3 → " +
        "Your group Group B CN Chloe (you) FH Farah KA Kofi R S Facilitators: Rahul and Sofia",
    );
    assert.equal((home.html.match(/type="checkbox"/g) ?? []).length, 3);
    assert.doesNotMatch(home.text, /Your attendance|Add to calendar|Can’t make it/);
  });

  test("on the day of the first session: tonight, your first session", async () => {
    at("2026-11-03T09:00:00Z");
    await w.asBrowser("chloe");
    const home = await w.homeCard("chloe");
    assert.match(home.text, /^AGI Strategy · week 1 of 6 Hi Chloe\. .* Tue 3 Nov Tonight · your first session Group B, 6pm to 8pm .* Before tonight 0 of 3 done Week 1 · Week 1 readings /);
  });

  test("before the start: the first session, and its reading", async () => {
    at("2026-10-31T12:00:00Z");
    await w.asBrowser("chloe");
    const home = await w.homeCard("chloe");
    assert.match(home.text, /Your first session · week 1 Group B, 6pm to 8pm .* Before your first session 0 of 3 done Week 1 · Week 1 readings/);
  });

  test("the morning after a session: the next one, and its own week's reading", async () => {
    at("2026-11-18T09:00:00Z");
    await w.asBrowser("chloe");
    const home = await w.homeCard("chloe");
    assert.match(home.text, /Tue 24 Nov Your next session · week 4 Group B, 6pm to 8pm .* Before your session 0 of 3 done Week 4 · Week 4 readings/);
  });
});

// ---------------------------------------------------------------------------
// 4. One tick, one record
// ---------------------------------------------------------------------------

describe("4. a reading ticked on Home, the programme home or its week is the same record", () => {
  /** The rows a page drew, by the week its handler writes for. */
  const rowsDrawn = () => t.ui.tickRows.splice(0);

  test("Home's Before tonight and week 3's own page write the same document, the same way", async () => {
    await t.asBrowser("chloe");
    t.ui.tickRows = [];
    await t.homeCard("chloe");
    const [home] = rowsDrawn();
    assert.ok(home, "Home drew no readings");
    assert.equal(home.canTick, true);
    home.onTick("material", "w3r1", true);
    await new Promise((resolve) => setImmediate(resolve));

    t.weekPage("chloe", 3);
    const [week] = rowsDrawn();
    week.onTick("material", "w3r1", true);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(t.ui.writes.length, 2);
    const [fromHome, fromWeek] = t.ui.writes;
    assert.equal(fromHome.path, `courseProgress/${RUN.agi}__chloe__w3r1`);
    assert.equal(fromWeek.path, fromHome.path);
    assert.deepEqual(fromWeek.data, fromHome.data);
    assert.deepEqual(
      { runId: fromHome.data.runId, uid: fromHome.data.uid, weekNumber: fromHome.data.weekNumber, itemKind: fromHome.data.itemKind, itemId: fromHome.data.itemId, completed: fromHome.data.completed },
      { runId: RUN.agi, uid: "chloe", weekNumber: 3, itemKind: "material", itemId: "w3r1", completed: true },
    );
  });

  test("the programme home before the start and week 1's page write the same document", async () => {
    at("2026-10-31T12:00:00Z");
    await t.asBrowser("chloe");
    t.programmeHome("chloe");
    const [before] = rowsDrawn();
    before.onTick("material", "w1v1", true);
    await new Promise((resolve) => setImmediate(resolve));
    t.weekPage("chloe", 1);
    const [week] = rowsDrawn();
    week.onTick("material", "w1v1", true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(t.ui.writes.length, 2);
    assert.equal(t.ui.writes[0].path, `courseProgress/${RUN.agi}__chloe__w1v1`);
    assert.deepEqual(t.ui.writes[1], t.ui.writes[0]);
    assert.equal(t.ui.writes[0].data.weekNumber, 1);
  });

  test("an untick writes the same document as not done", async () => {
    await t.asBrowser("chloe");
    t.ui.progress = new Map([["w3r1", { itemId: "w3r1", completed: true }]]);
    await t.homeCard("chloe");
    rowsDrawn()[0].onTick("material", "w3r1", false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(t.ui.writes[0].path, `courseProgress/${RUN.agi}__chloe__w3r1`);
    assert.equal(t.ui.writes[0].data.completed, false);
  });

  test("a facilitator reading the week, and an admin, tick nothing", async () => {
    for (const [who, role] of [
      ["rahul", "facilitator"],
      ["zach", "admin"],
    ]) {
      await t.asBrowser(who);
      t.weekPage(who, 3, role);
      const rows = rowsDrawn();
      for (const drawn of rows) {
        assert.equal(drawn.canTick, false);
        drawn.onTick("material", "w3r1", true);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(t.ui.writes, []);
  });

  test("a member whose enrolment is no longer active ticks nothing, on Home or on the week", async () => {
    const path = `courseEnrolments/${RUN.agi}__chloe`;
    t.world.db.seed(path, { ...t.world.db.read(path), status: "completed" });
    await t.asBrowser("chloe");
    await t.homeCard("chloe");
    t.weekPage("chloe", 3);
    for (const drawn of rowsDrawn()) {
      assert.equal(drawn.canTick, false);
      drawn.onTick("material", "w3r1", true);
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(t.ui.writes, []);
  });
});

// ---------------------------------------------------------------------------
// 5. No dash
// ---------------------------------------------------------------------------

describe("5. no sentence on these pages has a dash (C35)", () => {
  test("the programme home and Home's card, before, during and after", async () => {
    for (const when of ["2026-10-31T12:00:00Z", NOW.toISOString(), "2026-12-10T12:00:00Z"]) {
      at(when);
      for (const who of ["chloe", "rahul", "zach"]) {
        await w.asBrowser(who);
        assert.doesNotMatch(w.programmeHome(who).text, /[–—]/, `${who} at ${when}`);
      }
      await w.asBrowser("chloe");
      assert.doesNotMatch((await w.homeCard("chloe")).text, /[–—]/, `Home at ${when}`);
    }
  });
});
