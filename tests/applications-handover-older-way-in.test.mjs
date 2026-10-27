/**
 * A run the application form places people on takes no application of its own.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST, PATCH, DELETE /api/courses/runs/[runId]/apply
 *   /courses/[courseId]/apply
 *
 * ## What this guards
 *
 * A course run can only leave draft by way of "applications open", and while
 * it is there the run's own apply page and route take applications whenever
 * the run's own dates allow, which with no dates set is always. A run that a
 * programme on the term's application form names must not: its people come
 * through that form and an admin's hand-over, and an application made to the
 * run itself would be read by nobody.
 *
 * So the question is asked of the FORMS (`runTakesPeopleFromForm`), before
 * the run's window is read, and this file holds:
 *
 *  - the answer is yes for a run any programme names, whatever state its
 *    form is in, and no for every other run;
 *  - the route refuses to make an application and to edit one, in words,
 *    however the run's status and dates stand, and writes and sends nothing;
 *  - the same request against the same run, with no programme naming it, is
 *    taken. That is what shows the refusal comes from the naming and not
 *    from something else about the fixture;
 *  - withdrawing still works;
 *  - the page draws a card in words for everybody, and never the form or
 *    anybody's own application.
 *
 * Real: the route, the page, the loader the page reads through and the
 * lookup. Faked: the usual doors (`tests/lib/handoverWorld.mjs`), and for
 * the page a stylesheet, the site's card and badge, and the form component,
 * which records that it was drawn.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { AGI, COURSE, GROUP, ROUND, RUN, makeWorld } from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const { world, reset, call, everything, courseRoute, lib } = makeWorld();

const applyRoute = await courseRoute("runs", "[runId]", "apply");
const openForm = await lib("applications", "lifecycle", "openForm.ts");
const words = await lib("courses", "formPlacedRun.ts");

const NOW = new Date("2026-10-24T10:00:00Z");
const nameRun = (programmeId, runId, roundId = ROUND) =>
  world.db.poke(`admissionRounds/${roundId}`, { [`programmes.${programmeId}.runId`]: runId });
const apply = (who, runId, method = "POST", body = { answers: {}, availability: [] }) =>
  call(who, applyRoute[method], { runId }, { body, course: true });
const rowOf = (runId, uid) => world.db.read(`courseApplications/${runId}__${uid}`);

// The route's own rate limiter is real, and counts by account. Each test
// starts a quarter of an hour after the last, so the allowance has turned
// over and what is answered is never the limiter.
mock.timers.enable({ apis: ["Date"], now: NOW });

beforeEach(() => {
  mock.timers.setTime(Date.now() + 15 * 60_000);
  reset();
});

// ---------------------------------------------------------------------------
// The question
// ---------------------------------------------------------------------------

describe("does an application form place people on this run", () => {
  test("no, while no programme names it", async () => {
    for (const runId of Object.values(RUN)) {
      assert.equal(await openForm.runTakesPeopleFromForm(world.db, runId), false, runId);
    }
  });

  test("yes for the run a programme names, and for no other run", async () => {
    nameRun(AGI, RUN.agi);
    assert.equal(await openForm.runTakesPeopleFromForm(world.db, RUN.agi), true);
    for (const runId of [RUN.agiSpring, RUN.tais, RUN.other, "", "no-such-run"]) {
      assert.equal(await openForm.runTakesPeopleFromForm(world.db, runId), false, runId);
    }
  });

  test("whatever state the form is in, and whether or not the programme is closed", async () => {
    for (const round of [
      { status: "draft" },
      { status: "open" },
      { status: "closed" },
      { status: "deciding" },
      { status: "settled" },
      { status: "cancelled" },
      { status: "settled", archived: true },
    ]) {
      reset();
      world.db.poke(`admissionRounds/${ROUND}`, round);
      nameRun(AGI, RUN.agi);
      assert.equal(await openForm.runTakesPeopleFromForm(world.db, RUN.agi), true, JSON.stringify(round));
    }
    reset();
    nameRun(AGI, RUN.agi);
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.closed`]: true });
    assert.equal(await openForm.runTakesPeopleFromForm(world.db, RUN.agi), true);
  });

  test("a round of the older kind is not a form, whatever it carries", async () => {
    world.db.seed("admissionRounds/older-round", {
      kind: "enrolment",
      label: "An older round",
      programmeIds: [AGI],
      programmes: { [AGI]: { name: "x", runId: RUN.agi } },
    });
    assert.equal(await openForm.runTakesPeopleFromForm(world.db, RUN.agi), false);
  });

  test("it answers yes or no, and hands back nothing of the form", async () => {
    nameRun(AGI, RUN.agi);
    assert.equal(typeof (await openForm.runTakesPeopleFromForm(world.db, RUN.agi)), "boolean");
  });
});

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

describe("the run's own apply route", () => {
  /** How a run can stand while it would otherwise take an application or an edit. */
  const STANDINGS = [
    ["applications open, with no dates at all", {}],
    ["applications open, inside its dates", { applicationsOpenAt: new Date("2026-10-01T09:00:00Z"), applicationsCloseAt: new Date("2026-12-01T09:00:00Z") }],
    ["applications open, before its dates", { applicationsOpenAt: new Date("2026-11-01T09:00:00Z") }],
    ["applications closed", { status: "applications-closed" }],
    ["running", { status: "running" }],
    ["a draft", { status: "draft" }],
  ];

  for (const [what, patch] of STANDINGS) {
    test(`refuses a new application in words: ${what}`, async () => {
      world.db.poke(`courseRuns/${RUN.agi}`, patch);
      nameRun(AGI, RUN.agi);
      const before = everything();
      for (const who of ["nobody", "amara", "wen", "zach"]) {
        const response = await apply(who, RUN.agi);
        assert.deepEqual([response.status, response.body.error], [409, words.APPLICATIONS_NOT_TAKEN_HERE], who);
      }
      assert.equal(everything(), before, "a refused application wrote something");
      assert.equal(world.mail.length, 0);
    });
  }

  test("the same request is taken by the same run when no programme names it", async () => {
    const response = await apply("nobody", RUN.agi);
    assert.equal(response.status, 200, response.body?.error);
    assert.equal(rowOf(RUN.agi, "nobody").status, "pending");
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`).applicationCounts.pending, 1);
  });

  test("another run of the same course is unaffected", async () => {
    nameRun(AGI, RUN.agi);
    world.db.poke(`courseRuns/${RUN.agiSpring}`, { status: "applications-open" });
    assert.equal((await apply("nobody", RUN.agiSpring)).status, 200);
  });

  test("an application made before the run was named can no longer be edited, and can still be withdrawn", async () => {
    assert.equal((await apply("nobody", RUN.agi)).status, 200);
    // Editable, until a programme names the run.
    world.db.poke(`courseApplications/${RUN.agi}__nobody`, { updatedAt: new Date("2026-10-01T09:00:00Z") });
    assert.equal((await apply("nobody", RUN.agi, "PATCH")).status, 200);
    world.db.poke(`courseApplications/${RUN.agi}__nobody`, { updatedAt: new Date("2026-10-01T09:00:00Z") });

    nameRun(AGI, RUN.agi);
    const before = everything();
    const edit = await apply("nobody", RUN.agi, "PATCH");
    assert.deepEqual([edit.status, edit.body.error], [409, words.APPLICATIONS_NOT_TAKEN_HERE]);
    assert.equal(everything(), before);

    const withdrawn = await call("nobody", applyRoute.DELETE, { runId: RUN.agi }, { course: true });
    assert.equal(withdrawn.status, 200);
    assert.equal(rowOf(RUN.agi, "nobody").status, "withdrawn");
  });

  test("the answers that come before it are unchanged: nobody signed in, a refused account, no such run", async () => {
    nameRun(AGI, RUN.agi);
    assert.equal((await apply(null, RUN.agi)).status, 401);
    assert.equal((await apply("refused", RUN.agi)).status, 403);
    assert.equal((await apply("nobody", "no-such-run")).status, 404);
  });

  test("the refusal names no form and no programme", async () => {
    nameRun(AGI, RUN.agi);
    const said = JSON.stringify((await apply("nobody", RUN.agi)).body);
    for (const word of [ROUND, AGI, "Autumn 2026", "AGI Strategy", "form"]) {
      assert.ok(!said.includes(word), `the refusal says "${word}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const page = { drawn: [], createElement };
globalThis.__olderWayIn = page;

const STYLES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const BOX =
  "export default function Box({ children }) {\n" +
  "  return globalThis.__olderWayIn.createElement('div', null, children);\n" +
  "}";

const { loadTs: loadPage } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__handover.courseDb; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__handover.user; }"],
    [
      "next/link",
      "export default function Link({ href, children }) {\n" +
        "  return globalThis.__olderWayIn.createElement('a', { href }, children);\n" +
        "}",
    ],
    ["next/navigation", "export function redirect(to) { throw new Error('redirect to ' + to); }"],
    ["./apply.module.css", STYLES],
    ["@/components/ui/Card", BOX],
    ["@/components/ui/Badge", BOX],
    ["../../../Reveal", BOX],
    [
      // The form of the run's own. It reads the visitor's own application in
      // the browser, so being drawn at all is what the page must not do.
      "@/features/courses/ApplyForm",
      "export default function ApplyForm(props) {\n" +
        "  globalThis.__olderWayIn.drawn.push(props.runId);\n" +
        "  return globalThis.__olderWayIn.createElement('form', { 'data-drawn': 'ApplyForm' });\n" +
        "}",
    ],
  ]),
});
const { default: CourseApplyPage, generateMetadata } = await loadPage(
  join("app", "(public)", "courses", "[courseId]", "apply", "page.tsx"),
);
const fetchCourses = await loadPage(join("features", "courses", "fetchCourses.ts"));

async function draw(who) {
  world.user = who ? { uid: who, role: world.db.read(`users/${who}`).role, displayName: "Somebody" } : null;
  page.drawn = [];
  const params = Promise.resolve({ courseId: COURSE.agi });
  const html = renderToStaticMarkup(await CourseApplyPage({ params }));
  const meta = await generateMetadata({ params });
  return { html, meta, form: page.drawn.length > 0 };
}

describe("the run's own apply page", () => {
  const VISITORS = [null, "nobody", "amara", "wen", "refused", "zach"];

  test("draws its form for a run no programme names, so the fixture is a run that would take applications", async () => {
    const drawn = await draw("nobody");
    assert.equal(drawn.form, true);
    assert.match(drawn.meta.title, /^Apply:/);
    assert.ok(!drawn.html.includes(words.NOT_TAKEN_HERE_CARD.title));
  });

  test("draws a card in words for everybody once a programme names the run, and never the form", async () => {
    nameRun(AGI, RUN.agi);
    for (const who of VISITORS) {
      const drawn = await draw(who);
      assert.equal(drawn.form, false, `${who}: the form was drawn`);
      assert.ok(drawn.html.includes(words.NOT_TAKEN_HERE_CARD.title.replace("'", "&#x27;")), who ?? "signed out");
      assert.ok(drawn.html.includes(`href="/courses/${COURSE.agi}"`));
      assert.ok(!/Sign in to apply|Your application/.test(drawn.html), who ?? "signed out");
      assert.equal(drawn.meta.title, "AGI Strategy Fellowship: how to apply");
    }
  });

  test("however the run's status and dates stand", async () => {
    nameRun(AGI, RUN.agi);
    for (const patch of [{ status: "applications-closed" }, { status: "running" }, { applicationsCloseAt: new Date("2026-10-01T09:00:00Z") }]) {
      world.db.poke(`courseRuns/${RUN.agi}`, patch);
      const drawn = await draw("amara");
      assert.equal(drawn.form, false, JSON.stringify(patch));
      assert.ok(drawn.html.includes("how to apply and when"));
    }
  });

  test("somebody handed over is not shown a row of theirs there either", async () => {
    nameRun(AGI, RUN.agi);
    world.db.seed(`courseApplications/${RUN.agi}__amara`, {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid: "amara",
      displayName: "Amara Okafor",
      status: "accepted",
      fromForm: { roundId: ROUND, programmeId: AGI },
    });
    const drawn = await draw("amara");
    assert.equal(drawn.form, false);
    assert.ok(!/Accepted|accepted/.test(drawn.html));
  });

  test("the page's one read says so, and reads no group for such a run", async () => {
    nameRun(AGI, RUN.agi);
    const context = await fetchCourses.getApplyContext(COURSE.agi);
    assert.deepEqual([context.placedFromForm, context.openEnrol, context.groups], [true, false, []]);
    assert.equal(context.run.id, RUN.agi);
    // And for a course whose run no programme names, the groups are read as before.
    reset();
    const plain = await fetchCourses.getApplyContext(COURSE.agi);
    assert.equal(plain.placedFromForm, false);
    assert.deepEqual(plain.groups.map((group) => group.id).sort(), [GROUP.monday, GROUP.thursday].sort());
  });

  test("the card says nothing about the form", () => {
    const said = JSON.stringify(words);
    assert.ok(!/application form|the form|Autumn/.test(said), said);
  });
});

// The run a programme names is the one the page would have drawn the form for.
test("the fixture: the course's featured run is the one the form would name", async () => {
  reset();
  const context = await fetchCourses.getApplyContext(COURSE.agi);
  assert.equal(context.run.id, RUN.agi);
  assert.equal(context.window.state, "open");
  // With no dates of its own, nothing but its status holds its window open.
  const run = world.db.read(`courseRuns/${RUN.agi}`);
  assert.deepEqual([run.status, run.applicationsOpenAt, run.applicationsCloseAt], ["applications-open", null, null]);
});
