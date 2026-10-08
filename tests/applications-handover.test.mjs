/**
 * Accepted on the application form, then handed over to a course run.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over
 *   GET  /api/admissions/forms/[roundId]/programmes/[programmeId]/run
 *   POST /api/admissions/forms/[roundId]/application/reply
 *
 * ## What this guards
 *
 * The application form decides who holds a place on each programme. The
 * course system forms groups from a list of its own. The hand-over is the
 * one write that joins them: an admin presses it for a programme after
 * decision day, and each person who holds a place gets a row on the list its
 * course run's allocation board reads.
 *
 * This file runs the real handlers against one stored term, after decision
 * day, with the course side beside it, and holds:
 *
 *  1. WHO MAY PRESS. An admin, and nobody else.
 *  2. WHEN. Only once decisions have been sent, to a run that can take
 *     people and has left draft, and all of it asked again inside the
 *     transaction that writes.
 *  3. WHAT A PRESS WRITES. A row for each person who holds a place, with
 *     these fields and no others; the run's count; one line in the log.
 *     Nothing of anybody's application, no email, no place in a group.
 *  4. PRESSED AGAIN, AND TWICE AT ONCE. Nothing is written twice, and a row
 *     that is already there is never changed.
 *  5. WHO HOLDS A PLACE. `holdingOf` and nothing else: not somebody who gave
 *     it back, not somebody invited who has not answered, not somebody whose
 *     higher choice took them, and nobody decision day has not reached.
 *
 * What the board, a placement, Publish and the member area then do with
 * those rows is `tests/applications-handover-board.test.mjs` and
 * `tests/applications-handover-member-area.test.mjs`.
 * `tests/lib/handoverWorld.mjs` says what is real and what is stubbed.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGI,
  AGI_HOLDERS,
  ANSWER,
  CAST,
  COURSE,
  ROUND,
  RUN,
  TAIS,
  applicationPath,
  loadJoin,
  makeWorld,
  namedSeed,
  names,
  programmeParams,
  seedWorld,
  short,
} from "./lib/handoverWorld.mjs";

const made = makeWorld();
const { world, reset, call, everything } = made;
const join_ = await loadJoin(made);
const { routes, press, panel, reply, rowPath, rowsOn, run, pathsUnder } = join_;
const sentences = await made.lib("applications", "handover", "handOver.ts");

const NOW = new Date("2026-10-24T10:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

beforeEach(() => {
  // The reply route's own limiter is real, and counts by account.
  mock.timers.setTime(Date.now() + 15 * 60_000);
  reset(namedSeed());
});

// ---------------------------------------------------------------------------
// 1. Who may press
// ---------------------------------------------------------------------------

describe("1. who may hand people over", () => {
  const OTHERS = [
    ["claudia", "the programme's own lead"],
    ["lloyd", "one of its reviewers, who is also the run's admissions reviewer"],
    ["tess", "the lead of another programme"],
    ["yusuf", "the run's track lead, named on nothing on the form"],
    ["amara", "an applicant who holds a place on it"],
    ["nobody", "a member with no role and no application"],
    ["refused", "an account that was refused"],
  ];

  test("nobody signed in is told to sign in, and nothing is read or written", async () => {
    const before = everything();
    const reads = world.db.stats.reads;
    assert.deepEqual(short(await press(null)), [401, "Not signed in"]);
    assert.equal(everything(), before);
    assert.equal(world.db.stats.reads, reads);
  });

  for (const [who, what] of OTHERS) {
    test(`${what} is refused in the same words wherever they point, and nothing is read`, async () => {
      const before = everything();
      const reads = world.db.stats.reads;
      for (const params of [
        programmeParams(AGI),
        programmeParams("no-such-programme"),
        { roundId: "no-such-form", programmeId: AGI },
        { roundId: "older-round", programmeId: AGI },
      ]) {
        assert.deepEqual(short(await call(who, routes.handOver.POST, params)), [403, sentences.ONLY_AN_ADMIN_HANDS_OVER]);
      }
      assert.equal(everything(), before);
      assert.equal(world.db.stats.reads, reads, "a refusal read a document");
    });
  }

  test("a view-as session is refused before anything else", async () => {
    const before = everything();
    assert.deepEqual(short(await press("zach", AGI, { viewAs: true })), [403, "view-as"]);
    assert.equal(everything(), before);
  });

  test("an admin presses, and is told there is nothing where there is nothing", async () => {
    assert.equal((await call("zach", routes.handOver.POST, programmeParams("no-such-programme"))).status, 404);
    assert.equal((await call("zach", routes.handOver.POST, { roundId: "older-round", programmeId: AGI })).status, 404);
    const pressed = await press();
    assert.equal(pressed.status, 200, pressed.body?.error);
    assert.deepEqual(pressed.body.receipt, { handedOver: AGI_HOLDERS.length, alreadyThere: 0 });
  });
});

// ---------------------------------------------------------------------------
// 2. When
// ---------------------------------------------------------------------------

describe("2. when a hand-over can be pressed", () => {
  async function refused(words) {
    const before = everything();
    const response = await press();
    assert.equal(response.status, 409, response.body?.error);
    assert.match(response.body.error, words);
    assert.equal(everything(), before, "a refused hand-over wrote something");
    // The panel says the same thing where the button would be.
    assert.equal((await panel()).blocked, response.body.error);
  }

  test("not before decisions have been sent", async () => {
    reset(namedSeed({ sent: false }));
    await refused(/Decisions have not been sent yet/);
  });

  test("not while the programme names no run", async () => {
    reset(seedWorld());
    await refused(/Say which course run this programme places people on first/);
  });

  test("not while the run is still a draft", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "draft" });
    await refused(/still a draft/);
  });

  /** What can become of a run after a programme named it. */
  const NO_LONGER = [
    ["archived", { archived: true }, /has been archived/],
    ["being destroyed", { destroying: true }, /has been archived/],
    ["cancelled", { status: "cancelled" }, /finished or was cancelled/],
    ["completed", { status: "completed" }, /finished or was cancelled/],
    ["put into open enrolment", { enrolMode: "open" }, /session picker/],
    ["moved to another course", { courseId: COURSE.other }, /not a run of the course/],
  ];
  for (const [what, patch, words] of NO_LONGER) {
    test(`not once the run has been ${what}`, async () => {
      world.db.poke(`courseRuns/${RUN.agi}`, patch);
      await refused(words);
    });
  }

  test("not once the programme has lost its course tie, or the run has gone", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.courseId`]: null });
    await refused(/no longer tied to a course page/);
    reset(namedSeed());
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: "gone__run99999" });
    await refused(/no longer on the site/);
  });

  test("on every status a run can have once it has left draft", async () => {
    for (const status of ["applications-open", "applications-closed", "running"]) {
      reset(namedSeed());
      world.db.poke(`courseRuns/${RUN.agi}`, { status });
      assert.equal((await press()).status, 200, status);
    }
  });

  test("a run that stops standing while the press is running is refused, and nothing is written", async () => {
    world.db.beforeCommit = () => world.db.poke(`courseRuns/${RUN.agi}`, { archived: true });
    const response = await press();
    assert.equal(response.status, 409);
    assert.match(response.body.error, /has been archived/);
    assert.deepEqual(rowsOn(), []);
  });

  test("a programme pointed at another run while the press is running is refused", async () => {
    world.db.beforeCommit = () =>
      world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: RUN.agiSpring });
    const response = await press();
    assert.deepEqual(short(response), [409, sentences.CHANGED_WHILE_PRESSING]);
    assert.deepEqual(rowsOn(), []);
    assert.deepEqual(rowsOn(RUN.agiSpring), []);
  });
});

// ---------------------------------------------------------------------------
// 3. What a press writes
// ---------------------------------------------------------------------------

describe("3. what a press writes, and all it writes", () => {
  test("a row for each person who holds a place, with these fields and no others", async () => {
    await press();
    assert.deepEqual(rowsOn(), AGI_HOLDERS);
    for (const uid of AGI_HOLDERS) {
      assert.deepEqual(world.db.read(rowPath(uid)), {
        runId: RUN.agi,
        courseId: COURSE.agi,
        uid,
        displayName: CAST[uid].displayName,
        status: "accepted",
        fromForm: { roundId: ROUND, programmeId: AGI },
        createdAt: new Date("2026-10-24T10:00:00Z"),
        updatedAt: new Date("2026-10-24T10:00:00Z"),
      });
    }
  });

  test("the run's own count of accepted applications moves by exactly that many", async () => {
    await press();
    assert.deepEqual(run().applicationCounts, { pending: 0, accepted: AGI_HOLDERS.length, rejected: 0, waitlisted: 0, withdrawn: 0 });
  });

  test("one line in the log, about the run, that names nobody", async () => {
    await press();
    const lines = pathsUnder("courseAudit/").map((path) => world.db.read(path));
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0], {
      kind: "run-hand-over",
      runId: RUN.agi,
      roundId: null,
      groupId: null,
      subjectUid: null,
      actorUid: "zach",
      actorName: "Zach Levin",
      targetLabel: "Autumn 2026 · AGI Strategy",
      detail: "Zach Levin handed over 4 people who hold a place on AGI Strategy to this run’s allocation board.",
      at: new Date("2026-10-24T10:00:00Z"),
    });
    for (const uid of AGI_HOLDERS) {
      for (const word of [uid, ...CAST[uid].displayName.split(" ")]) {
        assert.ok(!JSON.stringify(lines[0]).includes(word), `the log names ${word}`);
      }
    }
  });

  test("and nothing else anywhere: no place in a group, no subscription, no email, no change to anybody's application", async () => {
    const before = Object.fromEntries(world.db.paths().map((path) => [path, JSON.stringify(world.db.read(path))]));
    await press();
    const changed = world.db
      .paths()
      .filter((path) => before[path] !== JSON.stringify(world.db.read(path)))
      .sort();
    assert.deepEqual(
      changed.map((path) => path.split("/")[0]).filter((collection, at, all) => all.indexOf(collection) === at),
      ["courseApplications", "courseAudit", "courseRuns"],
    );
    assert.deepEqual(changed.filter((path) => path.startsWith("courseRuns/")), [`courseRuns/${RUN.agi}`]);
    assert.deepEqual(pathsUnder("courseEnrolments/"), []);
    assert.deepEqual(pathsUnder("subscriptions/"), []);
    assert.equal(world.mail.length, 0);
    assert.equal(world.pushes.length, 0);
    // The run changed in its count and its timestamp, and in nothing else.
    const was = JSON.parse(before[`courseRuns/${RUN.agi}`]);
    const is = JSON.parse(JSON.stringify(run()));
    delete was.updatedAt;
    delete is.updatedAt;
    was.applicationCounts.accepted = AGI_HOLDERS.length;
    assert.deepEqual(is, was);
  });

  test("nothing a person wrote on the form is on the course side", async () => {
    await press();
    const courseSide = JSON.stringify(
      world.db
        .paths()
        .filter((path) => /^course(Applications|Audit|Runs|Groups|Enrolments)\//.test(path))
        .map((path) => world.db.read(path)),
    );
    for (const words of Object.values(ANSWER)) assert.ok(!courseSide.includes(words), words);
    for (const uid of AGI_HOLDERS) {
      const application = world.db.read(applicationPath(uid));
      assert.ok(!courseSide.includes(application.email), `${uid}'s address crossed over`);
      assert.ok(!courseSide.includes(application.sent.aboutYou.universityEmail), `${uid}'s university address crossed over`);
      for (const day of application.sent.availability.days) {
        if (/[1-9a-f]/.test(day)) assert.ok(!courseSide.includes(day), `${uid}'s painted week crossed over`);
      }
    }
    for (const key of ["answers", "availability", "rankedProgrammeIds", "suMembership", "email", "scores", "reviewerNotes"]) {
      for (const uid of AGI_HOLDERS) assert.ok(!Object.hasOwn(world.db.read(rowPath(uid)), key), `a row carries ${key}`);
    }
  });

  test("the name on a row is the one the committee's own screens show", async () => {
    world.db.poke(applicationPath("bea"), { displayName: "" });
    await press();
    // With no account name on the application, what they asked to be called.
    assert.equal(world.db.read(rowPath("bea")).displayName, "Bea");
  });
});

// ---------------------------------------------------------------------------
// 4. Pressed again, and twice at once
// ---------------------------------------------------------------------------

describe("4. nothing is written twice", () => {
  test("a second press writes nothing at all, and says so", async () => {
    await press();
    const before = everything();
    const writes = world.db.stats.writes.length;
    const again = await press();
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.receipt, { handedOver: 0, alreadyThere: AGI_HOLDERS.length });
    assert.equal(everything(), before);
    assert.equal(world.db.stats.writes.length, writes, "a press with nothing to do wrote something");
  });

  test("two presses at once: the one that lands second creates nothing, and the count moves once", async () => {
    // The other press commits between this one's reads and its commit.
    world.db.beforeCommit = () => {
      for (const uid of AGI_HOLDERS) {
        world.db.seed(rowPath(uid), {
          runId: RUN.agi,
          courseId: COURSE.agi,
          uid,
          displayName: CAST[uid].displayName,
          status: "accepted",
          fromForm: { roundId: ROUND, programmeId: AGI },
        });
      }
      world.db.poke(`courseRuns/${RUN.agi}`, { "applicationCounts.accepted": AGI_HOLDERS.length });
    };
    const pressed = await press();
    assert.equal(pressed.status, 200);
    assert.deepEqual(pressed.body.receipt, { handedOver: 0, alreadyThere: AGI_HOLDERS.length });
    assert.equal(run().applicationCounts.accepted, AGI_HOLDERS.length);
    assert.deepEqual(rowsOn(), AGI_HOLDERS);
    assert.deepEqual(pathsUnder("courseAudit/"), [], "a press that made nothing logged a hand-over");
  });

  test("two presses at once, one part way: each row is made once and the count is right", async () => {
    world.db.beforeCommit = () => {
      for (const uid of AGI_HOLDERS.slice(0, 2)) {
        world.db.seed(rowPath(uid), { runId: RUN.agi, courseId: COURSE.agi, uid, displayName: "x", status: "accepted", fromForm: { roundId: ROUND, programmeId: AGI } });
      }
      world.db.poke(`courseRuns/${RUN.agi}`, { "applicationCounts.accepted": 2 });
    };
    const pressed = await press();
    assert.deepEqual(pressed.body.receipt, { handedOver: 2, alreadyThere: 2 });
    assert.equal(run().applicationCounts.accepted, AGI_HOLDERS.length);
    assert.deepEqual(rowsOn(), AGI_HOLDERS);
  });

  test("a row that is already there is left exactly as it is, whatever it says", async () => {
    for (const [uid, row] of [
      ["amara", { runId: RUN.agi, uid: "amara", status: "rejected", decidedByUid: "zach", email: "kept@example.com" }],
      ["dev", { runId: RUN.agi, uid: "dev", status: "pending", availability: "Mondays 18:00–19:30" }],
    ]) {
      world.db.seed(rowPath(uid), row);
    }
    const before = [world.db.read(rowPath("amara")), world.db.read(rowPath("dev"))];
    const pressed = await press();
    assert.deepEqual(pressed.body.receipt, { handedOver: 2, alreadyThere: 2 });
    assert.deepEqual([world.db.read(rowPath("amara")), world.db.read(rowPath("dev"))], before);
    assert.equal(run().applicationCounts.accepted, 2);
    // And the panel names them for an admin to put right on the run's own list.
    assert.deepEqual(names((await panel()).notAccepted), ["Amara Okafor", "Dev Patel"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Who holds a place
// ---------------------------------------------------------------------------

describe("5. who is handed over is who holds a place, and nobody else", () => {
  test("not somebody who gave their place back before the hand-over", async () => {
    await press();
    assert.ok(!rowsOn().includes("nina"));
    assert.equal(world.db.read(applicationPath("nina")).status, "withdrawn");
  });

  test("not somebody invited who has not answered, and not somebody told no offer", async () => {
    await press();
    assert.ok(!rowsOn().includes("ines"));
    assert.ok(!rowsOn().includes("omar"));
  });

  test("not somebody whose higher choice took them: one place a term", async () => {
    // Wen ranked Technical AI Safety first and both programmes accepted.
    await press();
    assert.ok(!rowsOn().includes("wen"));
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${TAIS}.runId`]: RUN.tais });
    const pressed = await press("zach", TAIS);
    assert.deepEqual(pressed.body.receipt, { handedOver: 1, alreadyThere: 0 });
    assert.deepEqual(rowsOn(RUN.tais), ["wen"]);
    assert.deepEqual(world.db.read(rowPath("wen", RUN.tais)).fromForm, { roundId: ROUND, programmeId: TAIS });
    assert.equal(world.db.read(rowPath("wen", RUN.tais)).courseId, COURSE.tais);
  });

  test("nobody at all until they have been told, whatever a lead has decided", async () => {
    // The term is marked as sent, and one person's result was never published.
    world.db.poke(applicationPath("dev"), { result: null, status: "submitted" });
    await press();
    assert.ok(!rowsOn().includes("dev"));
    assert.deepEqual(rowsOn(), AGI_HOLDERS.filter((uid) => uid !== "dev"));
  });

  test("somebody who accepts an invitation afterwards is added by the next press, once", async () => {
    await press();
    const accepted = await reply("ines", { reply: "accept-invitation" });
    assert.equal(accepted.status, 200, accepted.body?.error);
    assert.deepEqual(names((await panel()).toHandOver), ["Ines Carvalho"]);

    const again = await press();
    assert.deepEqual(again.body.receipt, { handedOver: 1, alreadyThere: AGI_HOLDERS.length });
    assert.deepEqual(rowsOn(), [...AGI_HOLDERS, "ines"].sort());
    assert.equal(run().applicationCounts.accepted, AGI_HOLDERS.length + 1);
    assert.deepEqual((await press()).body.receipt, { handedOver: 0, alreadyThere: AGI_HOLDERS.length + 1 });
  });
});


// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

describe("the panel beside the button", () => {
  test("names nobody, and counts nobody, until decisions have been sent", async () => {
    reset(namedSeed({ sent: false }));
    const shown = await panel();
    assert.deepEqual(
      [shown.holders, shown.onTheList, shown.toHandOver, shown.gaveBack, shown.notAccepted],
      [null, 0, [], [], []],
    );
    const said = JSON.stringify(shown);
    for (const uid of [...AGI_HOLDERS, "nina", "ines", "omar", "wen"]) {
      assert.ok(!said.includes(CAST[uid].displayName.split(" ")[0]), `${uid} is named before anybody has been told`);
    }
  });

  test("says where the run's board and its own list are, and carries nothing of an application", async () => {
    await press();
    const shown = await panel();
    assert.equal(shown.boardPath, `/admin/courses/${COURSE.agi}/runs/${RUN.agi}/allocation`);
    assert.equal(shown.listPath, `/admin/courses/${COURSE.agi}/runs/${RUN.agi}/applications`);
    assert.deepEqual([shown.holders, shown.onTheList, shown.otherRows, shown.blocked], [AGI_HOLDERS.length, AGI_HOLDERS.length, 0, null]);
    const said = JSON.stringify(shown);
    for (const words of Object.values(ANSWER)) assert.ok(!said.includes(words), words);
    assert.ok(!said.includes("@"), "an address is on the panel");
  });

  test("counts a row that did not come from this programme, without naming anybody", async () => {
    await press();
    world.db.seed(rowPath("nobody"), { runId: RUN.agi, uid: "nobody", displayName: "Nell Carter", status: "pending" });
    const shown = await panel();
    assert.equal(shown.otherRows, 1);
    assert.ok(!JSON.stringify(shown).includes("Nell"));
  });
});

