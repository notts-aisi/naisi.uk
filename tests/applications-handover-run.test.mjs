/**
 * The course run a programme places its people on.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/admissions/forms/[roundId]/programmes/[programmeId]/run
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/run
 *
 * ## What this guards
 *
 * `programmes.<id>.runId` says where a programme's accepted people go, and
 * one function writes it (`setProgrammeRun`). This file runs the two real
 * handlers against one stored term, with the course side beside it, and
 * holds:
 *
 *  - WHO MAY. An admin, and nobody else: a lead, a reviewer, an applicant, a
 *    member with no role and nobody signed in are each refused, in the same
 *    words whether or not the form or the programme exists. A view-as
 *    session is refused before anything else.
 *  - WHICH RUN. A run of the course the programme is tied to, that people can
 *    still start on, that takes people by placement, that holds no
 *    application of its own, and that no other programme names.
 *  - ASKED INSIDE THE TRANSACTION. A run that takes an application of its
 *    own while the request is running is refused.
 *  - LOCKED ONCE ANYBODY HAS BEEN HANDED OVER, so nobody is left behind on a
 *    run the programme no longer points at.
 *  - NOTHING ELSE IS WRITTEN. Naming a run changes one field of the form.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGI,
  COURSE,
  INCUBATOR,
  ROUND,
  RUN,
  TAIS,
  makeWorld,
  programmeParams,
  runDoc,
  seedWorld,
} from "./lib/handoverWorld.mjs";

const { world, reset, call, everything, formRoute, lib } = makeWorld();

const route = await formRoute("programmes", "[programmeId]", "run");
const programmeRoute = await formRoute("programmes", "[programmeId]");
const openForm = await lib("applications", "lifecycle", "openForm.ts");
const sentences = await lib("applications", "handover", "run.ts");

const stored = () => world.db.read(`admissionRounds/${ROUND}`);
const named = (programmeId) => stored().programmes[programmeId].runId;
const name = (who, programmeId, runId) => call(who, route.PUT, programmeParams(programmeId), { body: { runId } });
const short = (response) => [response.status, response.body?.error ?? null];

/** A row a hand-over wrote: accepted, with where it came from. */
const formRow = (runId, uid, programmeId = AGI) => ({
  runId,
  courseId: COURSE.agi,
  uid,
  displayName: "Somebody",
  status: "accepted",
  fromForm: { roundId: ROUND, programmeId },
});

beforeEach(() => {
  reset();
});

// ---------------------------------------------------------------------------
// Who may
// ---------------------------------------------------------------------------

describe("who may name the run, and who may read the panel", () => {
  /** [who, what they are]. Nobody here is an admin. */
  const OTHERS = [
    ["claudia", "the programme's own lead"],
    ["lloyd", "one of its reviewers"],
    ["tess", "the lead of another programme"],
    ["yusuf", "SU-recognised committee, named on nothing"],
    ["amara", "an applicant who holds a place on it"],
    ["nobody", "a member with no role and no application"],
    ["refused", "an account that was refused"],
  ];

  test("nobody signed in is told to sign in, and nothing is read", async () => {
    const before = world.db.stats.reads;
    assert.deepEqual(short(await name(null, AGI, RUN.agi)), [401, "Not signed in"]);
    assert.deepEqual(short(await call(null, route.GET, programmeParams(AGI))), [401, "Not signed in"]);
    assert.equal(world.db.stats.reads, before);
  });

  for (const [who, what] of OTHERS) {
    test(`${what} is refused, in the same words wherever they point`, async () => {
      const before = everything();
      const reads = world.db.stats.reads;
      const answers = [];
      for (const params of [
        programmeParams(AGI),
        programmeParams("no-such-programme"),
        { roundId: "no-such-form", programmeId: AGI },
        // A round of the older kind is no form.
        { roundId: "older-round", programmeId: AGI },
      ]) {
        answers.push(short(await call(who, route.PUT, params, { body: { runId: RUN.agi } })));
        answers.push(short(await call(who, route.GET, params)));
      }
      for (const answer of answers) assert.deepEqual(answer, [403, sentences.NOT_AN_ADMIN]);
      assert.equal(everything(), before, "a refused request wrote something");
      assert.equal(world.db.stats.reads, reads, "a refusal read a document");
    });
  }

  test("an admin names it, and reads the panel", async () => {
    const saved = await name("zach", AGI, RUN.agi);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.changed, true);
    assert.equal(named(AGI), RUN.agi);
    assert.equal(saved.body.panel.runId, RUN.agi);
    const read = await call("zach", route.GET, programmeParams(AGI));
    assert.equal(read.status, 200);
    assert.equal(read.body.panel.runId, RUN.agi);
  });

  test("an admin is told there is nothing there, where there is nothing", async () => {
    for (const params of [programmeParams("no-such-programme"), { roundId: "no-such-form", programmeId: AGI }, { roundId: "older-round", programmeId: AGI }]) {
      assert.equal((await call("zach", route.PUT, params, { body: { runId: RUN.agi } })).status, 404);
      assert.equal((await call("zach", route.GET, params)).status, 404);
    }
  });

  test("a view-as session is refused before anything else, an admin's included", async () => {
    const before = everything();
    const response = await call("zach", route.PUT, programmeParams(AGI), { body: { runId: RUN.agi }, viewAs: true });
    assert.deepEqual(short(response), [403, "view-as"]);
    assert.equal(everything(), before);
  });

  test("what is sent has to name a run, or no run", async () => {
    for (const body of [{}, { runId: 7 }, { runId: ["x"] }, { runId: "courseRuns/x" }, { runId: "constructor" }, { runId: "a.b" }]) {
      const response = await call("zach", route.PUT, programmeParams(AGI), { body });
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    assert.equal(named(AGI), null);
  });
});

// ---------------------------------------------------------------------------
// Which run
// ---------------------------------------------------------------------------

describe("which run a programme can name", () => {
  test("naming a run changes that one field of the form and nothing else anywhere", async () => {
    const before = structuredClone(stored());
    const paths = world.db.paths().sort();
    await name("zach", AGI, RUN.agi);
    const after = structuredClone(stored());
    assert.deepEqual(world.db.paths().sort(), paths, "a document was made or removed");
    before.programmes[AGI].runId = RUN.agi;
    before.updatedAt = after.updatedAt;
    assert.deepEqual(after, before);
    // The run itself is untouched: naming it puts nobody on it.
    assert.deepEqual(world.db.read(`courseRuns/${RUN.agi}`), runDoc({ trackLeadUids: ["yusuf"], admissionsReviewerUids: ["lloyd"], groupCount: 3 }));
  });

  test("a run that is still a draft can be named", async () => {
    assert.equal((await name("zach", AGI, RUN.agiSpring)).status, 200);
    assert.equal(named(AGI), RUN.agiSpring);
  });

  test("naming the run it already names writes nothing", async () => {
    await name("zach", AGI, RUN.agi);
    const before = everything();
    const again = await name("zach", AGI, RUN.agi);
    assert.equal(again.status, 200);
    assert.equal(again.body.changed, false);
    assert.equal(everything(), before);
  });

  test("the run can be cleared, and changed, while nobody has been handed over", async () => {
    await name("zach", AGI, RUN.agi);
    assert.equal((await name("zach", AGI, RUN.agiSpring)).status, 200);
    assert.equal(named(AGI), RUN.agiSpring);
    assert.equal((await name("zach", AGI, null)).status, 200);
    assert.equal(named(AGI), null);
    // An empty box means the same as no run.
    await name("zach", AGI, RUN.agi);
    assert.equal((await name("zach", AGI, "")).status, 200);
    assert.equal(named(AGI), null);
  });

  test("a programme with no course page cannot name a run", async () => {
    assert.equal(stored().programmes[INCUBATOR].courseId ?? null, null);
    const response = await name("zach", INCUBATOR, RUN.agi);
    assert.equal(response.status, 409);
    assert.match(response.body.error, /Tie this programme to its course page first/);
    assert.equal(named(INCUBATOR), null);
  });

  /** [what, the run asked for, how the run is stored, the status, the words]. */
  const REFUSED = [
    ["a run of another course", RUN.tais, null, 400, /belongs to another course/],
    ["a run of a course no programme is tied to", RUN.other, null, 400, /belongs to another course/],
    ["a run that is not there", "no-such-run__00000000", null, 400, /not on the site/],
    ["an archived run", RUN.agi, { archived: true }, 400, /archived/],
    ["a run that is being destroyed", RUN.agi, { destroying: true }, 400, /archived/],
    ["a cancelled run", RUN.agi, { status: "cancelled" }, 400, /finished or was cancelled/],
    ["a completed run", RUN.agi, { status: "completed" }, 400, /finished or was cancelled/],
    ["a run in open enrolment", RUN.agi, { enrolMode: "open" }, 400, /session picker/],
  ];
  for (const [what, runId, patch, status, words] of REFUSED) {
    test(`${what} is refused`, async () => {
      if (patch) world.db.poke(`courseRuns/${runId}`, patch);
      const before = everything();
      const response = await name("zach", AGI, runId);
      assert.equal(response.status, status, response.body?.error);
      assert.match(response.body.error, words);
      assert.equal(everything(), before);
    });
  }

  test("a run with an application of its own is refused, whatever that application says", async () => {
    for (const status of ["pending", "accepted", "waitlisted", "rejected", "withdrawn"]) {
      reset();
      world.db.seed(`courseApplications/${RUN.agi}__nobody`, { runId: RUN.agi, courseId: COURSE.agi, uid: "nobody", status });
      const response = await name("zach", AGI, RUN.agi);
      assert.deepEqual(short(response), [409, sentences.RUN_HAS_APPLICATIONS], status);
      assert.equal(named(AGI), null);
    }
  });

  test("a run another programme names is refused, on this form or on any other", async () => {
    // Two programmes of one form tied to one course.
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.courseId`]: COURSE.agi });
    await name("zach", AGI, RUN.agi);
    assert.deepEqual(short(await name("zach", INCUBATOR, RUN.agi)), [409, sentences.RUN_TAKEN]);
    assert.equal(named(INCUBATOR), null);
    // The other run of that course is free.
    assert.equal((await name("zach", INCUBATOR, RUN.agiSpring)).status, 200);

    // A form from another term that still names a run, whatever its state.
    reset();
    const other = structuredClone(stored());
    other.status = "settled";
    other.archived = true;
    other.programmes[AGI].runId = RUN.agi;
    world.db.seed("admissionRounds/spring-2026__0lderf0rm", other);
    assert.deepEqual(short(await name("zach", AGI, RUN.agi)), [409, sentences.RUN_TAKEN]);
    assert.equal(named(AGI), null);
  });

  test("a run that takes an application while the request is running is refused", async () => {
    // Somebody applies to the run between the read and the commit.
    world.db.beforeCommit = () => {
      world.db.seed(`courseApplications/${RUN.agi}__nobody`, { runId: RUN.agi, courseId: COURSE.agi, uid: "nobody", status: "pending" });
    };
    const response = await name("zach", AGI, RUN.agi);
    assert.deepEqual(short(response), [409, sentences.RUN_HAS_APPLICATIONS]);
    assert.equal(named(AGI), null);
  });

  test("a programme named by another, while the request is running, is refused", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.courseId`]: COURSE.agi });
    world.db.beforeCommit = () => {
      world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.runId`]: RUN.agi });
    };
    const response = await name("zach", AGI, RUN.agi);
    assert.deepEqual(short(response), [409, sentences.RUN_TAKEN]);
    assert.equal(named(AGI), null);
  });
});

// ---------------------------------------------------------------------------
// Once anybody has been handed over
// ---------------------------------------------------------------------------

describe("once anybody has been handed over, the run stays", () => {
  test("it can no longer be changed or cleared", async () => {
    await name("zach", AGI, RUN.agi);
    world.db.seed(`courseApplications/${RUN.agi}__amara`, formRow(RUN.agi, "amara"));
    const before = everything();
    assert.deepEqual(short(await name("zach", AGI, RUN.agiSpring)), [409, sentences.RUN_LOCKED]);
    assert.deepEqual(short(await name("zach", AGI, null)), [409, sentences.RUN_LOCKED]);
    assert.equal(everything(), before);
    const panel = (await call("zach", route.GET, programmeParams(AGI))).body.panel;
    assert.equal(panel.runLocked, sentences.RUN_LOCKED);
  });

  test("a row another programme's hand-over wrote does not lock this one", async () => {
    await name("zach", AGI, RUN.agi);
    world.db.seed(`courseApplications/${RUN.agi}__amara`, formRow(RUN.agi, "amara", TAIS));
    assert.equal((await name("zach", AGI, null)).status, 200);
  });

  test("somebody handed over while the request is running locks it", async () => {
    await name("zach", AGI, RUN.agi);
    world.db.beforeCommit = () => {
      world.db.seed(`courseApplications/${RUN.agi}__amara`, formRow(RUN.agi, "amara"));
    };
    assert.deepEqual(short(await name("zach", AGI, null)), [409, sentences.RUN_LOCKED]);
    assert.equal(named(AGI), RUN.agi);
  });
});

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

describe("the runs the panel offers are the runs the route accepts", () => {
  const choicesFor = async (programmeId) =>
    (await call("zach", route.GET, programmeParams(programmeId))).body.panel.choices;

  test("the runs of the tied course, and no other course's", async () => {
    const choices = await choicesFor(AGI);
    assert.deepEqual(
      choices.map((choice) => [choice.id, choice.label, choice.selectable]),
      [
        [RUN.agi, "Autumn 2026 · Applications open", true],
        [RUN.agiSpring, "Spring 2027 · Draft", true],
      ],
    );
  });

  test("a programme with no course page is offered nothing, and told why", async () => {
    const panel = (await call("zach", route.GET, programmeParams(INCUBATOR))).body.panel;
    assert.equal(panel.courseTied, false);
    assert.deepEqual(panel.choices, []);
  });

  test("every run offered as pickable is accepted, and every other is refused", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.courseId`]: COURSE.agi });
    world.db.poke(`courseRuns/${RUN.agiSpring}`, { status: "cancelled" });
    world.db.seed(`courseRuns/agi-summer__run00009`, runDoc({ label: "Summer 2027" }));
    world.db.seed(`courseApplications/agi-summer__run00009__nobody`, { runId: "agi-summer__run00009", uid: "nobody", status: "pending" });
    world.db.seed(`courseRuns/agi-winter__run00010`, runDoc({ label: "Winter 2027" }));
    await name("zach", INCUBATOR, "agi-winter__run00010");

    const choices = await choicesFor(AGI);
    const byId = Object.fromEntries(choices.map((choice) => [choice.id, choice]));
    // A cancelled run is not listed at all.
    assert.equal(byId[RUN.agiSpring], undefined);
    assert.equal(byId[RUN.agi].selectable, true);
    assert.deepEqual([byId["agi-summer__run00009"].selectable, byId["agi-summer__run00009"].note], [false, sentences.RUN_HAS_APPLICATIONS]);
    assert.deepEqual([byId["agi-winter__run00010"].selectable, byId["agi-winter__run00010"].note], [false, sentences.RUN_TAKEN]);
    const start = storedNow();
    for (const choice of choices) {
      reset(structuredClone(start));
      const response = await name("zach", AGI, choice.id);
      assert.equal(response.status === 200, choice.selectable, `${choice.label}: ${response.body?.error ?? "accepted"}`);
    }
  });

  test("the run already named is always shown, whatever has become of it", async () => {
    await name("zach", AGI, RUN.agi);
    world.db.poke(`courseRuns/${RUN.agi}`, { archived: true });
    let named = (await choicesFor(AGI)).find((choice) => choice.id === RUN.agi);
    assert.deepEqual([named.selectable, /archived/.test(named.note)], [false, true]);

    // The programme's course tie was changed afterwards.
    world.db.poke(`courseRuns/${RUN.agi}`, { archived: false });
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.courseId`]: COURSE.other });
    named = (await choicesFor(AGI)).find((choice) => choice.id === RUN.agi);
    assert.deepEqual([named.selectable, /another course/.test(named.note)], [false, true]);

    // The run was destroyed.
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: "gone__run99999" });
    named = (await choicesFor(AGI)).find((choice) => choice.id === "gone__run99999");
    assert.deepEqual([named.selectable, named.label], [false, "A run that is no longer on the site"]);
  });
});

/** The database as it stands, as a seed, so each choice is tried from the same start. */
function storedNow() {
  return Object.fromEntries(world.db.paths().map((path) => [path, structuredClone(world.db.read(path))]));
}

// ---------------------------------------------------------------------------
// What else reads it
// ---------------------------------------------------------------------------

describe("the rest of the form, once a run is named", () => {
  test("the settings route still refuses the field, and says where it is set", async () => {
    const response = await call("claudia", programmeRoute.PATCH, programmeParams(AGI), { body: { runId: RUN.agi } });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /named by an admin, in the Course run section/);
    assert.equal(named(AGI), null);
    // An admin is refused there too: there is one writer, and it is not that route.
    assert.equal((await call("zach", programmeRoute.PATCH, programmeParams(AGI), { body: { runId: RUN.agi } })).status, 400);
  });

  test("the course's own page is handed the run, and nothing of the run's people", async () => {
    await name("zach", AGI, RUN.agi);
    const view = (await openForm.findFormsByCourse(world.db, new Date("2026-10-24T10:00:00Z"))).get(COURSE.agi);
    assert.equal(view.runId, RUN.agi);
    assert.equal((await openForm.findFormsByCourse(world.db, new Date("2026-10-24T10:00:00Z"))).get(COURSE.tais).runId, null);
  });

  test("a lead can still change the rest of the programme's settings", async () => {
    await name("zach", AGI, RUN.agi);
    assert.equal((await call("claudia", programmeRoute.PATCH, programmeParams(AGI), { body: { places: 9 } })).status, 200);
    assert.equal(named(AGI), RUN.agi);
  });
});

// The seed is checked once, so a failure above is about the code and not the fixture.
test("the fixture: the form is sent, two programmes are tied to a course each, and no run is named", () => {
  const seed = seedWorld();
  const form = seed[`admissionRounds/${ROUND}`];
  assert.ok(form.decisionsSentAt instanceof Date);
  assert.deepEqual(
    [form.programmes[AGI].courseId, form.programmes[TAIS].courseId, form.programmes[AGI].runId],
    [COURSE.agi, COURSE.tais, null],
  );
});
