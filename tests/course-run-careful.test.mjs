/**
 * The last parts of the Course run section of a programme's Settings: making
 * a new run, the run's older roles, and Careful.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/run/new    make a run and name it
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/run/roles  one person off one older role
 *   GET  /api/admissions/forms/[roundId]/programmes/[programmeId]/run        what Careful and the roles say
 *   PATCH /api/courses/runs/[runId]/archive                                   archive and back, as it was
 *
 * ## What this guards
 *
 *  1. WHO. Only an admin makes a run or takes somebody off a role, whatever
 *     the caller is to the programme or the run; a view-as session is refused
 *     before anything; signed out is told to sign in. Nothing is written for
 *     any of them.
 *  2. MAKING A RUN: each refusal in order, two presses at once making one
 *     run, and the run made with exactly the fields the older course editor's
 *     New run writes, read out of that writer's source, as a draft named on
 *     the programme. Nobody is emailed.
 *  3. CAREFUL: Archive offered once the run is completed or cancelled and
 *     never while it runs, the way back once archived, Cancel while the
 *     status table allows it.
 *  4. THE OLDER ROLES: one person on both lists, the last person on a list,
 *     somebody not on it.
 *
 * Taking off somebody who gave their place back is in
 * `tests/course-take-off.test.mjs`, section 8.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { session } from "./lib/applicationsSmallTerm.mjs";
import { AGI, CAST, COURSE, RUN, loadJoin, makeWorld, namedSeed, programmeParams, seedWorld, short } from "./lib/handoverWorld.mjs";

// A course approver: committee, holding approveCourse, named on nothing.
CAST.ada = {
  ...session("ada", "committee", true, "Ada Prior"),
  permissions: { ...session("x", "member", false, "x").permissions, approveCourse: true },
};

const made = makeWorld("__runCareful");
const { world, reset, call, everything, formRoute, courseRoute, lib } = made;
const join_ = await loadJoin(made);
const routes = {
  run: await formRoute("programmes", "[programmeId]", "run"),
  make: await formRoute("programmes", "[programmeId]", "run", "new"),
  roles: await formRoute("programmes", "[programmeId]", "run", "roles"),
  archive: await courseRoute("runs", "[runId]", "archive"),
};
const W = await lib("courses", "runCareful", "words.ts");
const D = await lib("courses", "runStands", "details.ts");
const R = await lib("applications", "handover", "run.ts");

const NOW = new Date("2026-10-24T10:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  // AGI Strategy names no run: the section offers to make one.
  reset(seedWorld());
});

/** Everybody who is not an admin, each with what they are to this programme and run. */
const NOT_ADMINS = [
  ["nobody", "a member with no role"],
  ["amara", "somebody who holds a place on it"],
  ["bea", "a facilitator of one of the run's groups"],
  ["yusuf", "the run's track lead"],
  ["lloyd", "a reviewer of the programme"],
  ["claudia", "the programme's lead"],
  ["tess", "the lead of another programme"],
  ["ada", "a course approver"],
];

const NEW_RUN = {
  label: "AGI Strategy, Spring 2027",
  academicYear: "2026/27",
  cohortTerm: "spring",
  cohortYear: "2027",
  cohortNumber: "1",
  startDate: "2027-02-01",
};
const make = (who, body = NEW_RUN, options = {}) => call(who, routes.make.POST, programmeParams(AGI), { body, ...options });
const removeRole = (who, body, options = {}) => call(who, routes.roles.POST, programmeParams(AGI), { body, ...options });
const panelOf = async (who = "zach") => (await call(who, routes.run.GET, programmeParams(AGI))).body.panel;
const runPaths = () => world.db.paths().filter((path) => path.startsWith("courseRuns/") && path.split("/").length === 2);
const form = () => world.db.read(`admissionRounds/${programmeParams(AGI).roundId}`);

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. only an admin makes a run or takes somebody off a role", () => {
  test("signed out: told to sign in, and nothing is written", async () => {
    const before = everything();
    assert.equal((await make(null)).status, 401);
    assert.equal((await removeRole(null, { list: "trackLeads", uid: "yusuf" })).status, 401);
    assert.equal(everything(), before);
  });

  for (const [who, what] of NOT_ADMINS) {
    test(`${what} is refused both, and nothing is written or sent`, async () => {
      reset(namedSeed());
      const before = everything();
      assert.deepEqual(short(await make(who)), [403, R.NOT_AN_ADMIN]);
      assert.deepEqual(short(await removeRole(who, { list: "trackLeads", uid: "yusuf" })), [403, "Only an admin can take somebody off a run’s roles here."]);
      assert.equal(everything(), before);
      assert.equal(world.mail.length, 0);
    });
  }

  test("a view-as session is refused by both before anything else", async () => {
    const before = everything();
    assert.deepEqual(short(await make("zach", NEW_RUN, { viewAs: true })), [403, "view-as"]);
    assert.deepEqual(short(await removeRole("zach", { list: "trackLeads", uid: "yusuf" }, { viewAs: true })), [403, "view-as"]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. Making a run
// ---------------------------------------------------------------------------

describe("2. making a new run of the programme's course", () => {
  test("the section offers it, in the design's words, where the programme names no run", async () => {
    const panel = await panelOf();
    assert.equal(panel.canMakeRun, true);
    assert.equal(panel.termName, "Autumn 2026");
    assert.equal(
      W.noRunYetWords(panel.programmeName, panel.termName),
      "AGI Strategy doesn’t name a run for Autumn 2026 yet. Make one from the course, or name one that’s already made.",
    );
    assert.equal(W.makeRunWords(panel.programmeName), "Make a new run of AGI Strategy");
    assert.equal(W.MAKE_NOTE, "It starts as a draft, named on this programme. Add its weeks on the Weeks tab. Nobody is emailed.");
    reset(namedSeed());
    assert.equal((await panelOf()).canMakeRun, false);
  });

  test("an admin makes it: a draft of the course, named on the programme, the section read again, nobody emailed", async () => {
    const before = runPaths();
    const done = await make("zach");
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const runId = done.body.runId;
    assert.deepEqual(runPaths().sort(), [...before, `courseRuns/${runId}`].sort());
    // Slugged from the course's title and the label, as the older writer slugs it.
    assert.match(runId, /^agi-strategy-fellowship-agi-strategy-[a-z0-9-]*__[a-z0-9]{8}$/);
    assert.equal(form().programmes[AGI].runId, runId);
    assert.equal(done.body.panel.runId, runId);
    assert.equal(done.body.panel.canMakeRun, false);
    assert.equal(done.body.panel.details.label, "AGI Strategy, Spring 2027");
    assert.equal(done.body.panel.stands.stage, "draft");
    assert.equal(W.madeWords(done.body.label), "AGI Strategy, Spring 2027 is made and named on this programme. Nobody was emailed.");
    assert.equal(world.mail.length, 0);
  });

  test("the run is written with exactly the fields the older New run writes, and the cohort the form gave", async () => {
    const done = await make("zach");
    const run = world.db.read(`courseRuns/${done.body.runId}`);
    // The older writer's fields, read out of its source.
    const source = readFileSync(new URL("../src/features/courses/courseMutations.ts", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("export async function createRun"));
    const written = body.slice(body.indexOf("await setDoc(ref, {") + "await setDoc(ref, {".length, body.indexOf("\n  });"));
    const olderFields = [...written.matchAll(/^\s{4}([a-zA-Z]+)(?::|,$)/gm)].map((match) => match[1]).sort();
    assert.ok(olderFields.length > 20, olderFields.join(","));
    assert.deepEqual(Object.keys(run).filter((key) => key !== "cohort").sort(), olderFields);
    assert.deepEqual(run.cohort, { term: "spring", year: 2027, number: 1 });
    assert.deepEqual(
      {
        courseId: run.courseId,
        courseTitle: run.courseTitle,
        label: run.label,
        academicYear: run.academicYear,
        status: run.status,
        startDate: run.startDate,
        enrolMode: run.enrolMode,
        channel: run.channel,
        authorUid: run.authorUid,
        groupCount: run.groupCount,
        enrolledCount: run.enrolledCount,
      },
      {
        courseId: COURSE.agi,
        courseTitle: "AGI Strategy Fellowship",
        label: "AGI Strategy, Spring 2027",
        academicYear: "2026/27",
        status: "draft",
        startDate: "2027-02-01",
        enrolMode: "admissions",
        channel: `cohort:${done.body.runId}`,
        authorUid: "zach",
        groupCount: 0,
        enrolledCount: 0,
      },
    );
    for (const key of ["admissionsReviewerUids", "runFacilitatorUids", "trackLeadUids", "weekPlan", "applicationForm", "streams"]) {
      assert.deepEqual(run[key], [], key);
    }
    assert.deepEqual([run.applicationsOpenAt, run.applicationsCloseAt, run.applicationCap], [null, null, null]);
    assert.ok(Object.values(run.applicationCounts).every((n) => n === 0));
    // No cohort given: none stored, never a null.
    reset(seedWorld());
    const plain = await make("zach", { ...NEW_RUN, cohortTerm: "", cohortYear: "", cohortNumber: "" });
    assert.equal("cohort" in world.db.read(`courseRuns/${plain.body.runId}`), false);
  });

  test("the body is checked first, with the run's details form's checks and a start date required", async () => {
    const before = everything();
    assert.deepEqual(short(await make("zach", { ...NEW_RUN, startDate: undefined })), [400, D.NEED_START]);
    assert.deepEqual(short(await make("zach", { ...NEW_RUN, startDate: "2027-02-31" })), [400, D.NEED_START]);
    assert.deepEqual(short(await make("zach", { ...NEW_RUN, label: "  " })), [400, D.NEED_LABEL]);
    assert.deepEqual(short(await make("zach", { ...NEW_RUN, academicYear: "2026" })), [400, D.NEED_YEAR]);
    assert.deepEqual(short(await make("zach", { ...NEW_RUN, cohortNumber: "" })), [400, D.COHORT_ALL_OR_NONE]);
    assert.equal((await make("zach", "not an object")).status, 400);
    assert.equal(everything(), before);
  });

  test("a programme with no course behind it is refused", async () => {
    world.db.poke(`admissionRounds/${programmeParams(AGI).roundId}`, { [`programmes.${AGI}.courseId`]: null });
    const before = everything();
    assert.deepEqual(short(await make("zach")), [409, R.standingSentence({ ok: false, why: "no-course" })]);
    assert.equal(everything(), before);
  });

  test("a programme that names a run already is refused, with the hand-over's sentence once anybody is handed over", async () => {
    reset(namedSeed());
    let before = everything();
    assert.deepEqual(short(await make("zach")), [409, R.RUN_NAMED_ALREADY]);
    assert.equal(everything(), before);
    assert.equal((await join_.press()).status, 200);
    before = everything();
    assert.deepEqual(short(await make("zach")), [409, R.RUN_LOCKED]);
    assert.equal(everything(), before);
  });

  test("a course no longer on the site is refused", async () => {
    const seed = seedWorld();
    delete seed[`courses/${COURSE.agi}`];
    reset(seed);
    const before = everything();
    assert.deepEqual(short(await make("zach")), [409, R.COURSE_GONE]);
    assert.equal(everything(), before);
  });

  test("a label another run of the course carries is refused, read as a person reads it, archived and cancelled runs too", async () => {
    // The course's runs are "Autumn 2026" and "Spring 2027".
    for (const label of ["Spring 2027", "  spring   2027 ", "AUTUMN 2026"]) {
      const before = everything();
      assert.deepEqual(short(await make("zach", { ...NEW_RUN, label })), [409, R.runLabelTaken(label)], label);
      assert.equal(everything(), before);
    }
    assert.equal(R.runLabelTaken("Spring 2027"), "A run called Spring 2027 already exists. Name that one instead, or give this one another label.");
    world.db.poke(`courseRuns/${RUN.agiSpring}`, { archived: true, status: "cancelled" });
    assert.equal((await make("zach", { ...NEW_RUN, label: "Spring 2027" })).status, 409);
    // Another course's run of the same label is no clash, nor is a near miss.
    assert.equal(R.sameRunLabel("Spring 2027", "Spring 2027 (B)"), false);
    assert.equal(R.sameRunLabel("", ""), false);
    world.db.poke(`courseRuns/${RUN.tais}`, { label: "AGI Strategy, Spring 2027" });
    assert.equal((await make("zach")).status, 200);
  });

  test("two presses at once make one run: the second is refused", async () => {
    const before = runPaths().length;
    const [a, b] = await Promise.all([make("zach"), make("zach")]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(runPaths().length, before + 1);
    const refused = a.status === 409 ? a : b;
    assert.ok([R.RUN_NAMED_ALREADY, R.runLabelTaken(NEW_RUN.label)].includes(refused.body.error), refused.body.error);
  });
});

// ---------------------------------------------------------------------------
// 3. Careful
// ---------------------------------------------------------------------------

describe("3. Careful: archive once the run is over, the way back, cancel while the table allows", () => {
  beforeEach(() => reset(namedSeed()));
  const archive = (who, archived) => call(who, routes.archive.PATCH, { runId: RUN.agi }, { body: { archived }, course: true });
  const status = (value) => world.db.poke(`courseRuns/${RUN.agi}`, { status: value });

  test("what each stored status offers", async () => {
    const offered = {};
    for (const value of ["draft", "applications-open", "applications-closed", "running", "completed", "cancelled"]) {
      status(value);
      const careful = (await panelOf()).careful;
      offered[value] = [careful.archive, careful.canCancel];
    }
    assert.deepEqual(offered, {
      draft: ["not-yet", true],
      "applications-open": ["not-yet", true],
      "applications-closed": ["not-yet", true],
      running: ["not-yet", true],
      completed: ["offer", false],
      cancelled: ["offer", false],
    });
  });

  test("a running run is not offered archive, and says why", async () => {
    status("running");
    assert.equal((await panelOf()).careful.archive, "not-yet");
    assert.equal(W.ARCHIVE_NOT_YET_HINT, "You can archive the run once it has completed or been cancelled.");
  });

  test("a completed run is archived through the archive route, says it is archived, and comes back the same way", async () => {
    status("completed");
    assert.equal((await archive("zach", true)).status, 200);
    let panel = await panelOf();
    assert.equal(panel.careful.archive, "archived");
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`).archived, true);
    assert.equal(W.archiveQuestion(panel.careful.label), "Archive Autumn 2026?");
    assert.equal(W.ARCHIVE_BODY, "It leaves the lists of runs and stays for the record, with its groups, registers, work and certificates.");
    assert.equal((await archive("zach", false)).status, 200);
    panel = await panelOf();
    assert.equal(panel.careful.archive, "offer");
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`).archived, false);
    assert.equal(world.mail.length, 0);
  });

  test("a cancelled run is offered archive, and no second cancel", async () => {
    status("cancelled");
    const careful = (await panelOf()).careful;
    assert.deepEqual([careful.archive, careful.canCancel], ["offer", false]);
    assert.equal((await archive("zach", true)).status, 200);
    assert.equal((await panelOf()).careful.archive, "archived");
  });

  test("a run being destroyed offers no archive and no cancel", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    const careful = (await panelOf()).careful;
    assert.deepEqual([careful.archive, careful.canCancel], [null, false]);
  });

  test("with no run named there is nothing careful to offer", async () => {
    reset(seedWorld());
    const panel = await panelOf();
    assert.deepEqual([panel.careful, panel.roles], [null, null]);
  });
});

// ---------------------------------------------------------------------------
// 4. The older roles
// ---------------------------------------------------------------------------

describe("4. the run's track leads and run facilitators, Remove only", () => {
  beforeEach(() => {
    reset(namedSeed());
    world.db.poke(`courseRuns/${RUN.agi}`, { trackLeadUids: ["yusuf"], runFacilitatorUids: ["yusuf", "bea"] });
  });
  const run = () => world.db.read(`courseRuns/${RUN.agi}`);

  test("the section lists each, by full name", async () => {
    const roles = (await panelOf()).roles;
    assert.deepEqual(roles, {
      trackLeads: [{ uid: "yusuf", name: CAST.yusuf.displayName }],
      runFacilitators: [
        { uid: "bea", name: CAST.bea.displayName },
        { uid: "yusuf", name: CAST.yusuf.displayName },
      ].sort((a, b) => a.name.localeCompare(b.name, "en")),
    });
  });

  test("one person on both lists comes off one, and stays on the other", async () => {
    const done = await removeRole("zach", { list: "trackLeads", uid: "yusuf" });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual([run().trackLeadUids, run().runFacilitatorUids], [[], ["yusuf", "bea"]]);
    assert.ok(run().updatedAt);
    assert.deepEqual(done.body.panel.roles.trackLeads, []);
    assert.equal(W.removedWords(CAST.yusuf.displayName, "trackLeads"), `${CAST.yusuf.displayName} is no longer a track lead. Nobody was emailed.`);
    assert.equal(world.mail.length, 0);
  });

  test("the last person on a list comes off, and the list is empty", async () => {
    assert.equal((await removeRole("zach", { list: "runFacilitators", uid: "bea" })).status, 200);
    assert.equal((await removeRole("zach", { list: "runFacilitators", uid: "yusuf" })).status, 200);
    assert.deepEqual(run().runFacilitatorUids, []);
    assert.deepEqual((await panelOf()).roles.runFacilitators, []);
  });

  test("somebody not on the list is refused, and nothing is written", async () => {
    const before = everything();
    assert.deepEqual(short(await removeRole("zach", { list: "trackLeads", uid: "bea" })), [409, W.NOT_ON_THE_LIST]);
    assert.deepEqual(short(await removeRole("zach", { list: "somethingElse", uid: "bea" })), [400, "Say which list, and who to take off it."]);
    assert.equal(everything(), before);
  });

  test("with no run named, or the run being destroyed, nothing is taken off", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal((await removeRole("zach", { list: "trackLeads", uid: "yusuf" })).status, 409);
    reset(seedWorld());
    assert.equal((await removeRole("zach", { list: "trackLeads", uid: "yusuf" })).status, 409);
  });

  test("each question says in one sentence what the person can no longer do", () => {
    assert.equal(W.removeTitle("Yusuf Amin", "trackLeads"), "Remove Yusuf Amin as a track lead?");
    assert.equal(W.removeTitle("Yusuf Amin", "runFacilitators"), "Remove Yusuf Amin as a run facilitator?");
    for (const sentence of Object.values(W.ROLE_AFTER)) {
      assert.equal(sentence.split(". ").length, 1, sentence);
      assert.doesNotMatch(sentence, /[–—]/);
    }
  });
});
