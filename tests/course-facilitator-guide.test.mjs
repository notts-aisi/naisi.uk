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
 *  2. WHO LOADS IT. Admins every place, and the lead of a programme naming a
 *     live run of the course a week's session plan and notes alone (the
 *     Weeks tab's guide box): the course's own documents, shared by every
 *     run, are an admin's through the loader. Never in a view-as session, and
 *     what is saved is what was read, with nothing personal stored.
 *  3. EVERYBODY ELSE IS GIVEN ONE CALM ANSWER, the same words whether or not
 *     the course or the page is there.
 *  4. THE PAGES draw what the documents say, as text, never markup.
 *  5. THE LINKS: this week's appears exactly when the week has something
 *     loaded, and the guide's course page's whenever the guide has anything,
 *     so last week's guide is still reachable once the week has moved on.
 *  6. THE COURSE'S DESTROY takes the guide with it, in its final batch.
 *  7. SESSIONS AND WEEK NOTES, the two tabs over every week, are course
 *     documents like the others: the same route, gates, refusals and pages,
 *     shown at the top of the course page's "Each week".
 *
 * Real: see `tests/lib/facilitatorGuideWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { COURSE, NOW, RUN, TAIS_GROUP, find, loadCourseDestroy, makeFacilitatorGuideWorld, textOf } from "./lib/facilitatorGuideWorld.mjs";
import { FELLOW_WEEK_3, HANDBOOK, NOTES_W3, PLAN_W1, PLAN_W3, PRINTABLES, SESSIONS, WEEK_NOTES } from "./lib/facilitatorGuideFixture.mjs";
import { A, B, C } from "./lib/facilitatorPagesWorld.mjs";
import { formPath } from "./lib/leadWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorGuideWorld("__facilitatorGuideSuite");
const { world, reset, seedGuide, load, index, coursePage, docPage, adminPage, gate, groupPage, homeWithGuide, stored, guide } = w;

const AGI_GUIDE = `/learn/facilitator-guide/${COURSE.agi}`;
const REFUSED = "Only a course’s facilitators, its programme’s lead and admins can open its facilitator guide.";
/** The session card's sentence for AGI Strategy with nothing loaded: Claudia leads the programme. */
const NOTHING_LOADED = "There’s nothing in this course’s facilitator guide yet. Claudia or an admin loads it, and it will show here.";

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

  // The Weeks tab's "Facilitator guide" box is the
  // programme's lead's, so the writer admits the lead the reader admits as
  // the lead (a programme naming a live run of the course, standing as one),
  // as strictly as the reader does, and still nobody else.
  test("the loader's own gate: an admin on an id that is one, and the lead of a programme naming a live run of it; nobody else", async () => {
    const writerFor = async (who, courseId = COURSE.agi) => {
      const session = w.sessionFor(who);
      return session ? guide.access.facilitatorGuideWriter(world.courseDb, session, courseId) : null;
    };
    for (const who of EVERYBODY.filter((one) => one !== null)) {
      assert.equal((await writerFor(who)) === null, !["zach", "claudia"].includes(who), String(who));
    }
    // An admin's writer loads every place; a lead's, a week's session plan and notes alone.
    assert.deepEqual({ ...(await writerFor("zach")) }, { courseId: COURSE.agi, loads: "every place" });
    assert.deepEqual({ ...(await writerFor("claudia")) }, { courseId: COURSE.agi, loads: "weeks only" });
    // Tess leads Technical AI Safety's programme: she writes its guide's weeks, and never AGI Strategy's.
    assert.deepEqual({ ...(await writerFor("tess", COURSE.tais)) }, { courseId: COURSE.tais, loads: "weeks only" });
    assert.equal(await writerFor("claudia", COURSE.tais), null);
    for (const courseId of ["a/b", "", ".."]) {
      assert.equal(await writerFor("zach", courseId), null, courseId);
      assert.equal(await writerFor("claudia", courseId), null, courseId);
    }
    // A course that is not there, or is being destroyed, is never the lead's.
    assert.equal(await writerFor("claudia", "no-such-course__c0urse99"), null);
    world.db.poke(`courses/${COURSE.agi}`, { destroying: true });
    assert.equal(await writerFor("claudia"), null);
  });

  test("a lead who no longer stands as one, or whose programme stops naming the run, writes nothing from the next request", async () => {
    const writerFor = async (who) => guide.access.facilitatorGuideWriter(world.courseDb, w.sessionFor(who), COURSE.agi);
    world.db.poke("users/claudia", { role: "member", suRecognised: false });
    assert.equal(await writerFor("claudia"), null);
    reset();
    const form = world.db.read(formPath);
    const agi = Object.keys(form.programmes).find((id) => form.programmes[id].runId === RUN.agi);
    world.db.poke(formPath, { programmes: { ...form.programmes, [agi]: { ...form.programmes[agi], runId: null } } });
    assert.equal(await writerFor("claudia"), null);
  });

  test("a course that is not there, or an id that is not one, is nobody's: an admin's too", async () => {
    for (const courseId of ["no-such-course__c0urse99", "a/b", "", ".."]) {
      assert.equal(await gate("zach", courseId), null, courseId);
    }
  });

  // Publish asks the facilitators' door for a whole group, to say in the
  // email to its facilitators whether week 1's guide is on their group page.
  // The same bars as the door each of them opens there, without the person.
  test("the facilitators' door asked for a group: live, with a facilitator, on a live run of a live course, which is the run's and never the group's own", async () => {
    const door = (over = {}) => {
      const group = world.db.read(`courseGroups/${B}`);
      return guide.access.facilitatorGuideReaderForGroup(world.courseDb, { runId: group.runId, archived: group.archived === true, facilitatorUids: group.facilitatorUids, ...over });
    };
    assert.deepEqual({ ...(await door()) }, { courseId: COURSE.agi, courseTitle: "AGI Strategy Fellowship", as: "facilitator" });
    assert.equal(await door({ archived: true }), null);
    assert.equal(await door({ facilitatorUids: [] }), null);
    for (const runId of ["a/b", "", "..", "no-such-run__run00099"]) assert.equal(await door({ runId }), null, runId);
    // Ola's group is on Technical AI Safety's run: that run's course, whatever a group says of itself.
    assert.equal((await door({ runId: RUN.tais, facilitatorUids: ["ola"] })).courseId, COURSE.tais);
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal(await door(), null);
    reset();
    world.db.poke(`courses/${COURSE.agi}`, { destroying: true });
    assert.equal(await door(), null);
    reset();
    world.db.poke(`courseRuns/${RUN.agi}`, { courseId: "no-such-course__c0urse99" });
    assert.equal(await door(), null);
  });
});

// ---------------------------------------------------------------------------
// 2. Who loads it: the loader's route
// ---------------------------------------------------------------------------

describe("2. the loader's route: admins, and the programme's lead for a week's places, and what is saved is what was read", () => {
  // The programme's lead loads the course's guide from the Weeks tab's
  // "Facilitator guide" box, so the lead is answered as an
  // admin is; everybody else is refused as before, as strictly.
  test("every method refuses everybody but an admin and the programme's lead, and a view-as session, before anything is read", async () => {
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
    assert.deepEqual(said, { ...refused, zach: [200, 200, 400], claudia: [200, 200, 400] });
    // An admin viewing the site as somebody is refused both writes, as the
    // view-as guard answers, and nothing is written.
    assert.equal((await load("zach", "POST", "w03-plan", { markdown: PLAN_W3, viewAs: true })).status, 403);
    assert.equal((await load("zach", "PUT", "w03-plan", { markdown: PLAN_W3, viewAs: true })).status, 403);
    assert.equal(JSON.stringify(stored().map((path) => world.db.read(path))), before);
  });

  // The course's own documents are shared by every run of the course, so
  // through the loader they are an admin's alone; a week's session plan and
  // notes are the programme's lead's as well. Each kind of place, by each
  // kind of caller, on every method.
  test("each kind of place, by each kind of caller: a week's plan and notes for an admin and the lead, a course-wide document for an admin alone", async () => {
    const { COURSE_DOCUMENT_KEYS } = guide.model;
    const WEEK_SLOTS = ["w01-plan", "w01-notes", "w03-plan", "w03-notes"];
    assert.equal(COURSE_DOCUMENT_KEYS.length, 6, "the course-wide places this test tries are every one");
    const before = JSON.stringify(stored().map((path) => world.db.read(path)));
    const tried = async (who, slot) => {
      const answers = [
        await load(who, "GET", slot),
        // Read it with a document in its place, and Save with one no place takes, so nothing is written.
        await load(who, "POST", slot, { markdown: PLAN_W3 }),
        await load(who, "PUT", slot, { markdown: FELLOW_WEEK_3 }),
      ];
      return answers.map((answer) => [answer.status, answer.status === 403 || answer.status === 401 ? answer.body : null]);
    };
    const REFUSED_BODY = { error: "Forbidden" };
    for (const slot of [...COURSE_DOCUMENT_KEYS, ...WEEK_SLOTS]) {
      const admin = await tried("zach", slot);
      for (const [status] of admin) assert.ok(status !== 401 && status !== 403, `${slot}: an admin is refused (${status})`);
      for (const who of EVERYBODY) {
        const said = await tried(who, slot);
        if (who === "zach") continue;
        if (who === null) {
          assert.deepEqual(said.map(([status]) => status), [401, 401, 401], `${slot}: signed out`);
        } else if (who === "claudia" && WEEK_SLOTS.includes(slot)) {
          // A week's place: the lead is answered as an admin is.
          assert.deepEqual(said, admin, `${slot}: the programme's lead`);
        } else {
          // A course-wide place for the lead, and every place for everybody else: the one refusal, word for word.
          assert.deepEqual(said, [[403, REFUSED_BODY], [403, REFUSED_BODY], [403, REFUSED_BODY]], `${slot}: ${who}`);
        }
      }
    }
    assert.equal(JSON.stringify(stored().map((path) => world.db.read(path))), before);
    // The lead saves a week's notes, and is refused the Handbook with the document that belongs there.
    assert.equal((await load("claudia", "PUT", "w03-notes", { markdown: NOTES_W3 })).status, 200);
    const handbook = world.db.read(`courseFacilitatorGuide/${COURSE.agi}__handbook`);
    const refused = await load("claudia", "PUT", "handbook", { markdown: HANDBOOK.replace("facilitator guide", "facilitator guide, again") });
    assert.deepEqual([refused.status, refused.body], [403, REFUSED_BODY]);
    assert.deepEqual(world.db.read(`courseFacilitatorGuide/${COURSE.agi}__handbook`), handbook);
  });

  // The store asks the writer again, so a caller that skipped the route's
  // question still reads and writes nothing course-wide through a lead's writer.
  test("the store holds a lead's writer to a week's places: a course-wide read or write throws, and touches nothing", async () => {
    const lead = await guide.access.facilitatorGuideWriter(world.courseDb, w.sessionFor("claudia"), COURSE.agi);
    const admin = await guide.access.facilitatorGuideWriter(world.courseDb, w.sessionFor("zach"), COURSE.agi);
    const before = JSON.stringify(stored().map((path) => world.db.read(path)));
    const handbook = { kind: "course", key: "handbook" };
    await assert.rejects(guide.store.readGuideSlot(world.courseDb, lead, handbook));
    await assert.rejects(guide.store.saveGuideSlot(world.courseDb, lead, handbook, { title: "Handbook", blocks: [] }));
    await assert.rejects(guide.store.readCourseDocumentsLoaded(world.courseDb, lead, ["handbook", "printables"]));
    assert.equal(JSON.stringify(stored().map((path) => world.db.read(path))), before);
    // A week's place reads through the lead's writer, and the course's through an admin's.
    assert.match((await guide.store.readGuideSlot(world.courseDb, lead, { kind: "week", weekNumber: 3, part: "plan" })).title, /^Session 3/);
    assert.equal((await guide.store.readGuideSlot(world.courseDb, admin, handbook)).title, "Weather Fellowship: facilitator guide");
    assert.deepEqual(
      (await guide.store.readCourseDocumentsLoaded(world.courseDb, admin, ["handbook"])).map((row) => [row.key, row.title]),
      [["handbook", "Weather Fellowship: facilitator guide"]],
    );
    // What the gate answers, place by place.
    for (const key of guide.model.COURSE_DOCUMENT_KEYS) {
      assert.equal(guide.access.writerLoads(lead, { kind: "course", key }), false, key);
      assert.equal(guide.access.writerLoads(admin, { kind: "course", key }), true, key);
    }
    for (const part of ["plan", "notes"]) {
      assert.equal(guide.access.writerLoads(lead, { kind: "week", weekNumber: 1, part }), true, part);
      assert.equal(guide.access.writerLoads(admin, { kind: "week", weekNumber: 60, part }), true, part);
    }
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

  // Home reads the route's answer as one of the session card's three
  // (`guideReadOfAnswer`): failed, nothing loaded, or the weeks loaded.
  const FAILED = { kind: "failed" };
  const EMPTY = { kind: "empty" };
  const loaded = (...weeks) => ({ kind: "loaded", weeks });

  test("Home's reading of it: the weeks it names for this course, failed for an answer about another course or a refusal, and nothing loaded for none", () => {
    const { guideReadOfAnswer } = guide.links;
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "c", weeks: [{ weekNumber: 1 }, { weekNumber: 3 }] }, "c"), loaded(1, 3));
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "other", weeks: [{ weekNumber: 1 }] }, "c"), FAILED);
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "c", weeks: [] }, "c"), EMPTY);
    assert.deepEqual(guideReadOfAnswer(false, { error: REFUSED }, "c"), FAILED);
    assert.deepEqual(guideReadOfAnswer(true, { error: REFUSED }, "c"), FAILED);
    // A not-ok answer is failed whatever its body says.
    assert.deepEqual(guideReadOfAnswer(false, { courseId: "c", weeks: [{ weekNumber: 1 }] }, "c"), FAILED);
    assert.deepEqual(guideReadOfAnswer(true, null, "c"), FAILED);
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "c", weeks: [{ weekNumber: "2" }, { weekNumber: 0 }, { weekNumber: 4 }, null] }, "c"), loaded(4));
  });

  test("Home's reading of it: the course's own documents alone are something loaded, with no week to link; nothing is nothing", async () => {
    const { guideReadOfAnswer } = guide.links;
    const handbook = { key: "handbook", label: "Handbook", title: "Weather Fellowship: facilitator guide" };
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "c", documents: [handbook], weeks: [] }, "c"), loaded());
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "c", documents: [], weeks: [] }, "c"), EMPTY);
    // A document counts only by a key the guide has; another course's answer, or one with no weeks, is not this course's guide.
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "c", documents: [{ key: "preface" }, { label: "Handbook" }, null, "handbook"], weeks: [] }, "c"), EMPTY);
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "other", documents: [handbook], weeks: [] }, "c"), FAILED);
    assert.deepEqual(guideReadOfAnswer(true, { courseId: "c", documents: [handbook] }, "c"), FAILED);
    // The route's own answers, read the same way.
    const read = async (who) => {
      const answer = await index(who);
      return guideReadOfAnswer(answer.status === 200, answer.body, COURSE.agi);
    };
    assert.deepEqual(await read("rahul"), loaded(1, 3));
    reset();
    await seedGuide(COURSE.agi, [["handbook", HANDBOOK]]);
    assert.deepEqual(await read("rahul"), loaded());
    reset();
    assert.deepEqual(await read("rahul"), EMPTY);
    assert.deepEqual(await read("amara"), FAILED);
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
    // The card for Group B's session tonight, then every week of the course: the two not loaded are said so.
    assert.match(
      drawn.text,
      /AGI Strategy Fellowship Facilitator guide Only facilitators, the programme’s lead and admins see this\. Your next session Week 3: Reading the sky Group B · Tue 17 Nov, 6pm Open week 3’s plan Each week Week 1: First look Session plan Week 2: Week 2 readings Not loaded yet Week 3: Reading the sky Session plan · Week notes Week 4 Not loaded yet Week 5 Not loaded yet Week 6 Not loaded yet For the whole course How to use these plans Weather Fellowship: session plans Handbook Weather Fellowship: facilitator guide Case studies and feedback Printables/,
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

  // The blank lines at a template's end are the room under its last line. A
  // browser draws no line after the last line break in a `pre`, so the page
  // is given one more, and every blank line shows.
  test("a template keeps the room under its last line: saved, drawn, copied out and pasted back exactly", async () => {
    const markdown = "# Printables\n\n## Session 1: the card\n\n```markdown\nCARD\nWhat would you ask the group:\n\n```\n\n## Session 2: the brief\n\n```\nOne question for the speaker:\n\n\n\n```\n";
    assert.equal((await load("zach", "PUT", "printables", { markdown })).status, 200);
    const path = `courseFacilitatorGuide/${COURSE.agi}__printables`;
    const saved = world.db.read(path).blocks;
    assert.deepEqual(
      saved.filter((block) => block.type === "code").map((block) => block.text),
      ["CARD\nWhat would you ask the group:\n", "One question for the speaker:\n\n\n"],
    );
    for (const who of ["zach", "claudia", "tom"]) {
      const page = await docPage(who, "printables");
      assert.match(page.html, /<pre class="code"><code>CARD\nWhat would you ask the group:\n\n<\/code><\/pre>/, who);
      assert.match(page.html, /<pre class="code"><code>One question for the speaker:\n\n\n\n<\/code><\/pre>/, who);
    }
    // Copied out by an admin as it was pasted, and pasted back the same. A
    // course-wide place is an admin's alone through the loader: the
    // programme's lead reads it on the guide's page above, and is refused here.
    assert.equal((await load("claudia", "GET", "printables")).status, 403);
    const copied = await load("zach", "GET", "printables");
    assert.equal(copied.status, 200);
    assert.ok(copied.body.markdown.includes("```markdown\nCARD\nWhat would you ask the group:\n\n```"), copied.body.markdown);
    assert.ok(copied.body.markdown.includes("```\nOne question for the speaker:\n\n\n\n```"), copied.body.markdown);
    assert.equal((await load("zach", "PUT", "printables", { markdown: copied.body.markdown })).status, 200);
    assert.deepEqual(world.db.read(path).blocks, saved);
    // Everybody the guide refuses sees none of it.
    for (const who of ["amara", "tess", null]) assert.doesNotMatch((await docPage(who, "printables")).html ?? "", /What would you ask/, String(who));
  });

  test("a week or a document with nothing loaded says so plainly to its readers; a page that is not one, likewise", async () => {
    assert.match((await docPage("rahul", "week-2")).text, /Facilitator guide for week 2 .*Week 2’s plan isn’t in the guide yet\./);
    assert.doesNotMatch((await docPage("rahul", "week-2")).text, /There’s no facilitator guide for week/);
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
  test("Group B's ticket links its week's guide and the guide's course page, as the facilitator's group page draws it, for its facilitators and an admin", async () => {
    for (const who of ["rahul", "sofia", "zach"]) {
      const drawn = await groupPage(who);
      const ticket = find(drawn.element, "FacilitatorTicket")[0]?.props;
      assert.deepEqual(ticket.guide, { href: `${AGI_GUIDE}/week-3`, label: "Facilitator guide for week 3" }, who);
      assert.deepEqual(ticket.guideContents, { href: AGI_GUIDE, label: "Facilitator guide" }, who);
      assert.match(
        drawn.html,
        new RegExp(`<a href="${AGI_GUIDE}/week-3" class="ticketGuide"><span>Facilitator guide for week 3</span><svg[^>]*><path[^>]*></path></svg></a><a href="${AGI_GUIDE}" class="ticketGuide"><span>Facilitator guide</span><svg`),
        who,
      );
      assert.match(drawn.text, /Take the register Facilitator guide for week 3 Facilitator guide/, who);
    }
  });

  // What the facilitators' email at Publish promises ("Their names and week
  // 1’s guide are on your group page.", tests/course-hub-publish-routes.test.mjs
  // section 8) is what this page shows: before the group first meets its
  // ticket is week 1's, and links week 1's guide when the guide has it.
  test("before Group B first meets, its ticket is week 1's and links week 1's guide when the guide has it; once it has met, it does not, and the guide's course page stays linked throughout", async (t) => {
    t.after(() => w.at(NOW));
    w.at("2026-10-28T12:00:00Z");
    for (const who of ["rahul", "sofia"]) {
      const ticket = find((await groupPage(who)).element, "FacilitatorTicket")[0]?.props;
      assert.equal(ticket.facts.weekNumber, 1, who);
      assert.deepEqual(ticket.guide, { href: `${AGI_GUIDE}/week-1`, label: "Facilitator guide for week 1" }, who);
      assert.deepEqual(ticket.guideContents, { href: AGI_GUIDE, label: "Facilitator guide" }, who);
    }
    // No week 1 in the guide: no link to week 1, and the course page, which has week 3, is linked.
    reset();
    await seedGuide(COURSE.agi, [["w03-plan", PLAN_W3]]);
    w.at("2026-10-28T12:00:00Z");
    const without = find((await groupPage("rahul")).element, "FacilitatorTicket")[0]?.props;
    assert.equal(without.guide, null);
    assert.deepEqual(without.guideContents, { href: AGI_GUIDE, label: "Facilitator guide" });
    // Group B met on Tue 3 Nov, 6pm to 8pm: the next morning its ticket is week 2's, and week 1's guide is linked no more;
    // the guide's course page, which lists week 1, still is.
    reset();
    await seedGuide();
    w.at("2026-11-04T09:00:00Z");
    const after = await groupPage("rahul");
    const ticket = find(after.element, "FacilitatorTicket")[0]?.props;
    assert.equal(ticket.facts.weekNumber, 2);
    assert.equal(ticket.guide, null);
    assert.deepEqual(ticket.guideContents, { href: AGI_GUIDE, label: "Facilitator guide" });
    assert.match(after.html, new RegExp(`<a href="${AGI_GUIDE}" class="ticketGuide"><span>Facilitator guide</span><svg`));
    assert.doesNotMatch(after.text, /Facilitator guide for week/);
    // And the page it leads to lists week 1, for the same facilitator.
    assert.match((await coursePage("rahul")).text, /Each week Week 1: First look Session plan/);
  });

  test("no link to the ticket's week when it has nothing in the guide; the guide's course page is linked still", async () => {
    reset();
    await seedGuide(COURSE.agi, [["w01-plan", PLAN_W1]]);
    const drawn = await groupPage("rahul");
    const ticket = find(drawn.element, "FacilitatorTicket")[0]?.props;
    assert.equal(ticket.guide, null);
    assert.doesNotMatch(drawn.text, /Facilitator guide for week/);
    assert.doesNotMatch(drawn.html, new RegExp(`href="${AGI_GUIDE}/`));
    assert.deepEqual(ticket.guideContents, { href: AGI_GUIDE, label: "Facilitator guide" });
    assert.match(drawn.html, new RegExp(`<a href="${AGI_GUIDE}" class="ticketGuide"><span>Facilitator guide</span><svg`));
    assert.equal(drawn.text.match(/Facilitator guide/g)?.length, 1);
    // In the week's link's place, the sentence saying so and who loads it, before the course page's link.
    assert.equal(ticket.guideSentence, "Week 3’s plan isn’t in the guide yet. Claudia or an admin loads it.");
    assert.match(drawn.text, /Take the register Week 3’s plan isn’t in the guide yet\. Claudia or an admin loads it\. Facilitator guide/);
  });

  test("the course's own documents alone are linked by the guide's course page, and nothing loaded links nothing and says so", async () => {
    reset();
    await seedGuide(COURSE.agi, [["handbook", HANDBOOK]]);
    const documentsOnly = await groupPage("rahul");
    const ticket = find(documentsOnly.element, "FacilitatorTicket")[0]?.props;
    assert.equal(ticket.guide, null);
    assert.deepEqual(ticket.guideContents, { href: AGI_GUIDE, label: "Facilitator guide" });
    // Week 3 is not loaded, and something is: the sentence where its link would be, then the course page.
    assert.equal(ticket.guideSentence, "Week 3’s plan isn’t in the guide yet. Claudia or an admin loads it.");
    const home = await homeWithGuide("rahul");
    assert.match(
      home.html,
      new RegExp(`<div class="weekGuide"><p class="guideSentence">Week 3’s plan isn’t in the guide yet\\. Claudia or an admin loads it\\.</p><a href="${AGI_GUIDE}" class="textLink">Facilitator guide<svg`),
    );
    assert.doesNotMatch(home.text, /Facilitator guide for week/);

    reset();
    const nothing = await groupPage("rahul");
    const bare = find(nothing.element, "FacilitatorTicket")[0]?.props;
    assert.equal(bare.guide, null);
    assert.equal(bare.guideContents, null);
    // One sentence in place of both links, naming the programme's lead.
    assert.equal(bare.guideSentence, NOTHING_LOADED);
    assert.match(nothing.text, new RegExp(`Take the register ${NOTHING_LOADED.replace(/[.]/g, "\\.")}`));
    assert.doesNotMatch(nothing.text, /Facilitator guide/);
    assert.doesNotMatch(nothing.html, /facilitator-guide/);
    const bareHome = await homeWithGuide("rahul");
    assert.doesNotMatch(bareHome.text, /Facilitator guide/);
    assert.doesNotMatch(bareHome.html, /facilitator-guide/);
    assert.match(bareHome.text, new RegExp(`This week Week 3 · Who decides what AGI means ${NOTHING_LOADED.replace(/[.]/g, "\\.")}`));
  });

  test("Home, under this week's title: “Facilitator guide for week 3” to the week when it has some, and “Facilitator guide” to the guide's course page whenever the guide has anything", async () => {
    const home = await homeWithGuide("rahul");
    assert.match(home.text, /This week Week 3 · Who decides what AGI means Facilitator guide for week 3 Facilitator guide 3 exercises to review/);
    assert.match(
      home.html,
      new RegExp(`<div class="weekGuide"><a href="${AGI_GUIDE}/week-3" class="textLink">Facilitator guide for week 3<svg[^>]*><path[^>]*></path></svg></a><a href="${AGI_GUIDE}" class="textLink">Facilitator guide<svg`),
    );
    // The week has moved on to one with nothing in the guide: its link goes, a sentence says so and who loads it,
    // and the course page's stays.
    reset();
    await seedGuide(COURSE.agi, [["w01-plan", PLAN_W1]]);
    const later = await homeWithGuide("rahul");
    assert.match(later.text, /This week Week 3 · Who decides what AGI means Week 3’s plan isn’t in the guide yet\. Claudia or an admin loads it\. Facilitator guide 3 exercises to review/);
    assert.doesNotMatch(later.text, /Facilitator guide for week/);
    assert.doesNotMatch(later.html, new RegExp(`href="${AGI_GUIDE}/`));
    assert.match(
      later.html,
      new RegExp(`<div class="weekGuide"><p class="guideSentence">Week 3’s plan isn’t in the guide yet\\. Claudia or an admin loads it\\.</p><a href="${AGI_GUIDE}" class="textLink">Facilitator guide<svg`),
    );
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
        // The two tabs over every week, places of their own since October
        // 2026, offered after the course's other documents and before the
        // weeks; nothing is loaded in either in this world.
        ["sessions", "Sessions", null],
        ["week-notes", "Week notes", null],
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

// ---------------------------------------------------------------------------
// 9. Sessions and Week notes: the two tabs over every week
// ---------------------------------------------------------------------------

describe("9. Sessions and Week notes: two more places, at the top of Each week", () => {
  const AT_A_GLANCE = [
    ["sessions", SESSIONS],
    ["week-notes", WEEK_NOTES],
  ];

  test("loaded through the same route, by the same people (an admin alone), as the course's other documents, and stored as they are", async () => {
    const said = {};
    for (const who of EVERYBODY) {
      said[who ?? "signed out"] = [
        (await load(who, "POST", "sessions", { markdown: SESSIONS })).status,
        (await load(who, "PUT", "week-notes", { markdown: WEEK_NOTES })).status,
        (await load(who, "POST", "handbook", { markdown: HANDBOOK })).status,
      ];
    }
    const refused = Object.fromEntries(EVERYBODY.map((who) => [who ?? "signed out", who === null ? [401, 401, 401] : [403, 403, 403]]));
    assert.deepEqual(said, { ...refused, zach: [200, 200, 200] });
    assert.equal((await load("zach", "PUT", "sessions", { markdown: SESSIONS, viewAs: true })).status, 403);
    assert.equal(world.db.read(`courseFacilitatorGuide/${COURSE.agi}__sessions`), undefined);

    const saved = await load("zach", "PUT", "sessions", { markdown: SESSIONS });
    assert.deepEqual(saved.body, { saved: true, place: "Sessions", title: "Sessions", blocks: 3 });
    for (const slot of ["sessions", "week-notes"]) {
      const doc = world.db.read(`courseFacilitatorGuide/${COURSE.agi}__${slot}`);
      assert.deepEqual(Object.keys(doc).sort(), ["blocks", "courseId", "slot", "title", "updatedAt", "weekNumber"], slot);
      assert.equal(doc.courseId, COURSE.agi, slot);
      assert.equal(doc.slot, slot);
      assert.equal(doc.weekNumber, null, slot);
      assert.doesNotMatch(JSON.stringify(doc), /zach|claudia|@example\.com|Uid/, slot);
      // Copy as Markdown gives back the same document.
      const copied = await load("zach", "GET", slot);
      assert.equal((await load("zach", "PUT", slot, { markdown: copied.body.markdown })).status, 200, slot);
      assert.deepEqual(world.db.read(`courseFacilitatorGuide/${COURSE.agi}__${slot}`).blocks, doc.blocks, slot);
    }
  });

  test("a document in the wrong place is refused, either way round, and no week ever takes either", async () => {
    const said = async (slot, markdown) => {
      const answer = await load("zach", "PUT", slot, { markdown });
      return [answer.status, answer.body.error];
    };
    assert.deepEqual(await said("sessions", PLAN_W1), [400, "This is session 1’s plan, and you’re loading Sessions. Load it as Week 1 session plan, or change the title line."]);
    assert.deepEqual(await said("week-notes", NOTES_W3), [400, "This is week 3’s notes, and you’re loading Week notes. Load it as Week 3 notes, or change the title line."]);
    assert.deepEqual(await said("sessions", FELLOW_WEEK_3), [400, "This is week 3 of the fellow guide, which goes in the run’s week, not in the facilitator guide."]);
    assert.deepEqual(await said("w01-plan", SESSIONS), [400, "“Sessions” is one of the course’s own documents, and you’re loading Week 1 session plan. Load it in its own place, or change the title line."]);
    assert.deepEqual(await said("w03-notes", WEEK_NOTES), [400, "“Week notes” is one of the course’s own documents, and you’re loading Week 3 notes. Load it in its own place, or change the title line."]);
    assert.deepEqual(stored().filter((path) => /__(?:sessions|week-notes)$/.test(path)), []);
    // Between the course's own documents a title is a thing to check, as for the other four.
    const swapped = await load("zach", "POST", "week-notes", { markdown: SESSIONS });
    assert.deepEqual([swapped.status, swapped.body.problems, swapped.body.checks], [200, [], ["Check this is Week notes: its title doesn’t say so."]]);
    // The week loader refuses both, as it refuses the rest of the guide.
    const { readPastedWeek } = guide.paste;
    const week = (markdown) => readPastedWeek({ markdown, weekNumber: 3, stored: null }).problems;
    assert.match(week(SESSIONS)[0], /^“Sessions” is one of the facilitator guide’s own documents\. Facilitator material never goes in a week/);
    assert.match(week(WEEK_NOTES)[0], /^“Week notes” is one of the facilitator guide’s own documents\. Facilitator material never goes in a week/);
  });

  test("the course page shows them at the top of Each week, above the weeks, and never under For the whole course", async () => {
    await seedGuide(COURSE.agi, AT_A_GLANCE);
    for (const who of ["rahul", "claudia", "zach"]) {
      const drawn = await coursePage(who);
      // Rahul's group's members read week 2's title; an admin and a lead with no group are given its number.
      const two = who === "rahul" ? "Week 2: Week 2 readings" : "Week 2";
      assert.match(
        drawn.text,
        new RegExp(
          `Each week Sessions Week notes Week 1: First look Session plan ${two} Not loaded yet Week 3: Reading the sky Session plan · Week notes Week 4 Not loaded yet Week 5 Not loaded yet Week 6 Not loaded yet For the whole course How to use these plans Weather Fellowship: session plans Handbook Weather Fellowship: facilitator guide Case studies and feedback Printables`,
        ),
        who,
      );
      for (const [href, label] of [[`${AGI_GUIDE}/sessions`, "Sessions"], [`${AGI_GUIDE}/week-notes`, "Week notes"]]) {
        assert.match(drawn.html, new RegExp(`<a href="${href}" class="row"><span class="rowText"><span class="rowTitle">${label}</span></span>`), `${who} ${label}`);
      }
      const side = drawn.html.slice(drawn.html.indexOf('aria-labelledby="guide-course"'));
      assert.doesNotMatch(side, /\/sessions"|\/week-notes"/, who);
      // Titles only: not a word from under them.
      assert.doesNotMatch(drawn.text, /To open|Barometer|The question to expect/, who);
    }
    // With only those two loaded, Each week holds them, and the page is not empty.
    reset();
    await seedGuide(COURSE.agi, AT_A_GLANCE);
    const alone = await coursePage("sofia");
    assert.match(
      alone.text,
      /Facilitator guide Only facilitators, the programme’s lead and admins see this\. Your next session Week 3: Who decides what AGI means Group B · Tue 17 Nov, 6pm Week 3’s plan isn’t in the guide yet\. The programme’s lead or an admin loads it\. Each week Sessions Week notes Week 1: Week 1 readings Not loaded yet Week 2: Week 2 readings Not loaded yet Week 3: Who decides what AGI means Not loaded yet Week 4 Not loaded yet Week 5 Not loaded yet Week 6 Not loaded yet$/,
    );
    assert.doesNotMatch(alone.text, /For the whole course|There’s nothing in this course’s facilitator guide yet/);
  });

  test("their pages: the document for the gate's three, the one calm answer for everybody else, and plain words when nothing is loaded", async () => {
    assert.match((await docPage("rahul", "sessions")).text, /“Sessions” isn’t in this facilitator guide yet\./);
    assert.match((await docPage("rahul", "week-notes")).text, /“Week notes” isn’t in this facilitator guide yet\./);
    await seedGuide(COURSE.agi, AT_A_GLANCE);
    for (const who of ["rahul", "sofia", "tom", "grace", "claudia", "zach"]) {
      const drawn = await docPage(who, "sessions");
      assert.equal(drawn.wrote, false, who);
      assert.match(drawn.html, /<h1 class="title">Sessions<\/h1>/, who);
      assert.match(drawn.html, /<h2 class="h2">At a glance<\/h2>/, who);
      assert.match(drawn.html, /<div class="table"><table><thead><tr><th scope="col">Evening<\/th><th scope="col">To open<\/th>/, who);
      assert.match(drawn.text, /3\. Reading the sky The pressure line A: Looking out · B: Chart swap Cloud atlases/, who);
    }
    const notes = await docPage("sofia", "week-notes");
    assert.match(notes.html, /<h1 class="title">Week notes<\/h1>/);
    assert.match(notes.text, /1\. First look A forecast is a number with a reason "Isn't it just a guess\?"/);
    assert.match(notes.html, new RegExp(`<a href="${AGI_GUIDE}" class="footLink">Back to the facilitator guide</a>`));
    for (const who of ["tess", "ola", "lloyd", "yusuf", "amara", "chloe", "una", "nobody"]) {
      for (const segment of ["sessions", "week-notes"]) {
        const drawn = await docPage(who, segment);
        assert.equal(drawn.to, null, `${who} ${segment}`);
        assert.match(drawn.text, new RegExp(REFUSED), `${who} ${segment}`);
        assert.doesNotMatch(drawn.text, /Reading the sky|To open|The idea|AGI Strategy Fellowship/, `${who} ${segment}`);
      }
    }
    assert.equal((await docPage(null, "sessions")).to, `/login?next=${encodeURIComponent(`${AGI_GUIDE}/sessions`)}`);
  });

  test("the list of titles names them with the course's other documents, and the loader page offers them", async () => {
    await seedGuide(COURSE.agi, AT_A_GLANCE);
    assert.deepEqual((await index("rahul")).body.documents.slice(-2), [
      { key: "sessions", label: "Sessions", title: "Sessions" },
      { key: "week-notes", label: "Week notes", title: "Week notes" },
    ]);
    const slots = find((await adminPage("zach")).element, "FacilitatorGuideLoader")[0].props.slots;
    assert.deepEqual(
      slots.slice(3, 7).map((slot) => [slot.key, slot.label, slot.loaded]),
      [
        ["printables", "Printables", "Printables"],
        ["sessions", "Sessions", "Sessions"],
        ["week-notes", "Week notes", "Week notes"],
        ["w01-plan", "Week 1 session plan", "Session 1: First look"],
      ],
    );
  });

  test("a course's destroy counts them and takes them with the rest", async () => {
    const { engine, makeCascadeDb } = await loadCourseDestroy();
    const id = "weather-fellowship__c0urse09";
    const db = makeCascadeDb({
      [`courses/${id}`]: { title: "Weather Fellowship", status: "archived" },
      [`courseFacilitatorGuide/${id}__sessions`]: { courseId: id, slot: "sessions", title: "Sessions", blocks: [] },
      [`courseFacilitatorGuide/${id}__week-notes`]: { courseId: id, slot: "week-notes", title: "Week notes", blocks: [] },
    });
    assert.equal((await engine.countCourseDestroyTargets(db, { id, title: "Weather Fellowship" })).facilitatorGuide, 2);
    const result = await engine.destroyCourseCascade(db, id, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.complete, true);
    assert.equal(db.has(`courseFacilitatorGuide/${id}__sessions`), false);
    assert.equal(db.has(`courseFacilitatorGuide/${id}__week-notes`), false);
  });
});

// ---------------------------------------------------------------------------
// 10. The reader's own group on the guide's pages
// ---------------------------------------------------------------------------

describe("10. the guide's pages lead a facilitator to their next session, and list the weeks still to be loaded", () => {
  const GROUP_B = `/learn/${RUN.agi}/group/${B}`;
  const GROUP_A = `/learn/${RUN.agi}/group/${A}`;
  /** The gate's reader for `who`, whole. */
  const readerOf = (who, courseId = COURSE.agi) => guide.access.facilitatorGuideReader(world.courseDb, w.sessionFor(who), courseId);
  /** The card at the top of the course page, as words, or null when there is none. */
  const cardOf = (drawn) => {
    const at = drawn.html.indexOf('aria-labelledby="guide-next"');
    if (at < 0) return null;
    const html = drawn.html.slice(drawn.html.lastIndexOf("<section", at), drawn.html.indexOf("</section>", at));
    return textOf(html);
  };

  test("the gate hands a facilitator their own live groups, in meeting order, as named fields with no link, room or name; through every other door, none", async () => {
    const rahul = await readerOf("rahul");
    assert.equal(rahul.as, "facilitator");
    assert.deepEqual(rahul.groups.map((group) => [group.groupId, group.runId, group.name]), [[B, RUN.agi, "Group B"]]);
    const [own] = rahul.groups;
    assert.deepEqual(Object.keys(own).sort(), ["groupId", "name", "runId", "sessions", "weekCount"]);
    assert.equal(own.weekCount, 6);
    assert.deepEqual(Object.keys(own.sessions[0]).sort(), ["cancelled", "dateKey", "endsAt", "occurrence", "sessionKey", "startTimeLocal", "startsAt", "weekNumber"]);
    assert.deepEqual(
      own.sessions.map((session) => `${session.sessionKey} ${session.dateKey} ${session.startTimeLocal}`),
      ["w01 2026-11-03 18:00", "w02 2026-11-10 18:00", "w03 2026-11-17 18:00", "w04 2026-11-24 18:00", "w05 2026-12-01 18:00", "w06 2026-12-08 18:00"],
    );
    // A meeting link on the group and its week never comes back, nor its room or anybody's name.
    world.db.poke(`courseGroups/${B}`, { session: { ...world.db.read(`courseGroups/${B}`).session, meetingUrl: "https://meet.example.com/group-b" } });
    const handed = JSON.stringify((await readerOf("rahul")).groups);
    assert.doesNotMatch(handed, /meet\.example|https?:|Hallward|Rahul|Sofia|meetingUrl|location|facilitatorUids/);
    // Sofia facilitates Group B (Tuesdays) and Group A (Thursdays): both, Tuesday's first. Tom has Group C only.
    assert.deepEqual((await readerOf("sofia")).groups.map((group) => group.groupId), [B, A]);
    assert.deepEqual((await readerOf("tom")).groups.map((group) => group.groupId), [C]);
    // An archived group is not handed back; with none left, the door is shut as it always was.
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.deepEqual((await readerOf("sofia")).groups.map((group) => group.groupId), [A]);
    assert.equal(await readerOf("rahul"), null);
    // An admin and a lead are let in by their own doors, with no groups on the proof.
    for (const who of ["zach", "claudia"]) assert.equal(Object.hasOwn(await readerOf(who), "groups"), false, who);
    assert.equal(Object.hasOwn(await readerOf("ola", COURSE.tais), "groups"), true);
    assert.equal(Object.hasOwn(await readerOf("tess", COURSE.tais), "groups"), false);
  });

  test("a facilitator's card: the week their group meets for next, the group, its day and clock, and that week's plan; the way back is to the group", async () => {
    const drawn = await coursePage("rahul");
    assert.equal(drawn.wrote, false);
    assert.equal(cardOf(drawn), "Your next session Week 3: Reading the sky Group B · Tue 17 Nov, 6pm Open week 3’s plan");
    assert.match(drawn.html, new RegExp(`<a href="${AGI_GUIDE}/week-3" class="buttonPrimary">Open week 3’s plan</a>`));
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_B}" class="crumb">Group B</a>`));
    assert.doesNotMatch(drawn.html, /href="\/learn" class="crumb"/);
    assert.match(drawn.text, /^Group B Group B AGI Strategy Fellowship Facilitator guide Only facilitators, the programme’s lead and admins see this\. Your next session/);
    // The same card for each of the group's facilitators.
    assert.equal(cardOf(await coursePage("sofia")), cardOf(drawn));
  });

  test("two groups on the course: the one that meets next, and the other once that one has met", async (t) => {
    t.after(() => w.at(NOW));
    // Tuesday noon: Group B tonight, before Group A on Thursday.
    assert.equal(cardOf(await coursePage("sofia")), "Your next session Week 3: Reading the sky Group B · Tue 17 Nov, 6pm Open week 3’s plan");
    // During Group B's session it is still the next one.
    w.at("2026-11-17T19:00:00Z");
    assert.match(cardOf(await coursePage("sofia")), /Group B · Tue 17 Nov, 6pm/);
    // Wednesday: Group A meets on Thursday, for week 4, which has nothing loaded.
    w.at("2026-11-18T09:00:00Z");
    const wednesday = await coursePage("sofia");
    assert.equal(cardOf(wednesday), "Your next session Week 4 Group A · Thu 19 Nov, 6pm Week 4’s plan isn’t in the guide yet. The programme’s lead or an admin loads it.");
    assert.match(wednesday.html, new RegExp(`<a href="${GROUP_A}" class="crumb">Group A</a>`));
    assert.doesNotMatch(cardOf(wednesday), /Open week/);
  });

  test("a week moved through Change a session is on its new day; an evening called off is never next", async () => {
    world.db.poke(`courseGroups/${B}`, { sessionOverrides: { w03: { weekday: 3, startTimeLocal: "17:30" } } });
    assert.equal(cardOf(await coursePage("rahul")), "Your next session Week 3: Reading the sky Group B · Wed 18 Nov, 5:30pm Open week 3’s plan");
    reset();
    await seedGuide();
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w03: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-17", byUid: "rahul", at: NOW } },
    });
    assert.equal(
      cardOf(await coursePage("rahul")),
      "Your next session Week 4 Group B · Tue 24 Nov, 6pm Week 4’s plan isn’t in the guide yet. The programme’s lead or an admin loads it.",
    );
  });

  test("after the group's last session: no card, and the way back still leads to the group", async (t) => {
    t.after(() => w.at(NOW));
    w.at("2026-12-10T12:00:00Z");
    const drawn = await coursePage("rahul");
    assert.equal(cardOf(drawn), null);
    assert.doesNotMatch(drawn.text, /Your next session/);
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_B}" class="crumb">Group B</a>`));
  });

  test("no card for an admin or a lead who facilitates nothing; an admin who facilitates a group is drawn theirs", async () => {
    for (const who of ["zach", "claudia"]) {
      const drawn = await coursePage(who);
      assert.equal(cardOf(drawn), null, who);
      assert.match(drawn.html, /<a href="\/learn" class="crumb">My programmes<\/a>/, who);
      assert.doesNotMatch(drawn.html, /\/group\//, who);
    }
    // Zach facilitates Group C, Wednesdays at 1pm.
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "zach"] });
    const zach = await coursePage("zach");
    assert.equal(cardOf(zach), "Your next session Week 3: Reading the sky Group C · Wed 18 Nov, 1pm Open week 3’s plan");
    assert.match(zach.html, new RegExp(`<a href="/learn/${RUN.agi}/group/${C}" class="crumb">Group C</a>`));
    // Claudia, who leads, is let in as a facilitator once she facilitates, and drawn hers.
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["claudia"] });
    assert.match(cardOf(await coursePage("claudia")), /Group C · Wed 18 Nov, 1pm/);
  });

  test("the list: every week of the course, the loaded with their parts, the rest “Not loaded yet” with the theme their members read", async () => {
    const drawn = await coursePage("rahul");
    assert.match(
      drawn.text,
      /Each week Week 1: First look Session plan Week 2: Week 2 readings Not loaded yet Week 3: Reading the sky Session plan · Week notes Week 4 Not loaded yet Week 5 Not loaded yet Week 6 Not loaded yet For the whole course/,
    );
    // Each leads to its week's page, which says so plainly.
    for (const n of [2, 4, 5, 6]) assert.match(drawn.html, new RegExp(`<a href="${AGI_GUIDE}/week-${n}" class="row">`), String(n));
    // A theme is a published week's title: weeks 4 to 6 are not published, so they have none.
    world.db.poke(`courseRuns/${RUN.agi}/weeks/w02`, { title: "Week 2: How fast" });
    assert.match((await coursePage("rahul")).text, /Week 2: How fast Not loaded yet/);
    // An admin or a lead with no group of their own: the course's weeks, by number alone.
    for (const who of ["zach", "claudia"]) {
      assert.match(
        (await coursePage(who)).text,
        /Each week Week 1: First look Session plan Week 2 Not loaded yet Week 3: Reading the sky Session plan · Week notes Week 4 Not loaded yet Week 5 Not loaded yet Week 6 Not loaded yet For the whole course/,
        who,
      );
    }
    // Every week loaded: nothing said to be missing.
    reset();
    await seedGuide(COURSE.agi, [1, 2, 3, 4, 5, 6].map((n) => [`w0${n}-plan`, PLAN_W1.replace("Session 1", `Session ${n}`)]));
    assert.doesNotMatch((await coursePage("rahul")).text, /Not loaded yet/);
  });

  test("nothing loaded at all: one sentence saying so and who loads it, never by name, and the way back to the group", async () => {
    reset();
    const rahul = await coursePage("rahul");
    assert.match(rahul.text, /Facilitator guide Only facilitators, the programme’s lead and admins see this\. There’s nothing in this course’s facilitator guide yet\. The programme’s lead or an admin loads it\. Back to Group B$/);
    assert.match(rahul.html, new RegExp(`<a href="${GROUP_B}" class="footLink">Back to Group B</a>`));
    assert.equal(cardOf(rahul), null);
    assert.doesNotMatch(rahul.text, /Claudia|Each week/);
    // An admin: the same sentence, and no group to go back to.
    const zach = await coursePage("zach");
    assert.match(zach.text, /There’s nothing in this course’s facilitator guide yet\. The programme’s lead or an admin loads it\.$/);
    // With no lead who stands, admins alone.
    const form = world.db.read(formPath);
    const agi = Object.keys(form.programmes).find((id) => form.programmes[id].runId === RUN.agi);
    world.db.poke(formPath, { programmes: { ...form.programmes, [agi]: { ...form.programmes[agi], leadUid: null } } });
    assert.match((await coursePage("rahul")).text, /There’s nothing in this course’s facilitator guide yet\. An admin loads it\. Back to Group B$/);
    world.db.poke(formPath, { programmes: { ...form.programmes, [agi]: { ...form.programmes[agi], leadUid: "claudia" } } });
    world.db.poke("users/claudia", { role: "member", suRecognised: false });
    assert.match((await coursePage("rahul")).text, /An admin loads it\. Back to Group B$/);
  });

  test("a week's page: Take the register for each group whose session that week is next or in progress, never an old one, and the group, under the title", async (t) => {
    t.after(() => w.at(NOW));
    /** Each row under the title, as HTML. */
    const rows = (drawn) => [...drawn.html.matchAll(/<div class="actions" role="group" aria-label="([^"]*)">(.*?)<\/div>/g)].map((match) => `${match[1]}: ${match[2]}`);
    const row = (name, groupPath, key) =>
      `${name}: ${key ? `<a href="${groupPath}/register?session=${key}" class="buttonGhost">Take the register</a>` : ""}<a href="${groupPath}" class="buttonGhost">${name}</a>`;
    // Tonight's week: Group B's next session.
    const tonight = await docPage("rahul", "week-3");
    assert.deepEqual(rows(tonight), [row("Group B", GROUP_B, "w03")]);
    assert.match(tonight.text, /Facilitator guide for week 3 Only facilitators, the programme’s lead and admins see this\. Take the register Group B/);
    // In progress: still that session's.
    w.at("2026-11-17T19:00:00Z");
    assert.deepEqual(rows(await docPage("rahul", "week-3")), [row("Group B", GROUP_B, "w03")]);
    // A week already met, and the same week once its session ended yesterday: the group alone, never an old register.
    w.at(NOW);
    assert.deepEqual(rows(await docPage("rahul", "week-1")), [row("Group B", GROUP_B, null)]);
    w.at("2026-11-18T09:00:00Z");
    assert.deepEqual(rows(await docPage("rahul", "week-3")), [row("Group B", GROUP_B, null)]);
    w.at(NOW);
    // A week further ahead than the next session: the group alone, its register not open yet.
    await seedGuide(COURSE.agi, [["w05-plan", PLAN_W1.replace("Session 1", "Session 5")]]);
    assert.deepEqual(rows(await docPage("rahul", "week-5")), [row("Group B", GROUP_B, null)]);
    // Tonight's evening called off: no register for week 3.
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w03: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-17", byUid: "rahul", at: NOW } },
    });
    assert.deepEqual(rows(await docPage("rahul", "week-3")), [row("Group B", GROUP_B, null)]);
    world.db.poke(`courseGroups/${B}`, { sessionChanges: {} });
    // Two groups a week apart: on Wednesday, Group A meets for week 4 on Thursday and Group B on Tuesday after.
    // Each is decided on its own, and each gets its row, in meeting order.
    await seedGuide(COURSE.agi, [["w04-plan", PLAN_W1.replace("Session 1", "Session 4")]]);
    w.at("2026-11-18T09:00:00Z");
    assert.deepEqual(rows(await docPage("sofia", "week-4")), [row("Group B", GROUP_B, "w04"), row("Group A", GROUP_A, "w04")]);
    // Week 3 on Wednesday: Group B met last night and Group A last Thursday, so neither register; the group Sofia meets next.
    assert.deepEqual(rows(await docPage("sofia", "week-3")), [row("Group A", GROUP_A, null)]);
    // Thursday evening, during Group A's week 4: Group A's in progress, and Group B's week 4 is still its next.
    w.at("2026-11-19T18:30:00Z");
    assert.deepEqual(rows(await docPage("sofia", "week-4")), [row("Group B", GROUP_B, "w04"), row("Group A", GROUP_A, "w04")]);
    // Friday: Group A's is over; Group B's alone.
    w.at("2026-11-20T09:00:00Z");
    assert.deepEqual(rows(await docPage("sofia", "week-4")), [row("Group B", GROUP_B, "w04")]);
    // An admin or a lead who facilitates nothing, a course document, and a week with nothing loaded: none.
    w.at(NOW);
    for (const who of ["zach", "claudia"]) assert.deepEqual(rows(await docPage(who, "week-3")), [], who);
    assert.deepEqual(rows(await docPage("rahul", "handbook")), []);
    const empty = await docPage("rahul", "week-2");
    assert.deepEqual(rows(empty), []);
    assert.match(empty.text, /Week 2’s plan isn’t in the guide yet\. Back to the facilitator guide$/);
  });

  test("a week's theme is the one its group's members read: the group's own copy where it has one, and only once published to them", async () => {
    const list = async () => (await coursePage("rahul")).text;
    assert.match(await list(), /Week 2: Week 2 readings Not loaded yet/);
    // Group B holds its own copy of week 2, with its own title: that is what its members read.
    world.db.seed(`courseGroups/${B}/weeks/w02`, { ...world.db.read(`courseRuns/${RUN.agi}/weeks/w02`), title: "Our own week two", published: true });
    assert.match(await list(), /Week 2: Our own week two Not loaded yet/);
    assert.doesNotMatch(await list(), /Week 2 readings/);
    // The group's copy is not published to its members yet: no title, though the run's own week is published.
    world.db.poke(`courseGroups/${B}/weeks/w02`, { published: false });
    assert.match(await list(), /Week 1: First look Session plan Week 2 Not loaded yet Week 3/);
    // A run's week its members cannot read yet gives no title either, and its group's published copy does.
    world.db.poke(`courseRuns/${RUN.agi}/weeks/w04`, { title: "What we can do" });
    assert.match(await list(), /Week 4 Not loaded yet/);
    world.db.seed(`courseGroups/${B}/weeks/w04`, { ...world.db.read(`courseRuns/${RUN.agi}/weeks/w04`), published: true });
    assert.match(await list(), /Week 4: What we can do Not loaded yet/);
    // Another group's own copy is never read for Rahul's page.
    world.db.seed(`courseGroups/${C}/weeks/w05`, { ...world.db.read(`courseRuns/${RUN.agi}/weeks/w05`), title: "Group C's week five", published: true });
    assert.doesNotMatch(await list(), /Group C's week five/);
  });

  test("the gate is decided by the runs it could read: one failing read never errors, never turns away somebody another run lets in, and lets nobody in", async () => {
    /** The course routes' database, with one run's read failing. */
    const failing = (...runIds) => {
      const view = Object.create(world.courseDb);
      view.collection = (path) => {
        const collection = world.courseDb.collection(path);
        if (path !== "courseRuns") return collection;
        return new Proxy(collection, {
          get(target, key) {
            if (key === "doc") {
              return (id) => (runIds.includes(id) ? { get: async () => Promise.reject(new Error("unavailable")) } : target.doc(id));
            }
            const value = target[key];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      };
      return view;
    };
    const as = (who, db) => guide.access.facilitatorGuideReader(db, w.sessionFor(who), COURSE.agi);
    // Sofia's Group A moves to the course's spring run: her groups are on two runs of one course.
    world.db.poke(`courseGroups/${A}`, { runId: RUN.agiSpring });
    assert.deepEqual((await as("sofia", world.courseDb)).groups.map((group) => group.groupId).sort(), [A, B].sort());
    assert.deepEqual((await as("sofia", failing(RUN.agiSpring))).groups.map((group) => group.groupId), [B]);
    assert.deepEqual((await as("sofia", failing(RUN.agi))).groups.map((group) => group.groupId), [A]);
    // Every run she is on unreadable: the calm refusal, never an error.
    assert.equal(await as("sofia", failing(RUN.agi, RUN.agiSpring)), null);
    assert.equal(await as("rahul", failing(RUN.agi)), null);
    // Nobody new: Amara, Nell and a lead's own door are answered as before.
    assert.equal(await as("amara", failing(RUN.agiSpring)), null);
    assert.equal((await as("claudia", failing(RUN.agiSpring)))?.as, "lead");
  });

  test("“next” is the shared rule's: the projection and sessionRange name the same session in every world", async (t) => {
    t.after(() => w.at(NOW));
    const { sessions, groupDocs, courseDocs, nextSession } = guide;
    const both = (over = {}) => {
      const run = courseDocs.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
      const group = { ...groupDocs.normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`)), ...over };
      const now = new Date();
      const shared = sessions.sessionRange(sessions.resolveSessions(run, group), now).next;
      const ours = nextSession.nextSessionOf(nextSession.guideGroupOf(run, group), now);
      return [shared?.sessionKey ?? null, ours?.sessionKey ?? null];
    };
    const same = (label, expected, over) => {
      const [shared, ours] = both(over);
      assert.equal(ours, shared, label);
      assert.equal(ours, expected, label);
    };
    same("tonight", "w03");
    w.at("2026-11-17T19:00:00Z");
    same("in progress", "w03");
    w.at("2026-11-17T20:00:01Z");
    same("just over", "w04");
    w.at(NOW);
    world.db.poke(`courseGroups/${B}`, { sessionOverrides: { w03: { weekday: 3 } } });
    same("a moved week", "w03");
    w.at("2026-11-17T20:00:01Z");
    same("a moved week, after the old evening", "w03");
    w.at(NOW);
    world.db.poke(`courseGroups/${B}`, {
      sessionOverrides: {},
      sessionChanges: { w03: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-17", byUid: "rahul", at: NOW } },
    });
    same("called off", "w04");
    world.db.poke(`courseGroups/${B}`, { sessionChanges: {} });
    // A second slot at 1pm on Tuesdays, before the group's 6pm: the earlier start is next, not the first in the week.
    same("two a week", "w03-2", { extraSession: { weekday: 2, startTimeLocal: "13:00", durationMinutes: 60, location: "", meetingUrl: null, notes: "" } });
    w.at("2026-12-10T12:00:00Z");
    same("the last session over", null);
    w.at(NOW);
    world.db.poke(`courseRuns/${RUN.agi}`, { startDate: "" });
    same("no dates", null);
  });

  test("the pure choice of the next session and the register, on a group of two sessions a week", () => {
    const { nextGuideSession, registerSessionFor, registerRowsFor, homeGroupOf } = guide.nextSession;
    const at = (iso) => new Date(iso).getTime();
    const session = (weekNumber, occurrence, start, over = {}) => ({
      weekNumber,
      occurrence,
      sessionKey: occurrence === 1 ? `w0${weekNumber}` : `w0${weekNumber}-${occurrence}`,
      dateKey: start.slice(0, 10),
      startTimeLocal: "18:00",
      startsAt: at(start),
      endsAt: at(start) + 2 * 3600_000,
      cancelled: false,
      ...over,
    });
    const one = { groupId: "g1", runId: "r", name: "One", weekCount: 2, sessions: [session(1, 1, "2026-11-03T18:00:00Z"), session(1, 2, "2026-11-05T18:00:00Z"), session(2, 1, "2026-11-10T18:00:00Z")] };
    const two = { groupId: "g2", runId: "r", name: "Two", weekCount: 2, sessions: [session(1, 1, "2026-11-04T18:00:00Z"), session(2, 1, "2026-11-11T18:00:00Z", { cancelled: true })] };
    const now = new Date("2026-11-04T12:00:00Z");
    assert.equal(nextGuideSession([one, two], now).group.groupId, "g2");
    assert.equal(nextGuideSession([one, two], new Date("2026-11-04T21:00:00Z")).session.sessionKey, "w01-2");
    // Week 1's register: the session in progress, else the group's next; never one that is over.
    assert.equal(registerSessionFor(one, 1, now).sessionKey, "w01-2");
    assert.equal(registerSessionFor(one, 1, new Date("2026-11-03T19:00:00Z")).sessionKey, "w01");
    assert.equal(registerSessionFor(one, 1, new Date("2026-11-06T09:00:00Z")), null);
    assert.equal(registerSessionFor(two, 2, new Date("2026-11-08T09:00:00Z")), null);
    // Each group decided on its own, in the order given.
    assert.deepEqual(registerRowsFor([one, two], 1, now).map((row) => `${row.group.groupId} ${row.session.sessionKey}`), ["g1 w01-2", "g2 w01"]);
    assert.deepEqual(registerRowsFor([one, two], 2, now).map((row) => row.group.groupId), []);
    // Every session over: no next, and the first group in meeting order is the way back.
    assert.equal(nextGuideSession([one, two], new Date("2026-12-01T00:00:00Z")), null);
    assert.equal(homeGroupOf([one, two], new Date("2026-12-01T00:00:00Z")).groupId, "g1");
    assert.equal(homeGroupOf([], now), null);
  });
});

// Ola's group belongs to Technical AI Safety's run, which is a run of that course.
test("the world: Technical AI Safety's group and run are that course's", () => {
  assert.equal(world.db.read(`courseGroups/${TAIS_GROUP}`).courseId, COURSE.tais);
  assert.equal(world.db.read(`courseRuns/${RUN.tais}`).courseId, COURSE.tais);
});
