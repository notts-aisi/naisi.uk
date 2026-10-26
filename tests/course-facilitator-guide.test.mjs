/**
 * A COURSE'S FACILITATOR GUIDE (each week's session plan and notes, and the
 * course's own documents), as every kind of caller: the gate, the loader's
 * route and the admin's page, the route a facilitator's Home asks, the
 * guide's three pages, the ticket on a facilitator's group page and Home's
 * link, and the course's destroy.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO READS IT. A facilitator of a live group on a run of the course, the
 *     lead of a programme naming a run of it, and admins; nobody taking part,
 *     no track lead, reviewer or facilitator of another course, nobody signed
 *     out. Each condition broken once: an archived group, an account that no
 *     longer stands, a group whose run is another course's, a run or a course
 *     mid-destroy, a lead replaced.
 *  2. WHO LOADS IT. Admins only, never in a view-as session, and what is saved
 *     is what was read, with nothing personal stored.
 *  3. EVERYBODY ELSE IS GIVEN ONE CALM ANSWER, the same words whether or not
 *     the course or the page is there.
 *  4. THE PAGES draw what the documents say, as text, never markup.
 *  5. THE LINKS appear exactly when the week has something loaded.
 *  6. THE COURSE'S DESTROY takes the guide with it, in its final batch.
 *
 * Real: see `tests/lib/facilitatorGuideWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { COURSE, NOW, RUN, TAIS_GROUP, find, loadCourseDestroy, makeFacilitatorGuideWorld } from "./lib/facilitatorGuideWorld.mjs";
import { FELLOW_WEEK_3, HANDBOOK, NOTES_W3, PLAN_W1, PLAN_W3, PRINTABLES } from "./lib/facilitatorGuideFixture.mjs";
import { B, C } from "./lib/facilitatorPagesWorld.mjs";
import { formPath } from "./lib/leadWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorGuideWorld("__facilitatorGuideSuite");
const { world, reset, seedGuide, load, index, coursePage, docPage, adminPage, gate, groupPage, homeWithGuide, stored, guide } = w;

const AGI_GUIDE = `/learn/facilitator-guide/${COURSE.agi}`;
const REFUSED = "Only a course’s facilitators, its programme’s lead and admins can open its facilitator guide.";

/** Everybody a suite asks as, and what they are on this term. */
const EVERYBODY = ["zach", "claudia", "tess", "rahul", "sofia", "tom", "grace", "ola", "lloyd", "yusuf", "amara", "chloe", "una", "nobody", null];

beforeEach(async () => {
  reset();
  await seedGuide();
});

// ---------------------------------------------------------------------------
// 1. Who reads it: the gate
// ---------------------------------------------------------------------------

describe("1. who reads a course's facilitator guide", () => {
  test("AGI Strategy's: an admin, its lead and the facilitators of its live groups; nobody else", async () => {
    const said = {};
    for (const who of EVERYBODY) said[who ?? "signed out"] = await gate(who);
    assert.deepEqual(said, {
      zach: "admin",
      claudia: "lead",
      tess: null,
      rahul: "facilitator",
      sofia: "facilitator",
      tom: "facilitator",
      grace: "facilitator",
      ola: null,
      lloyd: null,
      yusuf: null,
      amara: null,
      chloe: null,
      una: null,
      nobody: null,
      "signed out": null,
    });
  });

  test("Technical AI Safety's: its own lead and its own group's facilitator, and AGI Strategy's people are nobody there", async () => {
    const said = {};
    for (const who of EVERYBODY) said[who ?? "signed out"] = await gate(who, COURSE.tais);
    assert.deepEqual(said, {
      zach: "admin",
      claudia: null,
      tess: "lead",
      rahul: null,
      sofia: null,
      tom: null,
      grace: null,
      ola: "facilitator",
      lloyd: null,
      yusuf: null,
      amara: null,
      chloe: null,
      una: null,
      nobody: null,
      "signed out": null,
    });
  });

  test("an archived group no longer opens it: Rahul facilitates only Group B, Sofia still has Group A", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal(await gate("rahul"), null);
    assert.equal(await gate("sofia"), "facilitator");
  });

  test("being named on a group is not enough once the account no longer stands", async () => {
    world.db.poke("users/rahul", { role: "pending" });
    assert.equal(await gate("rahul"), null);
  });

  test("a group's own course field is not taken on trust: its run has to be a run of the course", async () => {
    // Group C says it is AGI Strategy's, and its run is Technical AI Safety's.
    world.db.poke(`courseGroups/${C}`, { runId: RUN.tais });
    assert.equal(await gate("tom"), null);
    assert.equal(await gate("tom", COURSE.tais), null);
  });

  test("a run mid-destroy opens it to nobody through that run; a course mid-destroy, to nobody at all", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal(await gate("rahul"), null);
    assert.equal(await gate("claudia"), null);
    assert.equal(await gate("zach"), "admin");
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: false });
    world.db.poke(`courses/${COURSE.agi}`, { destroying: true });
    for (const who of ["zach", "claudia", "rahul"]) assert.equal(await gate(who), null, who);
  });

  test("a lead replaced on the form, or a programme that stops naming the run, is nobody here from the next request", async () => {
    const form = world.db.read(formPath);
    const agi = Object.keys(form.programmes).find((id) => form.programmes[id].runId === RUN.agi);
    world.db.poke(formPath, { programmes: { ...form.programmes, [agi]: { ...form.programmes[agi], leadUid: "nadia" } } });
    assert.equal(await gate("claudia"), null);
    assert.equal(await gate("nadia"), "lead");
    world.db.poke(formPath, { programmes: { ...form.programmes, [agi]: { ...form.programmes[agi], runId: null } } });
    assert.equal(await gate("claudia"), null);
  });

  test("the loader's own gate: an admin, on an id that is one, and nobody else", () => {
    const writerFor = (who, courseId = COURSE.agi) => {
      const session = w.sessionFor(who);
      return session ? guide.access.facilitatorGuideWriter(session, courseId) : null;
    };
    for (const who of EVERYBODY.filter((one) => one !== null)) {
      assert.equal(writerFor(who) === null, who !== "zach", String(who));
    }
    assert.deepEqual({ ...writerFor("zach") }, { courseId: COURSE.agi });
    for (const courseId of ["a/b", "", ".."]) assert.equal(writerFor("zach", courseId), null, courseId);
  });

  test("a course that is not there, or an id that is not one, is nobody's: an admin's too", async () => {
    for (const courseId of ["no-such-course__c0urse99", "a/b", "", ".."]) {
      assert.equal(await gate("zach", courseId), null, courseId);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Who loads it: the loader's route
// ---------------------------------------------------------------------------

describe("2. the loader's route: admins only, and what is saved is what was read", () => {
  test("every method refuses everybody but an admin, and a view-as session, before anything is read", async () => {
    const before = JSON.stringify(stored().map((path) => world.db.read(path)));
    const said = {};
    for (const who of EVERYBODY) {
      said[who ?? "signed out"] = [
        (await load(who, "GET", "w03-plan")).status,
        (await load(who, "POST", "w03-plan", { markdown: PLAN_W3 })).status,
        (await load(who, "PUT", "w03-plan", { markdown: PLAN_W1 })).status,
      ];
    }
    const refused = Object.fromEntries(EVERYBODY.map((who) => [who ?? "signed out", who === null ? [401, 401, 401] : [403, 403, 403]]));
    assert.deepEqual(said, { ...refused, zach: [200, 200, 400] });
    // An admin viewing the site as somebody is refused both writes, as the
    // view-as guard answers, and nothing is written.
    assert.equal((await load("zach", "POST", "w03-plan", { markdown: PLAN_W3, viewAs: true })).status, 403);
    assert.equal((await load("zach", "PUT", "w03-plan", { markdown: PLAN_W3, viewAs: true })).status, 403);
    assert.equal(JSON.stringify(stored().map((path) => world.db.read(path))), before);
  });

  test("Read it answers what was found, what to check and what saving replaces, field by field, and writes nothing", async () => {
    const before = JSON.stringify(stored().map((path) => world.db.read(path)));
    const answer = await load("zach", "POST", "handbook", { markdown: HANDBOOK });
    assert.equal(answer.status, 200);
    assert.deepEqual(Object.keys(answer.body).sort(), ["checks", "found", "place", "problems", "replaces", "title"]);
    assert.equal(answer.body.place, "Handbook");
    assert.equal(answer.body.title, "Weather Fellowship: facilitator guide");
    assert.equal(answer.body.replaces, "Weather Fellowship: facilitator guide");
    assert.deepEqual(answer.body.problems, []);
    assert.deepEqual(
      answer.body.found.map((row) => [row.state, row.label, row.detail]),
      [
        ["found", "Title", "Weather Fellowship: facilitator guide"],
        ["check", "Byline", "Left out: Oct 25, 2026 · @ada example"],
        ["found", "Before the first heading", "1 paragraph"],
        ["found", "First things", "2 paragraphs, 1 list of boxes to tick, 1 block shown as written"],
      ],
    );
    assert.deepEqual(answer.body.checks, ["The byline under the title was left out (“Oct 25, 2026 · @ada example”): bylines aren’t page content."]);
    assert.equal(JSON.stringify(stored().map((path) => world.db.read(path))), before);
  });

  test("Save stores the document read, with the course and its place and nothing personal", async () => {
    const answer = await load("zach", "PUT", "w01-notes", { markdown: NOTES_W3.replace("Week 3 notes", "Week 1 notes") });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body, { saved: true, place: "Week 1 notes", title: "Week 1 notes: Reading the sky", blocks: 8 });
    const doc = world.db.read(`courseFacilitatorGuide/${COURSE.agi}__w01-notes`);
    assert.deepEqual(Object.keys(doc).sort(), ["blocks", "courseId", "slot", "title", "updatedAt", "weekNumber"]);
    assert.equal(doc.courseId, COURSE.agi);
    assert.equal(doc.slot, "w01-notes");
    assert.equal(doc.weekNumber, 1);
    assert.doesNotMatch(JSON.stringify(doc), /zach|@example\.com|Uid/);
  });

  test("Copy as Markdown gives back a document that, pasted again, is the same document", async () => {
    for (const slot of ["handbook", "printables", "w03-plan", "w03-notes"]) {
      const copied = await load("zach", "GET", slot);
      assert.equal(copied.status, 200, slot);
      const before = world.db.read(`courseFacilitatorGuide/${COURSE.agi}__${slot}`);
      assert.equal((await load("zach", "PUT", slot, { markdown: copied.body.markdown })).status, 200, slot);
      const after = world.db.read(`courseFacilitatorGuide/${COURSE.agi}__${slot}`);
      assert.deepEqual(after.blocks, before.blocks, slot);
      assert.equal(after.title, before.title, slot);
      // And the byline never comes back.
      assert.doesNotMatch(copied.body.markdown, /@ada example/, slot);
    }
    assert.equal((await load("zach", "GET", "w02-plan")).status, 404);
  });

  test("a document in the wrong place is refused, with a sentence that says where it goes", async () => {
    const said = async (slot, markdown) => {
      const answer = await load("zach", "PUT", slot, { markdown });
      return [answer.status, answer.body.error];
    };
    assert.deepEqual(await said("w04-plan", PLAN_W3), [400, "This is session 3’s plan, and you’re loading Week 4 session plan. Load it as Week 3 session plan, or change the title line."]);
    assert.deepEqual(await said("w03-plan", NOTES_W3), [400, "This is week 3’s notes, and you’re loading Week 3 session plan. Load it as Week 3 notes, or change the title line."]);
    assert.deepEqual(await said("handbook", PLAN_W3), [400, "This is session 3’s plan, and you’re loading Handbook. Load it as Week 3 session plan, or change the title line."]);
    assert.deepEqual(await said("w03-plan", FELLOW_WEEK_3), [400, "This is week 3 of the fellow guide, which goes in the run’s week, not in the facilitator guide."]);
    assert.deepEqual(await said("w03-plan", HANDBOOK), [400, "“Weather Fellowship: facilitator guide” is one of the course’s own documents, and you’re loading Week 3 session plan. Load it in its own place, or change the title line."]);
    // None of them reached the store.
    assert.equal(world.db.read(`courseFacilitatorGuide/${COURSE.agi}__w04-plan`), undefined);
    assert.match(world.db.read(`courseFacilitatorGuide/${COURSE.agi}__w03-plan`).title, /^Session 3/);
  });

  test("a body or an address the route cannot use is a 400 with a sentence; a course that is not there, a 404", async () => {
    assert.deepEqual([(await load("zach", "PUT", "w03-plan", { markdown: "   " })).status, (await load("zach", "PUT", "w03-plan", { markdown: "   " })).body.error], [400, "Paste the document’s Markdown first."]);
    assert.equal((await load("zach", "POST", "w03-plan")).status, 400);
    assert.equal((await load("zach", "POST", "w61-plan", { markdown: PLAN_W3 })).status, 400);
    assert.equal((await load("zach", "POST", "w3-plan", { markdown: PLAN_W3 })).status, 400);
    assert.equal((await load("zach", "POST", "preface", { markdown: PLAN_W3 })).status, 400);
    const long = await load("zach", "POST", "w03-plan", { markdown: `${PLAN_W3}${"x".repeat(250_000)}` });
    assert.equal(long.status, 400);
    assert.match(long.body.error, /can be at most 250000\.$/);
    assert.equal((await load("zach", "POST", "w03-plan", { markdown: PLAN_W3, courseId: "no-such-course__c0urse99" })).status, 404);
    assert.equal((await load("zach", "PUT", "w03-plan", { markdown: PLAN_W3, courseId: "no-such-course__c0urse99" })).status, 404);
    assert.equal((await load("zach", "GET", "w03-plan", { courseId: "no-such-course__c0urse99" })).status, 404);
    assert.deepEqual(stored().filter((path) => path.includes("no-such-course")), []);
  });
});

// ---------------------------------------------------------------------------
// 3. The route a facilitator's Home asks
// ---------------------------------------------------------------------------

describe("3. the guide's list of titles: the gate's three, one 403 for everybody else", () => {
  test("every caller, and the answer field by field, one course's documents only", async () => {
    // Technical AI Safety's guide has a week of its own, which AGI Strategy's never lists.
    await seedGuide(COURSE.tais, [["w01-plan", PLAN_W1]]);
    const said = {};
    for (const who of EVERYBODY) said[who ?? "signed out"] = (await index(who)).status;
    assert.deepEqual(said, {
      zach: 200,
      claudia: 200,
      tess: 403,
      rahul: 200,
      sofia: 200,
      tom: 200,
      grace: 200,
      ola: 403,
      lloyd: 403,
      yusuf: 403,
      amara: 403,
      chloe: 403,
      una: 403,
      nobody: 403,
      "signed out": 401,
    });
    assert.deepEqual((await index("amara")).body, { error: REFUSED });
    assert.deepEqual((await index("zach", "no-such-course__c0urse99")).body, { error: REFUSED });
    const answer = (await index("rahul")).body;
    assert.deepEqual(answer, {
      courseId: COURSE.agi,
      documents: [
        { key: "how-to-use", label: "How to use these plans", title: "Weather Fellowship: session plans" },
        { key: "handbook", label: "Handbook", title: "Weather Fellowship: facilitator guide" },
        { key: "case-studies", label: "Case studies and feedback", title: "Case studies and feedback" },
        { key: "printables", label: "Printables", title: "Printables" },
      ],
      weeks: [
        { weekNumber: 1, plan: "Session 1: First look", notes: null },
        { weekNumber: 3, plan: "Session 3: Reading the sky", notes: "Week 3 notes: Reading the sky" },
      ],
    });
    assert.deepEqual((await index("ola", COURSE.tais)).body, {
      courseId: COURSE.tais,
      documents: [],
      weeks: [{ weekNumber: 1, plan: "Session 1: First look", notes: null }],
    });
  });

  test("Home's reading of it: the weeks it names for this course, and nothing for any other answer", () => {
    const { guideWeeksFrom } = guide.hook;
    assert.deepEqual(guideWeeksFrom({ courseId: "c", weeks: [{ weekNumber: 1 }, { weekNumber: 3 }] }, "c"), { courseId: "c", weeks: [1, 3] });
    assert.equal(guideWeeksFrom({ courseId: "other", weeks: [{ weekNumber: 1 }] }, "c"), null);
    assert.equal(guideWeeksFrom({ courseId: "c", weeks: [] }, "c"), null);
    assert.equal(guideWeeksFrom({ error: REFUSED }, "c"), null);
    assert.deepEqual(guideWeeksFrom({ courseId: "c", weeks: [{ weekNumber: "2" }, { weekNumber: 0 }, { weekNumber: 4 }, null] }, "c"), { courseId: "c", weeks: [4] });
  });
});

// ---------------------------------------------------------------------------
// 4. The pages
// ---------------------------------------------------------------------------

describe("4. the guide's pages", () => {
  test("the course page: every week loaded and the course's own documents, for the gate's three; one calm answer for everybody else", async () => {
    const said = {};
    for (const who of EVERYBODY) {
      const drawn = await coursePage(who);
      assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
      said[who ?? "signed out"] = drawn.to ?? (drawn.text.includes(REFUSED) ? "refused" : "drawn");
    }
    const refused = Object.fromEntries(EVERYBODY.map((who) => [who ?? "signed out", "refused"]));
    assert.deepEqual(said, {
      ...refused,
      zach: "drawn",
      claudia: "drawn",
      rahul: "drawn",
      sofia: "drawn",
      tom: "drawn",
      grace: "drawn",
      "signed out": `/login?next=${encodeURIComponent(AGI_GUIDE)}`,
    });
    const drawn = await coursePage("rahul");
    assert.match(
      drawn.text,
      /AGI Strategy Fellowship Facilitator guide Only facilitators, the programme’s lead and admins see this\. Each week Week 1: First look Session plan Week 3: Reading the sky Session plan · Week notes For the whole course How to use these plans Weather Fellowship: session plans Handbook Weather Fellowship: facilitator guide Case studies and feedback Printables/,
    );
    for (const [href, label] of [[`${AGI_GUIDE}/week-1`, "Week 1"], [`${AGI_GUIDE}/week-3`, "Week 3"], [`${AGI_GUIDE}/handbook`, "Handbook"], [`${AGI_GUIDE}/printables`, "Printables"]]) {
      assert.match(drawn.html, new RegExp(`<a href="${href}" class="row">`), label);
    }
    // Titles only: not a word from under them.
    assert.doesNotMatch(drawn.text, /Aims\.|whiteboard|barometer/);
  });

  test("a course that is not there gives everybody the same calm answer, an admin included", async () => {
    for (const who of ["zach", "rahul", "amara"]) {
      const drawn = await coursePage(who, "no-such-course__c0urse99");
      assert.equal(drawn.to, null, who);
      assert.match(drawn.text, new RegExp(REFUSED), who);
      assert.equal(drawn.text, (await coursePage("amara")).text, who);
    }
  });

  test("week 3's page: the session plan, then the week's notes, as the documents say them", async () => {
    const drawn = await docPage("sofia", "week-3");
    assert.equal(drawn.wrote, false);
    assert.match(drawn.html, /<h1 class="title">Facilitator guide for week 3<\/h1>/);
    assert.match(drawn.text, /On this page Session plan Week notes Session plan Session 3: Reading the sky At a glance Aims\. Each person leaves/);
    assert.match(drawn.html, /<a href="#w03-plan" class="jump">Session plan<\/a><a href="#w03-notes" class="jump">Week notes<\/a>/);
    // The document's title heads its part, its sections are a level down.
    assert.match(drawn.html, /<h2 id="w03-plan-title" class="partTitle">Session 3: Reading the sky<\/h2>/);
    assert.match(drawn.html, /<h3 class="h3">Run sheet<\/h3>/);
    assert.match(drawn.html, /<h4 class="h4">Option A: Looking out<\/h4>/);
    // The run sheet is a table in a box of its own, which scrolls sideways.
    assert.match(drawn.html, /<div class="table"><table><thead><tr><th scope="col">Time<\/th><th scope="col">What happens<\/th>/);
    // Boxes to tick are drawn, never controls.
    assert.match(drawn.html, /<li class="checkItem"><span class="box" aria-hidden="true"><\/span><span class="checkText">One cloud atlas per pair \(Printables\)<\/span><\/li>/);
    assert.doesNotMatch(drawn.html, /<input|<button|<form/);
    // The notes quote their example answer, and a link opens beside the page.
    assert.match(drawn.html, /<blockquote class="quote">.*65% for rain by Friday lunchtime/);
    assert.match(drawn.html, /<a href="https:\/\/example\.org\/models" class="link" target="_blank" rel="noopener noreferrer">a short guide<\/a>/);
    assert.match(drawn.html, new RegExp(`<a href="${AGI_GUIDE}" class="footLink">Back to the facilitator guide</a>`));
  });

  test("a course document: its own title, the byline left out, its templates kept to the character", async () => {
    const handbook = await docPage("claudia", "handbook");
    assert.match(handbook.html, /<h1 class="title">Weather Fellowship: facilitator guide<\/h1>/);
    assert.match(handbook.html, /<h2 class="h2">First things<\/h2>/);
    assert.doesNotMatch(handbook.text, /@ada example|Oct 25, 2026/);
    assert.match(handbook.html, /<pre class="code"><code>Hello everyone, I&#x27;ll be running our group this term\.\n {3}Have a look at week 1 before we meet on Thursday\.<\/code><\/pre>/);
    const printables = await docPage("tom", "printables");
    assert.match(printables.html, /<pre class="code"><code>FRIDAY FORECAST {17}Name: ____________\n\nChance of rain: {2}____%<\/code><\/pre>/);
  });

  test("a week or a document with nothing loaded says so plainly to its readers; a page that is not one, likewise", async () => {
    assert.match((await docPage("rahul", "week-2")).text, /Facilitator guide for week 2 .*There’s no facilitator guide for week 2 yet\./);
    world.db.seed(`courses/${COURSE.tais}`, world.db.read(`courses/${COURSE.tais}`));
    assert.match((await docPage("ola", "handbook", COURSE.tais)).text, /“Handbook” isn’t in this facilitator guide yet\./);
    for (const segment of ["week-0", "week-03", "week-61", "preface", "w03-plan"]) {
      assert.match((await docPage("rahul", segment)).text, /There’s no such page in this facilitator guide\./, segment);
    }
  });

  test("everybody else is given the one calm answer on every page, whatever the address", async () => {
    for (const who of ["tess", "ola", "lloyd", "yusuf", "amara", "chloe", "una", "nobody"]) {
      for (const segment of ["week-3", "handbook", "preface"]) {
        const drawn = await docPage(who, segment);
        assert.equal(drawn.to, null, `${who} ${segment}`);
        assert.match(drawn.text, new RegExp(REFUSED), `${who} ${segment}`);
        assert.doesNotMatch(drawn.text, /Reading the sky|Weather Fellowship|AGI Strategy Fellowship/, `${who} ${segment}`);
      }
    }
    assert.equal((await docPage(null, "week-3")).to, `/login?next=${encodeURIComponent(`${AGI_GUIDE}/week-3`)}`);
  });

  test("a row written some other way is read through the same check: one whose id and fields disagree is nobody's", async () => {
    // A row filed under week 5's plan that says it is week 6's, and one that says it is another course's.
    world.db.seed(`courseFacilitatorGuide/${COURSE.agi}__w05-plan`, { courseId: COURSE.agi, slot: "w06-plan", weekNumber: 6, title: "Session 6: Misfiled", blocks: [{ type: "p", runs: [{ text: "Misfiled." }] }] });
    world.db.seed(`courseFacilitatorGuide/${COURSE.agi}__w07-plan`, { courseId: COURSE.agi, slot: "w08-plan", weekNumber: 8, title: "Session 8: Misfiled", blocks: [] });
    const weeks = (await index("rahul")).body.weeks.map((week) => week.weekNumber);
    assert.deepEqual(weeks, [1, 3]);
    assert.doesNotMatch((await docPage("rahul", "week-5")).text, /Misfiled/);
    assert.doesNotMatch((await docPage("rahul", "week-6")).text, /Misfiled/);
  });

  test("a row written some other way is drawn inside the caps: no heading past its level, no block of an unknown kind", async () => {
    world.db.seed(`courseFacilitatorGuide/${COURSE.agi}__w02-plan`, {
      courseId: COURSE.agi,
      slot: "w02-plan",
      weekNumber: 2,
      title: "Session 2: Written elsewhere",
      blocks: [
        { type: "heading", level: 9, runs: [{ text: "Too deep" }] },
        { type: "heading", level: 2, runs: [{ text: `Long ${"h".repeat(400)}` }] },
        { type: "script", text: "alert(1)" },
        { type: "p", runs: [{ text: "A link", href: "javascript:alert(1)" }] },
      ],
    });
    const drawn = await docPage("rahul", "week-2");
    assert.doesNotMatch(drawn.html, /Too deep|<h6|alert|javascript:/);
    assert.match(drawn.html, new RegExp(`<h3 class="h3">Long ${"h".repeat(295)}</h3>`));
    assert.match(drawn.text, /A link/);
  });

  test("text stays text: a picture, HTML and a link that is not https are left out, and said", async () => {
    const markdown = `${PLAN_W1}\n<script>alert(1)</script>\n\nSee [the notes](javascript:alert(1)) and ![a chart](https://example.com/c.png).\n`;
    const read = await load("zach", "POST", "w01-plan", { markdown });
    assert.deepEqual(read.body.problems, []);
    assert.deepEqual(read.body.checks, [
      "A link was left as words: a link has to start with https:// (or mailto: for an address). javascript:alert(1)",
      "1 picture was left out: the page shows no pictures.",
      "A piece of HTML was left out: write it as Markdown.",
    ]);
    assert.equal((await load("zach", "PUT", "w01-plan", { markdown })).status, 200);
    const drawn = await docPage("rahul", "week-1");
    assert.doesNotMatch(drawn.html, /<script|javascript:|<img/);
    assert.match(drawn.text, /See the notes and \./);
  });
});

// ---------------------------------------------------------------------------
// 5. The links to it
// ---------------------------------------------------------------------------

describe("5. the links: the group page's ticket and Home", () => {
  test("Group B's ticket links its week's guide, as wk-fac-group draws it, for its facilitators and an admin", async () => {
    for (const who of ["rahul", "sofia", "zach"]) {
      const drawn = await groupPage(who);
      const ticket = find(drawn.element, "FacilitatorTicket")[0]?.props;
      assert.deepEqual(ticket.guide, { href: `${AGI_GUIDE}/week-3`, label: "Facilitator guide for week 3" }, who);
      assert.match(drawn.html, new RegExp(`<a href="${AGI_GUIDE}/week-3" class="ticketGuide"><span>Facilitator guide for week 3</span><svg`), who);
      assert.match(drawn.text, /Take the register Facilitator guide for week 3/, who);
    }
  });

  test("no link when the ticket's week has nothing in the guide", async () => {
    reset();
    await seedGuide(COURSE.agi, [["w01-plan", PLAN_W1]]);
    const drawn = await groupPage("rahul");
    assert.equal(find(drawn.element, "FacilitatorTicket")[0]?.props.guide, null);
    assert.doesNotMatch(drawn.text, /Facilitator guide/);
  });

  test("Home says “Facilitator guide” under this week's title, leading to the week, when the week has some", async () => {
    const home = await homeWithGuide("rahul");
    assert.match(home.text, /This week Week 3 · Who decides what AGI means Facilitator guide 3 exercises to review/);
    assert.match(home.html, new RegExp(`<div class="weekGuide"><a href="${AGI_GUIDE}/week-3" class="textLink">Facilitator guide<svg`));
    reset();
    await seedGuide(COURSE.agi, [["w01-plan", PLAN_W1]]);
    assert.doesNotMatch((await homeWithGuide("rahul")).text, /Facilitator guide/);
  });
});

// ---------------------------------------------------------------------------
// 6. The admin's page
// ---------------------------------------------------------------------------

describe("6. the admin's loader page", () => {
  test("an admin is given every place, the course's weeks from its runs, and what is loaded in each", async () => {
    const drawn = await adminPage("zach");
    assert.equal(drawn.to, null);
    const slots = find(drawn.element, "FacilitatorGuideLoader")[0].props.slots;
    assert.deepEqual(
      slots.map((slot) => [slot.key, slot.label, slot.loaded]),
      [
        ["how-to-use", "How to use these plans", "Weather Fellowship: session plans"],
        ["handbook", "Handbook", "Weather Fellowship: facilitator guide"],
        ["case-studies", "Case studies and feedback", "Case studies and feedback"],
        ["printables", "Printables", "Printables"],
        ["w01-plan", "Week 1 session plan", "Session 1: First look"],
        ["w01-notes", "Week 1 notes", null],
        ["w02-plan", "Week 2 session plan", null],
        ["w02-notes", "Week 2 notes", null],
        ["w03-plan", "Week 3 session plan", "Session 3: Reading the sky"],
        ["w03-notes", "Week 3 notes", "Week 3 notes: Reading the sky"],
        ["w04-plan", "Week 4 session plan", null],
        ["w04-notes", "Week 4 notes", null],
        ["w05-plan", "Week 5 session plan", null],
        ["w05-notes", "Week 5 notes", null],
        ["w06-plan", "Week 6 session plan", null],
        ["w06-notes", "Week 6 notes", null],
      ],
    );
    // Under the Courses section's own heading: no page heading of its own.
    assert.doesNotMatch(drawn.html, /<h1/);
    assert.match(drawn.text, /Paste a document, then check it/);
  });

  test("everybody but an admin is sent to the dashboard, the lead and a facilitator included", async () => {
    for (const who of ["claudia", "rahul", "amara", "nobody"]) assert.equal((await adminPage(who)).to, "/dashboard", who);
  });
});

// ---------------------------------------------------------------------------
// 7. The week loader never takes it
// ---------------------------------------------------------------------------

describe("7. no week ever carries facilitator material", () => {
  test("the week loader refuses a session plan, a week's notes and the guide's own documents; a week reads as before", () => {
    const { readPastedWeek } = guide.paste;
    const read = (markdown) => readPastedWeek({ markdown, weekNumber: 3, stored: null }).problems;
    assert.match(read(PLAN_W3)[0], /^This is session 3’s plan, for facilitators\. Facilitator material never goes in a week, which anyone signed in can read: load it in the course’s facilitator guide\.$/);
    assert.match(read(NOTES_W3)[0], /^These are week 3’s notes for facilitators\./);
    assert.match(read(HANDBOOK)[0], /^“Weather Fellowship: facilitator guide” is one of the facilitator guide’s own documents\./);
    assert.match(read(PRINTABLES)[0], /^“Printables” is one of the facilitator guide’s own documents\./);
    // Retitled as a week, a session plan is still known by its headings.
    assert.match(read(PLAN_W3.replace("# Session 3: Reading the sky", "# Week 3: Reading the sky"))[0], /^“Run sheet” is a heading only facilitator material has\./);
    assert.deepEqual(read(FELLOW_WEEK_3), []);
  });
});

// ---------------------------------------------------------------------------
// 8. The course's destroy
// ---------------------------------------------------------------------------

describe("8. destroying a course takes its facilitator guide, in its final batch", () => {
  test("counted on the manifest, deleted with the course and its page, and no other course's touched", async () => {
    const { engine, makeCascadeDb } = await loadCourseDestroy();
    const id = "weather-fellowship__c0urse09";
    const db = makeCascadeDb({
      [`courses/${id}`]: { title: "Weather Fellowship", status: "archived" },
      [`coursePages/${id}`]: { headline: "Read the sky" },
      [`courseFacilitatorGuide/${id}__handbook`]: { courseId: id, slot: "handbook", title: "Handbook", blocks: [] },
      [`courseFacilitatorGuide/${id}__w03-plan`]: { courseId: id, slot: "w03-plan", title: "Session 3", blocks: [] },
      [`courseFacilitatorGuide/${COURSE.agi}__handbook`]: { courseId: COURSE.agi, slot: "handbook", title: "Handbook", blocks: [] },
    });
    assert.deepEqual(await engine.countCourseDestroyTargets(db, { id, title: "Weather Fellowship" }), {
      runs: 0,
      templates: 0,
      coursePages: 1,
      facilitatorGuide: 2,
    });
    const result = await engine.destroyCourseCascade(db, id, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.complete, true);
    assert.deepEqual(result.deleted, { courses: 1, coursePages: 1, facilitatorGuide: 2 });
    assert.deepEqual(db.batches, [
      [`courseFacilitatorGuide/${id}__handbook`, `courseFacilitatorGuide/${id}__w03-plan`, `coursePages/${id}`, `courses/${id}`],
    ]);
    assert.equal(db.has(`courseFacilitatorGuide/${COURSE.agi}__handbook`), true);
  });
});

// Ola's group belongs to Technical AI Safety's run, which is a run of that course.
test("the world: Technical AI Safety's group and run are that course's", () => {
  assert.equal(world.db.read(`courseGroups/${TAIS_GROUP}`).courseId, COURSE.tais);
  assert.equal(world.db.read(`courseRuns/${RUN.tais}`).courseId, COURSE.tais);
});
