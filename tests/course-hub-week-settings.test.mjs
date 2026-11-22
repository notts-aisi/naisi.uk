/**
 * A programme's Weeks tab's Course documents card, and on a week's page there
 * its settings (title, summary, pitching week, questions), Published and
 * taking the week back, and How it landed: drawn and driven as every kind of
 * reader, on AGI Strategy's run, Tue 17 Nov 2026 at noon.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Real: the pages, the settings route, the unpublish route, the look back
 * route, every library under them (`tests/lib/weeksTabWorld.mjs`). Week 3 is
 * written as blocks and every group but Group B has met for it; week 4 is
 * published, written before blocks, and no group has met for it yet.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { CAST } from "./lib/handoverWorld.mjs";
import { PEOPLE } from "./lib/hubAttendanceWorld.mjs";
import { B, COURSE, NOW, PERSONAS, ROUND, AGI, RUN, makeWeeksTabWorld, weeksTabSeed } from "./lib/weeksTabWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

/** A course approver, named on nothing. */
const approver = session("april", "member", false, "April Stone");
CAST.april = { ...approver, permissions: { ...approver.permissions, approveCourse: true } };

const w = await makeWeeksTabWorld("__weekSettings");
const { world, draw, tabsPage, call, courseRoute, loadTs } = w;
const TabPage = await tabsPage("weeks", "page.tsx");
const WeekPage = await tabsPage("weeks", "[weekId]", "page.tsx");
const settingsRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "settings");
const publishedRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "published");
const retroRoute = await courseRoute("runs", "[runId]", "retrospective");
const words = await loadTs(join("lib", "courses", "weekSettings", "words.ts"));
const tabWords = await loadTs(join("lib", "courses", "weeksTab", "words.ts"));
const { RETRO_ANONYMITY_FLOOR } = await loadTs(join("lib", "firestore", "courseTemplates.ts"));
const { settingsFingerprint } = await loadTs(join("lib", "courses", "weekSettings", "model.ts"));
const { normalizeCourseWeek } = await loadTs(join("lib", "firestore", "courses.ts"));

const ALL = [...PERSONAS, ["april", "a course approver"]];
const tab = { roundId: ROUND, programmeId: AGI };
const at = (weekId) => ({ ...tab, weekId });
const weekPath = (id) => `courseRuns/${RUN.agi}/weeks/${id}`;
const historyOf = (id) => world.db.paths().filter((path) => path.startsWith(`${weekPath(id)}/history/`)).sort().map((path) => world.db.read(path));
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));
const SETTINGS = { title: "How sure are you?", summary: "", pitching: false, questions: [] };
/** The settings' fingerprint as a page reading the week now would send it. */
function baseOf(weekId) {
  const raw = world.db.read(weekPath(weekId));
  if (!raw) return "0000000000000000";
  const week = normalizeCourseWeek(weekId, raw);
  return settingsFingerprint({ title: week.title, summary: week.summary, pitching: week.pitching, questions: week.questions });
}
/** A save from a page read now, unless the body says its own base. */
const save = (who, weekId, body, extra = {}) =>
  call(who, settingsRoute.PUT, { runId: RUN.agi, weekId }, { body: body && typeof body === "object" && !("base" in body) && "title" in body ? { base: baseOf(weekId), ...body } : body, course: true, ...extra });
/** The props a page handed the element that carries `key`, found anywhere in what it drew. */
function propsWith(element, key) {
  if (!element || typeof element !== "object") return null;
  if (Array.isArray(element)) {
    for (const each of element) {
      const found = propsWith(each, key);
      if (found) return found;
    }
    return null;
  }
  if (element.props && key in element.props) return element.props;
  return propsWith(element.props?.children, key);
}
const unpublish = (who, weekId, extra = {}) => call(who, publishedRoute.PATCH, { runId: RUN.agi, weekId }, { body: { published: false }, course: true, ...extra });
const STAYS = (n) => `People have started week ${n}, so it stays published. Change its blocks instead: each save is kept in its history.`;

/** A tick, with a rating, on a reading. */
function tick(uid, itemId, weekNumber, { rating = null, completed = true } = {}) {
  world.db.seed(`courseProgress/${RUN.agi}__${uid}__${itemId}`, { runId: RUN.agi, uid, itemId, weekNumber, completed, ...(rating ? { rating } : {}) });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset(weeksTabSeed({ "users/april": { ...userDoc(CAST.april), permissions: CAST.april.permissions } }));
});

// ---------------------------------------------------------------------------
// 1. Course documents, first on the Weeks tab
// ---------------------------------------------------------------------------

describe("1. the Weeks tab's Course documents", () => {
  beforeEach(() => {
    world.db.seed(`courseFacilitatorGuide/${COURSE.agi}__handbook`, {
      courseId: COURSE.agi,
      slot: "handbook",
      title: "Facilitator handbook",
      blocks: [],
      updatedAt: new Date("2026-10-19T10:00:00Z"),
    });
  });

  test("an admin: all four, whose each is, which are loaded and when, before the list of weeks", async () => {
    const page = await draw("zach", TabPage, tab);
    for (const said of [
      "Course documents",
      "Admins load these",
      tabWords.DOCUMENTS_LEDE_ADMIN,
      "Start here This run’s · Not loaded Load",
      "Glossary This run’s · Not loaded Load",
      "Handbook The course’s · Loaded on Mon 19 Oct Replace",
      "Printables The course’s · Not loaded Load",
      "Weeks, in order",
    ]) {
      assert.ok(page.text.includes(said), `missing ${JSON.stringify(said)}\n${page.text}`);
    }
    assert.ok(page.text.indexOf("Course documents") < page.text.indexOf("Weeks, in order"), "the card is not first");
    // Every button waits for the page's script.
    for (const m of page.html.matchAll(/<button[^>]*aria-expanded="false"[^>]*>/g)) assert.match(m[0], /disabled=""/);
  });

  test("the programme's lead: the one line, and no row, Load or Replace on any of the four", async () => {
    const page = await draw("claudia", TabPage, tab);
    assert.ok(page.text.includes("Course documents: an admin loads these."), page.text);
    for (const absent of ["Start here", "Glossary", "Handbook", "Printables", "This run’s", "The course’s", "Admins load these", "Replace"]) {
      assert.ok(!page.text.includes(absent), absent);
    }
    assert.ok(!/<button[^>]*>(<span>)?Load(<\/span>)?<\/button>/.test(page.html), "a lead is offered Load");
    assert.ok(page.text.indexOf("Course documents: an admin loads these.") < page.text.indexOf("Weeks, in order"));
  });

  test("nobody else is shown the card: the tab's own gate answers them first", async () => {
    for (const [who, what] of ALL) {
      if (who === "zach" || who === "claudia") continue;
      const page = await draw(who, TabPage, tab);
      assert.ok(!page.text.includes("Course documents"), what);
      if (who === "lloyd") assert.match(page.text, /Only the programme’s lead and admins can open Weeks/);
      // The admissions pages admit a course approver, and the programme's own gate finds no role for them on it.
      else if (who === "tess" || who === "april") assert.match(page.text, /There is no programme here/, what);
      else assert.equal(page.to, "/dashboard", what);
    }
  });

  test("drawing the card writes nothing", async () => {
    const before = everything();
    await draw("zach", TabPage, tab);
    await draw("claudia", TabPage, tab);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. This week's settings: the page and the route
// ---------------------------------------------------------------------------

describe("2. this week's settings", () => {
  test("the page: the drawn fields under Owner and This week is, the guide box, then the press; no minutes box", async () => {
    for (const who of ["claudia", "zach"]) {
      const page = await draw(who, WeekPage, at("w03"));
      const settings = /<section[^>]*aria-labelledby="week-settings-title"[^>]*>([\s\S]*?)<\/section>/.exec(page.html)?.[0] ?? "";
      const text = settings.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const order = ["Owner", "This week is", "Title", "A paste sets it too.", "Summary", "A line or two about the week.", "This is pitching week", "Its pitches show on Groups, Pitches.", "Questions to think about", words.QUESTIONS_HINT, "Add a question", "Facilitator guide", "Save the week’s settings"];
      let from = 0;
      for (const said of order) {
        const found = text.indexOf(said, from);
        assert.ok(found >= 0, `${who}: ${JSON.stringify(said)} missing or out of order\n${text}`);
        from = found;
      }
      for (const absent of ["How long it takes", "Minutes", "facilitators can change their own group’s copy"]) assert.ok(!page.text.includes(absent), `${who}: ${absent}`);
      const box = /<input[^>]*id="week-title-w03"[^>]*>/.exec(page.html)?.[0] ?? "";
      assert.match(box, /value="How sure are you\?"/, box);
      assert.match(box, /maxLength="120"|maxlength="120"/, box);
      assert.match(settings, /<button[^>]*disabled=""[^>]*>Save the week’s settings<\/button>/);
    }
  });

  test("a week with no page offers none of them", async () => {
    await world.db.collection(`courseRuns/${RUN.agi}/weeks`).doc("w06").delete();
    const page = await draw("claudia", WeekPage, at("w06"));
    for (const absent of ["Save the week’s settings", "Questions to think about", "Published", "How it landed"]) assert.ok(!page.text.includes(absent), absent);
  });

  test("who may save: the lead and an admin; everybody else one 403, a view-as session first, nobody signed out", async () => {
    const body = { ...SETTINGS, title: "Who decides" };
    for (const [who, what] of ALL) {
      w.reset(weeksTabSeed({ "users/april": { ...userDoc(CAST.april), permissions: CAST.april.permissions } }));
      const answer = await save(who, "w04", body);
      if (who === null) assert.equal(answer.status, 401, what);
      else if (who === "zach" || who === "claudia") assert.equal(answer.status, 200, `${what}: ${JSON.stringify(answer.body)}`);
      else assert.deepEqual([answer.status, answer.body.error], [403, words.SETTINGS_NOT_YOURS], what);
    }
    const before = everything();
    assert.equal((await save("zach", "w04", body, { viewAs: true })).status, 403);
    assert.equal(everything(), before, "a view-as save wrote");
  });

  test("the body's shape is checked before the gate; a week on another run, a week with no page and no week at all are refused", async () => {
    for (const who of ["chloe", "claudia"]) {
      for (const bad of [{}, { ...SETTINGS, pitching: "yes" }, { ...SETTINGS, title: 3 }, { title: "x", summary: "", pitching: false }]) {
        assert.equal((await save(who, "w04", bad)).status, 400, `${who}: ${JSON.stringify(bad)}`);
      }
    }
    assert.equal((await call("claudia", settingsRoute.PUT, { runId: RUN.tais, weekId: "w01" }, { body: { ...SETTINGS, base: "0000000000000000" }, course: true })).status, 403, "another programme's run");
    assert.equal((await call("tess", settingsRoute.PUT, { runId: RUN.agi, weekId: "w01" }, { body: { ...SETTINGS, base: baseOf("w01") }, course: true })).status, 403, "the lead of another programme");
    await world.db.collection(`courseRuns/${RUN.agi}/weeks`).doc("w06").delete();
    assert.deepEqual([(await save("claudia", "w06", SETTINGS)).status, (await save("claudia", "w06", SETTINGS)).body.error], [404, "Week 6 has no page on this run yet."]);
    assert.equal((await save("claudia", "w09", SETTINGS)).status, 404);
    for (const weekId of ["w00", "w3", "x"]) assert.equal((await save("zach", weekId, SETTINGS)).status, 404, weekId);
  });

  test("each field's checks, in the older editor's words and the rules' limits; a refusal writes nothing", async () => {
    const before = everything();
    const cases = [
      [{ title: "   " }, words.TITLE_EMPTY],
      [{ title: "x".repeat(121) }, words.TITLE_LONG],
      [{ summary: "y".repeat(1001) }, words.SUMMARY_LONG],
      [{ questions: "one" }, "questions must be a list."],
      [{ questions: ["a", "b", "c", "d", "e", "f"] }, "A week holds at most 5 questions."],
      [{ questions: ["Fine", "  "] }, "Question 2 is empty. Write it, or remove it."],
      [{ questions: [5] }, "Each question must be text."],
      [{ questions: ["q".repeat(161)] }, "Questions must be 160 characters or fewer."],
    ];
    for (const [over, error] of cases) {
      const answer = await save("claudia", "w03", { ...SETTINGS, ...over });
      assert.deepEqual([answer.status, answer.body.error], [400, error], JSON.stringify(over));
    }
    assert.equal(everything(), before);
    // At the limits, each is taken, and a question is kept as one line.
    const answer = await save("claudia", "w04", { title: "t".repeat(120), summary: "s".repeat(1000), pitching: false, questions: ["  Two\nlines  ", "q".repeat(160)] });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(world.db.read(weekPath("w04")).questions, ["Two lines", "q".repeat(160)]);
  });

  test("a save that changes nothing writes nothing and says so", async () => {
    const before = everything();
    const answer = await save("claudia", "w03", { ...SETTINGS, title: "  How sure are you?  " });
    assert.deepEqual([answer.status, answer.body.saved, answer.body.message], [200, false, "Nothing changed, so nothing was saved."]);
    assert.equal(everything(), before);
  });

  test("a save writes the changed fields and a line in the week's history, and leaves the blocks, Ready, every group's copy and everybody's mail alone", async () => {
    world.db.seed(`courseGroups/${B}/weeks/w03`, { weekNumber: 3, title: "How sure are you?", summary: "B's own", questions: ["B's own question"], published: true, materials: [] });
    const stored = world.db.read(weekPath("w03"));
    const pathsBefore = new Set(world.db.paths());
    const answer = await save("claudia", "w03", { ...SETTINGS, title: "Who decides", questions: ["Who should decide how fast AI is built?", "What would change your mind?"] });
    assert.deepEqual([answer.status, answer.body.saved], [200, true], JSON.stringify(answer.body));
    const after = world.db.read(weekPath("w03"));
    assert.equal(after.title, "Who decides");
    assert.deepEqual(after.questions, ["Who should decide how fast AI is built?", "What would change your mind?"]);
    assert.equal(after.updatedByUid, "claudia");
    assert.deepEqual(after.blocks, stored.blocks, "the blocks changed");
    assert.deepEqual([after.published, after.ready, after.pitching], [stored.published, stored.ready, stored.pitching]);
    assert.deepEqual(world.db.read(`courseGroups/${B}/weeks/w03`).questions, ["B's own question"], "a group's own copy was touched");
    // The history: the week as found first (it had none), then the settings line, by the lead.
    const history = historyOf("w03");
    assert.deepEqual(history.map((row) => [row.kind, row.byUid, row.summary, row.blockId, row.title]), [
      ["found", null, "The week before its first change here", null, "How sure are you?"],
      ["edit", "claudia", "This week’s settings: new title and questions", null, "Who decides"],
    ]);
    assert.deepEqual(history[1].blocks, stored.blocks);
    // Only the week and its history were written: no mail, no task, nothing else.
    const added = world.db.paths().filter((path) => !pathsBefore.has(path));
    assert.ok(added.every((path) => path.startsWith(`${weekPath("w03")}/history/`)), added.join("\n"));
    // A second save adds one line, the history already ending with the week as stored.
    const again = await save("zach", "w03", { ...SETTINGS, title: "Who decides", questions: after.questions, pitching: true });
    assert.equal(again.status, 200);
    assert.deepEqual(historyOf("w03").map((row) => row.summary).slice(2), ["This week’s settings: ticked as pitching week"]);
    assert.equal(world.db.read(weekPath("w03")).pitching, true);
    const page = await draw("claudia", WeekPage, at("w03"));
    assert.ok(page.text.includes("Week 3 is pitching week. Its pitches show on Groups, Pitches."), page.text);
  });

  test("a save from a page older than the settings as stored is refused, and writes nothing", async () => {
    const stale = baseOf("w03");
    assert.equal((await save("zach", "w03", { ...SETTINGS, questions: ["What would change your mind?"] })).status, 200);
    const before = everything();
    // The lead, on a page read before the admin's save, changes only the title.
    const answer = await save("claudia", "w03", { ...SETTINGS, base: stale, title: "Who decides" });
    assert.deepEqual([answer.status, answer.body.error], [409, words.SETTINGS_CHANGED]);
    assert.equal(everything(), before, "a stale save wrote");
    assert.deepEqual(world.db.read(weekPath("w03")).questions, ["What would change your mind?"], "the admin's questions were undone");
    // A save with no base, or a base that is not one, is refused before the gate.
    for (const who of ["chloe", "claudia"]) {
      for (const base of [undefined, "", "not-a-fingerprint"]) {
        const sent = await call(who, settingsRoute.PUT, { runId: RUN.agi, weekId: "w03" }, { body: { ...SETTINGS, ...(base === undefined ? {} : { base }) }, course: true });
        assert.deepEqual([sent.status, sent.body.error], [400, words.SETTINGS_BASE], `${who} ${String(base)}`);
      }
    }
  });

  test("a save while somebody else holds the week's lock is refused with the holder named; the holder's own save goes through", async () => {
    world.db.seed(`${weekPath("w03")}/editLock/current`, { holderUid: "zach", since: new Date(NOW), keptAt: new Date(NOW) });
    const before = everything();
    const answer = await save("claudia", "w03", { ...SETTINGS, title: "Who decides" });
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.match(answer.body.error, /is editing week 3, since .*\. You can read it; you can save once .* saves or leaves\./);
    assert.equal(everything(), before, "a save under somebody else's lock wrote");
    assert.equal((await save("zach", "w03", { ...SETTINGS, title: "Who decides" })).status, 200, "the holder is refused");
  });

  test("a stored title or summary with a space at an end is not rewritten by a save that leaves it alone", async () => {
    world.db.poke(weekPath("w04"), { summary: "A line about week 4. " });
    const answer = await save("claudia", "w04", { ...SETTINGS, title: "Week 4 readings, renamed", summary: "A line about week 4." });
    assert.equal(answer.status, 200);
    assert.equal(world.db.read(weekPath("w04")).summary, "A line about week 4. ", "the summary was rewritten");
  });

  test("a week changed where no history is kept is found again, as it stood, before the next settings line", async () => {
    assert.equal((await save("claudia", "w03", { ...SETTINGS, title: "Who decides" })).status, 200);
    const blocks = world.db.read(weekPath("w03")).blocks;
    world.db.poke(weekPath("w03"), { blocks: blocks.slice(0, -1) });
    assert.equal((await save("claudia", "w03", { ...SETTINGS, title: "Who decides now" })).status, 200);
    assert.deepEqual(historyOf("w03").map((row) => [row.kind, row.summary]).slice(2), [
      ["found", "The week as it stood, changed where no history is kept"],
      ["edit", "This week’s settings: new title"],
    ]);
  });

  test("drawing a week's page writes nothing", async () => {
    const before = everything();
    for (const who of ["claudia", "zach"]) for (const weekId of ["w01", "w03", "w04", "w06"]) await draw(who, WeekPage, at(weekId));
    assert.equal(everything(), before);
  });

  test("a week written before blocks saves its settings with no history line", async () => {
    const answer = await save("claudia", "w04", { ...SETTINGS, title: "Week 4, renamed", summary: "A line about week 4." });
    assert.equal(answer.status, 200);
    assert.deepEqual([world.db.read(weekPath("w04")).title, world.db.read(weekPath("w04")).summary], ["Week 4, renamed", "A line about week 4."]);
    assert.deepEqual(historyOf("w04"), []);
  });
});

// ---------------------------------------------------------------------------
// 2b. One pitching week
// ---------------------------------------------------------------------------

describe("2b. one pitching week", () => {
  const tickOn = (who, weekId) => save(who, weekId, { title: world.db.read(weekPath(weekId)).title, summary: world.db.read(weekPath(weekId)).summary ?? "", pitching: true, questions: world.db.read(weekPath(weekId)).questions ?? [] });
  const tickOff = (who, weekId) => save(who, weekId, { title: world.db.read(weekPath(weekId)).title, summary: world.db.read(weekPath(weekId)).summary ?? "", pitching: false, questions: world.db.read(weekPath(weekId)).questions ?? [] });
  const pitch = (id, weekId) =>
    world.db.seed(`coursePitches/${id}`, { runId: RUN.agi, courseId: COURSE.agi, groupId: B, weekId, weekNumber: Number(weekId.slice(1)), byUids: ["chloe"], wouldJoinUids: ["farah"] });

  test("ticking a week while another is ticked is refused, naming the week to untick", async () => {
    world.db.poke(weekPath("w03"), { pitching: true });
    const before = everything();
    const answer = await tickOn("claudia", "w04");
    assert.deepEqual([answer.status, answer.body.error], [409, "Week 3 is pitching week. Untick it there first."]);
    assert.equal(everything(), before);
  });

  test("once anybody has pitched or picked, pitching week can't be unticked, and another week can't take it", async () => {
    world.db.poke(weekPath("w04"), { pitching: true });
    pitch("p1", "w04");
    const before = everything();
    const off = await tickOff("claudia", "w04");
    assert.deepEqual([off.status, off.body.error], [409, words.PITCHING_IN_USE]);
    assert.equal(everything(), before);
    // No week ticked now (by hand), pitches made in week 4: ticking week 5 would move them out of sight.
    world.db.poke(weekPath("w04"), { pitching: false });
    const moved = await tickOn("zach", "w05");
    assert.deepEqual([moved.status, moved.body.error], [409, words.PITCHING_IN_USE]);
    // Ticking the week they were made in again is no move.
    assert.equal((await tickOn("claudia", "w04")).status, 200);
  });

  test("once a team is made, pitching week can't be unticked", async () => {
    world.db.poke(weekPath("w04"), { pitching: true });
    world.db.seed("courseTeams/t1", { runId: RUN.agi, name: "Team one", memberUids: ["chloe"] });
    const off = await tickOff("claudia", "w04");
    assert.deepEqual([off.status, off.body.error], [409, words.PITCHING_IN_USE]);
  });

  test("with nothing pitched and no team, a week is ticked and unticked", async () => {
    assert.equal((await tickOn("claudia", "w04")).status, 200);
    assert.equal(world.db.read(weekPath("w04")).pitching, true);
    assert.equal((await tickOff("claudia", "w04")).status, 200);
    assert.equal(world.db.read(weekPath("w04")).pitching, false);
  });

  test("the line under the tick names the week the pitching pages treat as pitching week, never a later week ticked too", async () => {
    world.db.poke(weekPath("w03"), { pitching: true });
    world.db.poke(weekPath("w04"), { pitching: true });
    const four = await draw("claudia", WeekPage, at("w04"));
    assert.ok(four.text.includes("This is pitching week Week 3 is pitching week."), four.text);
    assert.ok(!four.text.includes("Week 4 is pitching week"));
    const three = await draw("claudia", WeekPage, at("w03"));
    assert.ok(three.text.includes("Week 3 is pitching week. Its pitches show on Groups, Pitches."));
    world.db.poke(weekPath("w03"), { pitching: false });
    world.db.poke(weekPath("w04"), { pitching: false });
    assert.ok((await draw("claudia", WeekPage, at("w04"))).text.includes("This is pitching week Its pitches show on Groups, Pitches."));
  });
});

// ---------------------------------------------------------------------------
// 3. Published, and taking a week back
// ---------------------------------------------------------------------------

describe("3. Published and unpublishing", () => {
  const published = (page, weekId) => /<section[^>]*aria-labelledby="week-published-(w\d\d)"[^>]*>([\s\S]*?)<\/section>/.exec(page.html)?.[1] === weekId;

  test("nobody started: the drawn sentence and the press, for the lead and an admin; the press takes it back, and Mark ready is offered again", async () => {
    for (const who of ["claudia", "zach"]) {
      const page = await draw(who, WeekPage, at("w04"));
      assert.ok(published(page, "w04"), who);
      assert.ok(page.text.includes("Published Nobody has started week 4 yet. Unpublish week 4…"), `${who}\n${page.text}`);
    }
    const answer = await unpublish("claudia", "w04");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(world.db.read(weekPath("w04")).published, false);
    const page = await draw("claudia", WeekPage, at("w04"));
    assert.ok(!published(page, "w04"));
    assert.ok(page.text.includes("Week 4 isn’t published yet: marking it ready publishes it."));
    assert.ok(page.text.includes("Mark ready"));
  });

  test("somebody ticked, somebody wrote, or a session passed: the route's own sentence, no press, and the route refuses in it", async () => {
    const ways = [
      ["ticked", () => tick("chloe", "w4r1", 4)],
      ["wrote", () => world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w04__x4`, { runId: RUN.agi, uid: "chloe", weekId: "w04", exerciseId: "x4", text: "My answer." })],
      ["met", () => mock.timers.setTime(new Date("2026-11-20T12:00:00Z").getTime())],
    ];
    for (const [why, make] of ways) {
      mock.timers.setTime(NOW.getTime());
      w.reset(weeksTabSeed({ "users/april": { ...userDoc(CAST.april), permissions: CAST.april.permissions } }));
      make();
      const page = await draw("claudia", WeekPage, at("w04"));
      assert.ok(page.text.includes(`Published ${STAYS(4)}`), `${why}\n${page.text}`);
      assert.ok(!page.text.includes("Unpublish week"), why);
      const answer = await unpublish("claudia", "w04");
      assert.deepEqual([answer.status, answer.body.error], [409, STAYS(4)], why);
      assert.equal(world.db.read(weekPath("w04")).published, true, why);
    }
  });

  test("week 3, which most groups have met for, stays published", async () => {
    const page = await draw("zach", WeekPage, at("w03"));
    assert.ok(page.text.includes(`Published ${STAYS(3)}`), page.text);
  });

  test("week 1 open early to everybody holding a place: not refused while nobody has started it, as the route's rule says", async () => {
    mock.timers.setTime(new Date("2026-10-20T12:00:00Z").getTime());
    world.db.poke(weekPath("w01"), { published: true, ready: true, readyAt: new Date("2026-10-19T12:00:00Z"), readyByUid: "claudia" });
    const page = await draw("claudia", WeekPage, at("w01"));
    assert.ok(page.text.includes("Nobody has started week 1 yet. Unpublish week 1…"), page.text);
    // Open early (ready, decisions sent, groups not gone out): the question says what unpublishing closes.
    assert.equal(propsWith(page.element, "weekOneOpen")?.weekOneOpen, true);
    world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: new Date("2026-10-19T12:00:00Z") });
    assert.equal(propsWith((await draw("claudia", WeekPage, at("w01"))).element, "weekOneOpen")?.weekOneOpen, false, "groups have gone out");
    world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: null });
    assert.equal(propsWith((await draw("claudia", WeekPage, at("w04"))).element, "weekOneOpen")?.weekOneOpen, false, "week 4 is no week 1");
    const answer = await unpublish("claudia", "w01");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(world.db.read(weekPath("w01")).published, false);
  });
});

// ---------------------------------------------------------------------------
// 4. How it landed
// ---------------------------------------------------------------------------

describe("4. how it landed", () => {
  /** Two ratings on the first reading, three on the talk, nobody on the second reading. */
  function rate() {
    tick("chloe", "w4r1", 4, { rating: 4 });
    tick("farah", "w4r1", 4, { rating: 5 });
    tick("chloe", "w4v1", 4, { rating: 3, completed: false });
    tick("farah", "w4v1", 4, { rating: 4, completed: false });
    tick("kofi", "w4v1", 4, { rating: 5 });
  }

  test("only this week's readings, in the week's own order, and the partial line in plain words", () => {
    const rows = [{ itemId: "b" }, { itemId: "x" }, { itemId: "a" }];
    assert.deepEqual(words.landedRowsFor(rows, ["a", "b", "a", "gone"]).map((row) => row.itemId), ["a", "b"]);
    assert.equal(words.LANDED_PARTIAL, "This run has too many ticks and ratings to count at once, so these numbers are lower than the real ones.");
    assert.equal(words.notesCountWords(1), "1 note");
    assert.equal(words.notesCountWords(2), "2 notes");
  });

  test("the floor is three, and the lines say an average only from three", () => {
    assert.equal(RETRO_ANONYMITY_FLOOR, 3);
    assert.equal(words.landedLine({ avgRating: null, ratingCount: 2, completedCount: 9, enrolledCount: 23 }), "Rated by 2 so far · finished by 9 of 23");
    assert.equal(words.landedLine({ avgRating: 4.33, ratingCount: 3, completedCount: 14, enrolledCount: 23 }), "Rated 4.3 out of 5 by 3 · finished by 14 of 23");
    assert.equal(words.landedLine({ avgRating: null, ratingCount: 0, completedCount: 0, enrolledCount: 23 }), "Finished by 0 of 23");
  });

  test("this week's readings from the run's look back: two ratings, three ratings, and a reading nobody finished", async () => {
    rate();
    const answer = await call("claudia", retroRoute.GET, { runId: RUN.agi }, { course: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const rows = ["w4r1", "w4v1", "w4r2"].map((id) => answer.body.materials.find((row) => row.itemId === id));
    const n = answer.body.enrolledCount;
    assert.deepEqual(rows.map((row) => words.landedLine(row)), [
      `Rated by 2 so far · finished by 2 of ${n}`,
      `Rated 4.0 out of 5 by 3 · finished by 1 of ${n}`,
      `Finished by 0 of ${n}`,
    ]);
    // Not one rater's id or name anywhere in what the look back answers.
    const said = JSON.stringify(answer.body);
    for (const [uid, [name]] of Object.entries(PEOPLE)) {
      assert.ok(!said.includes(`"${uid}"`) && !said.includes(name), uid);
    }
  });

  test("who the look back admits: the lead and admins, who are shown the card, and the course's drafters and approvers and the run's track lead, who are not shown this page", async () => {
    for (const [who, what] of ALL) {
      const answer = await call(who, retroRoute.GET, { runId: RUN.agi }, { course: true });
      const admitted = ["zach", "claudia", "yusuf", "drew", "april"].includes(who);
      assert.equal(answer.status, who === null ? 401 : admitted ? 200 : 403, what);
    }
    for (const who of ["claudia", "zach"]) {
      const page = await draw(who, WeekPage, at("w04"));
      assert.ok(page.text.includes(`How it landed Staff only ${words.LANDED_LEDE}`), `${who}\n${page.text}`);
    }
  });

  test("the page's HTML names no member and carries no member's id, for the lead and for an admin", async () => {
    rate();
    for (const who of ["claudia", "zach"]) {
      for (const weekId of ["w03", "w04"]) {
        const page = await draw(who, WeekPage, at(weekId));
        for (const [uid, [name]] of Object.entries(PEOPLE)) {
          assert.ok(!page.html.includes(name), `${who} ${weekId}: ${name}`);
          assert.ok(!new RegExp(`\\b${uid}\\b`).test(page.html), `${who} ${weekId}: ${uid}`);
        }
      }
    }
  });
});
