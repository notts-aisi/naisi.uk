/**
 * The rows the application form's hand-over wrote on a course run are served
 * to an admin and to the lead of the programme that names the run, on every
 * staff route that reads them, and to nobody else.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET   /api/courses/runs/[runId]/allocation
 *   POST  /api/courses/runs/[runId]/allocate
 *   POST  /api/courses/runs/[runId]/allocation/publish/test
 *   POST  /api/courses/runs/[runId]/allocation/publish
 *   GET   /api/courses/runs/[runId]/applications
 *   POST  /api/courses/runs/[runId]/applications/[uid]/decide
 *   PATCH /api/courses/runs/[runId]/applications/[uid]/notes
 *
 * ## What this guards
 *
 *  1. THE LEAD IS SERVED THEIR OWN PROGRAMME'S ROWS, as an admin is, with the
 *     same facts on each card: which groups their painted week covers, and
 *     whether they still hold the place.
 *  2. AND NO OTHER PROGRAMME'S. A row the form wrote for another programme,
 *     should one ever stand on the run, is not listed, placed, published or
 *     decided by the lead, and holds their press of Publish: a run that holds
 *     a row its presser is not served is not theirs to publish.
 *  3. A TRACK LEAD AND A REVIEWER ARE SERVED NONE OF THEM, as before.
 *  4. NEVER AN ADDRESS. Nothing a lead is served carries an email address.
 *
 * Real: every handler and the libraries under it. Stubbed: the session, the
 * Admin SDK handle and the mail door (`tests/lib/handoverWorld.mjs`).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { AGI_HOLDERS, COURSE, loadJoin, makeWorld, short } from "./lib/handoverWorld.mjs";
import { A, B, C, ROUND, RUN, TAIS, leadSeed } from "./lib/leadWorld.mjs";

const made = makeWorld("__leadRows");
const { world, reset, call, everything, lib } = made;
const join_ = await loadJoin(made);
const { routes, press, place, board, queue } = join_;
const words = await lib("courses", "publishWords.ts");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-27T17:38:00Z") });

const run = { runId: RUN.agi };
const rowPath = (uid) => `courseApplications/${RUN.agi}__${uid}`;

/**
 * A row another programme's hand-over would have written, standing on AGI
 * Strategy's run (Wen holds her place on Technical AI Safety), and a row of
 * the run's own (Nell applied to the run itself).
 */
const FOREIGN = {
  runId: RUN.agi,
  courseId: COURSE.agi,
  uid: "wen",
  displayName: "Wen Zhao",
  fromForm: { roundId: ROUND, programmeId: TAIS },
  status: "accepted",
};
const OWN = {
  runId: RUN.agi,
  courseId: COURSE.agi,
  uid: "nobody",
  displayName: "Nell Carter",
  email: "nobody@example.com",
  status: "accepted",
  availability: "Tuesdays 18:00\u201319:30",
};

beforeEach(async () => {
  reset(leadSeed(), { now: () => new Date() });
  assert.equal((await press()).status, 200);
});

const uidsOn = (answer) => answer.body.people.map((row) => row.uid).sort();

// ---------------------------------------------------------------------------
// 1. The lead's own programme's rows
// ---------------------------------------------------------------------------

describe("1. the lead is served their own programme's rows, as an admin is", () => {
  test("the board lists the people the hand-over put there, with the facts an admin's cards carry", async () => {
    const asLead = await board("claudia");
    const asAdmin = await board("zach");
    assert.equal(asLead.status, 200);
    assert.deepEqual(uidsOn(asLead), AGI_HOLDERS);
    assert.deepEqual(
      asLead.body.people.map((row) => [row.uid, row.fromForm]),
      asAdmin.body.people.map((row) => [row.uid, row.fromForm]),
    );
    // Amara painted Monday evenings and Thursday mornings, which covers no
    // group of this run; Bea painted nothing.
    const facts = Object.fromEntries(asLead.body.people.map((row) => [row.uid, row.fromForm]));
    assert.equal(facts.bea.availability, "none-given");
    assert.equal(facts.amara.holdsPlace, true);
  });

  test("the lead places them, and the board then has them in their groups", async () => {
    const placed = await place("claudia", [
      { uid: "amara", groupId: B },
      { uid: "bea", groupId: A },
    ]);
    assert.deepEqual(placed.body, { ok: true, placed: 2, rejected: [] });
    const groups = Object.fromEntries((await board("claudia")).body.people.map((row) => [row.uid, row.groupId]));
    assert.deepEqual([groups.amara, groups.bea], [B, A]);
  });

  test("the run's own queue lists them to the lead, with no address on any row", async () => {
    const shown = await queue("claudia");
    assert.equal(shown.status, 200);
    assert.deepEqual(shown.body.applications.map((row) => row.uid).sort(), AGI_HOLDERS);
    for (const row of shown.body.applications) assert.equal(row.email, null, row.uid);
  });

  test("somebody who gave their place back is on the lead's board as on an admin's, and says so", async () => {
    const gave = await join_.reply("tariq", { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    assert.equal(gave.status, 200);
    const tariq = (await board("claudia")).body.people.find((row) => row.uid === "tariq");
    assert.equal(tariq.fromForm.holdsPlace, false);
  });
});

// ---------------------------------------------------------------------------
// 2. And no other programme's
// ---------------------------------------------------------------------------

describe("2. a row another programme's hand-over wrote is not the lead's", () => {
  beforeEach(() => {
    world.db.seed(rowPath("wen"), FOREIGN);
    world.db.seed(rowPath("nobody"), OWN);
  });

  test("the board and the queue list the lead their own programme's people and the run's own applicant, and an admin everybody", async () => {
    assert.deepEqual(uidsOn(await board("claudia")), [...AGI_HOLDERS, "nobody"].sort());
    assert.deepEqual(uidsOn(await board("zach")), [...AGI_HOLDERS, "nobody", "wen"].sort());
    assert.deepEqual((await queue("claudia")).body.applications.map((row) => row.uid).sort(), [...AGI_HOLDERS, "nobody"].sort());
    const said = JSON.stringify((await board("claudia")).body) + JSON.stringify((await queue("claudia")).body);
    assert.ok(!said.includes("Wen"), "the lead was told about another programme's person");
  });

  test("the lead cannot place them, and is answered as for somebody with no application", async () => {
    const before = everything();
    const tried = await place("claudia", [{ uid: "wen", groupId: B }]);
    assert.deepEqual(tried.body, { ok: true, placed: 0, rejected: [{ uid: "wen", reason: "not-accepted" }] });
    assert.equal(everything(), before);
  });

  test("a run holding a row the lead is not served is not theirs to publish, and nothing is said about who it is", async () => {
    await place("zach", [
      { uid: "amara", groupId: B },
      { uid: "dev", groupId: B },
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: C },
      { uid: "nobody", groupId: C },
      { uid: "wen", groupId: A },
    ]);
    const before = everything();
    assert.deepEqual(short(await call("claudia", routes.publishTest.POST, run, { course: true })), [403, words.PUBLISH_ADMIN_ONLY]);
    assert.deepEqual(short(await call("claudia", routes.publish.POST, run, { body: { emails: 8 }, course: true })), [403, words.PUBLISH_ADMIN_ONLY]);
    const summary = (await board("claudia")).body.publish;
    assert.deepEqual([summary.adminOnly, summary.emails, summary.noAddress], [true, 0, []]);
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
    // An admin publishes it.
    assert.equal((await join_.publish("zach")).status, 200);
  });

  test("a lead the run also names as an admissions reviewer cannot decide or annotate that row", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { admissionsReviewerUids: ["claudia"] });
    const before = everything();
    assert.deepEqual(short(await call("claudia", routes.decide.POST, { runId: RUN.agi, uid: "wen" }, { body: { action: "reject" }, course: true })), [404, "Application not found"]);
    assert.deepEqual(short(await call("claudia", routes.notes.PATCH, { runId: RUN.agi, uid: "wen" }, { body: { reviewerNotes: "x" }, course: true })), [404, "Application not found"]);
    assert.equal(everything(), before);
    // Their own programme's row is theirs to decide there.
    assert.equal((await call("claudia", routes.notes.PATCH, { runId: RUN.agi, uid: "amara" }, { body: { reviewerNotes: "Keen." }, course: true })).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. A track lead and a reviewer
// ---------------------------------------------------------------------------

describe("3. a track lead and a reviewer are served none of the form's rows", () => {
  test("the board, the queue, a placement and a press, as before", async () => {
    world.db.seed(rowPath("nobody"), OWN);
    assert.deepEqual(uidsOn(await board("yusuf")), ["nobody"]);
    for (const who of ["yusuf", "lloyd"]) {
      assert.deepEqual((await queue(who)).body.applications.map((row) => row.uid), ["nobody"], who);
    }
    assert.deepEqual((await place("yusuf", [{ uid: "amara", groupId: B }])).body.rejected, [{ uid: "amara", reason: "not-accepted" }]);
    assert.deepEqual(short(await call("yusuf", routes.publishTest.POST, run, { course: true })), [403, words.PUBLISH_ADMIN_ONLY]);
  });

  test("the sentence a track lead is told names who may publish", () => {
    assert.equal(
      words.PUBLISH_ADMIN_ONLY,
      "This run’s people came from the application form, so only an admin or its programme’s lead can publish it or send its test.",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Never an address
// ---------------------------------------------------------------------------

describe("4. nothing a lead is served carries an address", () => {
  test("the board, the queue and Publish's summary", async () => {
    await place("claudia", [
      { uid: "amara", groupId: B },
      { uid: "dev", groupId: B },
    ]);
    for (const answer of [await board("claudia"), await queue("claudia")]) {
      assert.ok(!JSON.stringify(answer.body).includes("@"), JSON.stringify(answer.body).slice(0, 400));
    }
  });
});
