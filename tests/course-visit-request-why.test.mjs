/**
 * "WHY:" UNDER EACH SESSION A PERSON IS OFFERED ON "ANOTHER SESSION THIS
 * WEEK": read from the times they gave on the application form, back to them
 * alone, as finished words.
 *
 *   /learn/[runId]/another-session                                the person's form
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this holds
 *
 *  1. THE TWO LINES, in the approved words, with the real day and part of
 *     the day: "Why: you said you’re free Wednesday afternoons" for a session
 *     in the times they gave; "Why: not a time you gave, but there’s room"
 *     for one with a place that is not.
 *  2. NO LINE where nothing true can be said: no application on the form
 *     that names the run, nothing painted, a full session, and a session in
 *     their times whose part of the day their own week does not say.
 *  3. FINISHED WORDS ONLY: the page and its view carry the sentence and never
 *     the painted week.
 *  4. THEIR OWN, TO THEM ALONE: read by the caller's own uid; in a view-as
 *     session their application is not read and no line is drawn.
 *  5. NOTHING ELSE CHANGES: the order of the list and what can be chosen.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Chloe is in Group B; the one other
 * session she is offered that week is Group C's, Wed 18 Nov, 1pm to 3pm.
 * She applied to the run itself, so she has no application on the form until
 * a suite gives her one.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { week } from "./lib/handoverWorld.mjs";
import { C, NOW, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitRequestWhy");
const { world } = w;
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { anotherSessionPageFor } = await w.loadTs(join("lib", "courses", "visitRequest", "own.ts"));
const { memberSessionChoices, readVisitFacts, dbReader } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));
const anotherPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "another-session", "page.tsx"))).default;

const FREE = "Why: you said you’re free Wednesday afternoons";
const ROOM = "Why: not a time you gave, but there’s room";

const read = (path) => world.db.read(path);
const ROUND_OF = () => {
  const amara = world.db.paths().find((path) => path.startsWith("admissionApplications/") && path.endsWith("__amara"));
  assert.ok(amara, "the world gives Amara an application on the form");
  return { path: amara, doc: read(amara) };
};

/** Chloe's application on the form, sent with this painted week. */
function chloeApplied(painted) {
  const { path, doc } = ROUND_OF();
  const content = { ...doc.sent, availability: painted };
  world.db.seed(path.replace(/__amara$/, "__chloe"), { ...doc, uid: "chloe", email: "chloe@example.com", displayName: "Chloe Nguyen", draft: content, sent: content });
}

async function viewOf(uid = "chloe", viewingAs = false) {
  const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
  const enrolment = enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(`courseEnrolments/${RUN.agi}__${uid}`));
  return anotherSessionPageFor(world.courseDb, { user: w.sessionOf(uid), run, enrolment, now: new Date(), viewingAs });
}

const whyOf = async (groupId = C) => (await viewOf()).form.choices.find((choice) => choice.groupId === groupId)?.why ?? null;

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  world.viewAs = false;
});

describe("1. the two lines", () => {
  test("a session in the times she gave: the part of the week, said the way the site says a time somebody gave", async () => {
    chloeApplied(week({ 3: [["12:00", "17:00"]] }));
    assert.equal(await whyOf(), FREE);
    const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    assert.ok(page.text.includes(`Group C · Wed 18 Nov, 1pm to 3pm`), page.text);
    assert.ok(page.text.includes(FREE), page.text);
    assert.equal(page.wrote, false);
  });

  test("a session with a place that is not in the times she gave: there's room", async () => {
    chloeApplied(week({ 1: [["09:00", "17:00"]] }));
    assert.equal(await whyOf(), ROOM);
    assert.ok((await w.draw(anotherPage, "chloe", { runId: RUN.agi })).text.includes(ROOM));
  });

  test("half the session in her times is not her times", async () => {
    chloeApplied(week({ 1: [["09:00", "13:00"]], 3: [["12:00", "14:00"]] }));
    assert.equal(await whyOf(), ROOM);
  });
});

describe("2. no line where nothing true can be said", () => {
  test("no application on the form that names the run: she applied to the run itself", async () => {
    assert.equal(world.db.paths().some((path) => path.startsWith("admissionApplications/") && path.endsWith("__chloe")), false);
    assert.equal(await whyOf(), null);
    assert.doesNotMatch((await w.draw(anotherPage, "chloe", { runId: RUN.agi })).text, /Why:/);
  });

  test("nothing painted", async () => {
    chloeApplied(week({}));
    assert.equal(await whyOf(), null);
  });

  test("a full session: nothing under it, in her times or not", async () => {
    world.db.poke(`courseGroups/${C}`, { capacity: 1 });
    chloeApplied(week({ 3: [["12:00", "17:00"]] }));
    const choice = (await viewOf()).form.choices.find((each) => each.groupId === C);
    assert.equal(choice.full, true);
    assert.equal(choice.why, null);
    chloeApplied(week({ 1: [["09:00", "17:00"]] }));
    assert.equal((await viewOf()).form.choices.find((each) => each.groupId === C).why, null);
  });

  test("in her times only as somebody who marked little, read from then on: no part of the day to say, so nothing", async () => {
    // One hour on Wednesday morning: read "from then on", which covers the
    // afternoon session, but her own week has no hour of Wednesday afternoon.
    chloeApplied(week({ 3: [["10:00", "11:00"]] }));
    assert.equal(await whyOf(), null);
  });

  test("a session in her times that starts late in a part of the day: no hour of that part painted, so no line, never a wrong one", async () => {
    // Group C at 4:30pm, inside the afternoon by its start; she painted from
    // 4:30pm to 9pm, half an hour of the afternoon.
    const group = read(`courseGroups/${C}`);
    world.db.poke(`courseGroups/${C}`, { session: { ...group.session, startTimeLocal: "16:30" } });
    chloeApplied(week({ 3: [["16:30", "21:00"]] }));
    assert.equal(await whyOf(), null);
  });

  test("an application the form cannot read as sent says nothing", async () => {
    chloeApplied(week({ 3: [["12:00", "17:00"]] }));
    const path = world.db.paths().find((each) => each.startsWith("admissionApplications/") && each.endsWith("__chloe"));
    world.db.poke(path, { sent: null });
    assert.equal(await whyOf(), null);
  });
});

describe("3. finished words only, to her alone", () => {
  test("the view carries the sentence and never the painted week; the page's HTML neither", async () => {
    const painted = week({ 3: [["12:00", "17:00"]] });
    chloeApplied(painted);
    const view = await viewOf();
    for (const choice of view.form.choices) {
      assert.deepEqual(Object.keys(choice).sort(), ["detail", "full", "groupId", "why", "words"]);
      assert.ok(choice.why === null || typeof choice.why === "string");
    }
    const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
    for (const day of painted.days.filter((hex) => /[1-9a-f]/.test(hex))) assert.ok(!page.html.includes(day), "a painted day reached the page");
    assert.doesNotMatch(JSON.stringify(view), /availability|startMinute|slotMinutes/);
  });

  test("read by the caller's own uid: another person's application says nothing about her", async () => {
    // Amara's own week covers no Wednesday; Chloe has none. Nothing of Amara's reaches Chloe's page.
    assert.equal(await whyOf(), null);
  });

  test("a view-as session: her application is not read, and no line is drawn", async () => {
    chloeApplied(week({ 3: [["12:00", "17:00"]] }));
    const asked = [];
    const real = world.courseDb.collection.bind(world.courseDb);
    world.courseDb.collection = (name) => {
      asked.push(name);
      return real(name);
    };
    try {
      // Signed in as herself, the page reads her application...
      await w.draw(anotherPage, "chloe", { runId: RUN.agi });
      assert.ok(asked.includes("admissionApplications"), "the spy sees the read it is meant to");
      asked.length = 0;
      // ...and in a view-as session it does not.
      world.viewAs = true;
      const page = await w.draw(anotherPage, "chloe", { runId: RUN.agi });
      assert.doesNotMatch(page.text, /Why:/);
      assert.ok(page.text.includes("Group C · Wed 18 Nov, 1pm to 3pm"), "the list is still drawn");
      assert.ok(!asked.includes("admissionApplications"), `read: ${[...new Set(asked)].join(", ")}`);
      assert.equal((await viewOf("chloe", true)).form.choices.find((choice) => choice.groupId === C).why, null);
    } finally {
      world.courseDb.collection = real;
      world.viewAs = false;
    }
  });
});

describe("3a. the question is the caller's to answer, and not answering it reads nothing", () => {
  test("a caller that leaves out whether this is a view-as session gets no line", async () => {
    chloeApplied(week({ 3: [["12:00", "17:00"]] }));
    const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
    const enrolment = enrolments.normalizeCourseEnrolment(`${RUN.agi}__chloe`, read(`courseEnrolments/${RUN.agi}__chloe`));
    const view = await anotherSessionPageFor(world.courseDb, { user: w.sessionOf("chloe"), run, enrolment, now: new Date() });
    assert.equal(view.form.choices.find((choice) => choice.groupId === C).why, null);
    assert.equal(await whyOf(), FREE, "and asked, it reads");
  });
});

describe("4. nothing else changes", () => {
  test("the order and what can be chosen are the list's own, with a line or without", async () => {
    const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
    const facts = await readVisitFacts(dbReader(world.courseDb), world.courseDb, run.id, "chloe", "ahead", new Date(), "member");
    const plain = memberSessionChoices(facts.facts, 3, new Date());
    chloeApplied(week({ 3: [["12:00", "17:00"]] }));
    const offered = (await viewOf()).form.choices;
    assert.deepEqual(offered.map(({ why, ...rest }) => (void why, rest)), plain);
  });
});
