/**
 * The allocation board, a placement and Publish, for people the application
 * form placed on a course run.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET   /api/courses/runs/[runId]/allocation
 *   POST  /api/courses/runs/[runId]/allocate
 *   POST  /api/courses/runs/[runId]/allocation/publish
 *   GET   /api/courses/runs/[runId]/applications
 *   POST  /api/courses/runs/[runId]/applications/[uid]/decide
 *   PATCH /api/courses/runs/[runId]/applications/[uid]/notes
 *   POST  /api/courses/runs/[runId]/enrolments/[uid]/remove
 *
 * ## What this guards
 *
 * An admin's hand-over writes a row for each person who holds a place on a
 * programme (`tests/applications-handover.test.mjs`). Everything after that
 * is the course system's own code, written before the application form
 * existed, reading rows it did not make. This file runs those handlers for
 * real, against the same stored term, and holds:
 *
 *  6. THE BOARD LISTS THOSE PEOPLE AND ONLY THOSE, for an admin, and says
 *     for each group whether the week a person painted on the form covers
 *     its whole session. Nothing of an application is in what it sends.
 *     A ROW THE FORM PUT THERE IS AN ADMIN'S, on every route that reads rows:
 *     the run's track lead and its reviewer are listed none of them, cannot
 *     place, publish, decide or annotate one, and learn nothing from a
 *     refusal. They keep everything they could do for the run's own rows.
 *  7. A PLACEMENT AND A PUBLISH THEN WORK with the code that was already
 *     there: the first placement makes the place on the run, and Publish
 *     tells each person once, at their account's own address.
 *  8. A PLACE GIVEN BACK is named for an admin and removed by nothing, and
 *     the admin can act with the routes that already existed.
 *
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
  GROUP,
  ROUND,
  RUN,
  applicationPath,
  loadJoin,
  makeWorld,
  namedSeed,
  names,
  short,
} from "./lib/handoverWorld.mjs";

const made = makeWorld();
const { world, reset, call, everything } = made;
const join_ = await loadJoin(made);
const { routes, press, panel, reply, board, place, publish, queue, rowPath, run, pathsUnder } = join_;

const NOW = new Date("2026-10-24T10:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

beforeEach(() => {
  // The reply route's own limiter is real, and counts by account.
  mock.timers.setTime(Date.now() + 15 * 60_000);
  reset(namedSeed());
});

// ---------------------------------------------------------------------------
// 6. The board
// ---------------------------------------------------------------------------

describe("6. the allocation board", () => {
  test("lists, for an admin, the people who hold a place and only those", async () => {
    assert.deepEqual((await board()).body.people, []);
    await press();
    const shown = (await board()).body;
    assert.deepEqual(shown.people.map((row) => row.uid).sort(), AGI_HOLDERS);
    assert.deepEqual(
      shown.people.map((row) => row.displayName).sort(),
      // The name the account goes by today, read live by the board.
      ["Amara", "Bea", "Dev", "Tariq"],
    );
    for (const row of shown.people) {
      assert.deepEqual([row.groupId, row.enrolmentStatus, row.availability], [null, "none", []]);
    }
  });

  test("says for each group whether the week they painted covers its whole session", async () => {
    await press();
    const facts = Object.fromEntries((await board()).body.people.map((row) => [row.uid, row.fromForm]));
    assert.deepEqual(facts, {
      // Free Monday evening and Thursday morning.
      amara: { availability: "given", canMakeGroupIds: [GROUP.monday, GROUP.thursday], holdsPlace: true },
      // Free Monday evening only.
      dev: { availability: "given", canMakeGroupIds: [GROUP.monday], holdsPlace: true },
      // Free for the first hour of a ninety minute session, which is not the session.
      tariq: { availability: "given", canMakeGroupIds: [], holdsPlace: true },
      // Painted nothing: said plainly, and not the same as making none.
      bea: { availability: "none-given", canMakeGroupIds: [], holdsPlace: true },
    });
  });

  test("a group with no session time is never one somebody can make", async () => {
    await press();
    for (const row of (await board()).body.people) {
      assert.ok(!row.fromForm.canMakeGroupIds.includes(GROUP.unset), row.uid);
    }
  });

  test("follows the application: a week painted on a different grid is read on its own grid", async () => {
    await press();
    // Drawn from 08:00 in half hours: Monday 18:00 to 19:30 is slots 20, 21 and 22.
    world.db.poke(applicationPath("bea"), {
      "sent.availability": { version: 1, startMinute: 480, endMinute: 1320, slotMinutes: 30, days: ["", "00000e0", "", "", "", "", ""] },
    });
    const bea = (await board()).body.people.find((row) => row.uid === "bea");
    assert.deepEqual(bea.fromForm, { availability: "given", canMakeGroupIds: [GROUP.monday], holdsPlace: true });
  });

  test("carries nothing of anybody's application: not the week, not an answer, not an address", async () => {
    await press();
    const sent = JSON.stringify((await board()).body);
    for (const words of Object.values(ANSWER)) assert.ok(!sent.includes(words), words);
    for (const uid of AGI_HOLDERS) {
      assert.ok(!sent.includes(`${uid}@`), `${uid}'s address is on the board`);
      for (const day of world.db.read(applicationPath(uid)).sent.availability.days) {
        if (/[1-9a-f]/.test(day)) assert.ok(!sent.includes(day), `${uid}'s painted week is on the board`);
      }
    }
    assert.deepEqual(Object.keys((await board()).body.people[0].fromForm).sort(), ["availability", "canMakeGroupIds", "holdsPlace"]);
  });

  test("when the form has been destroyed, nobody leaves the board and nothing is claimed about their week", async () => {
    await press();
    // One person's application has gone, and the form is still there.
    await world.db.collection("admissionApplications").doc(`${ROUND}__dev`).delete();
    let facts = Object.fromEntries((await board()).body.people.map((row) => [row.uid, row.fromForm]));
    assert.deepEqual(facts.dev, { availability: "not-on-file", canMakeGroupIds: [], holdsPlace: true });
    assert.equal(facts.amara.availability, "given");

    // The whole form has gone, as a destroy leaves it: the form, every
    // application on it and every decision. The run and its rows are kept.
    for (const path of world.db.paths()) {
      const [collection, id] = path.split("/");
      if (["admissionRounds", "admissionApplications", "admissionDecisions"].includes(collection) && path.split("/").length === 2) {
        await world.db.collection(collection).doc(id).delete();
      }
    }
    const shown = (await board()).body;
    assert.deepEqual(shown.people.map((row) => row.uid).sort(), AGI_HOLDERS);
    facts = Object.fromEntries(shown.people.map((row) => [row.uid, row.fromForm]));
    for (const uid of AGI_HOLDERS) {
      assert.deepEqual(facts[uid], { availability: "not-on-file", canMakeGroupIds: [], holdsPlace: true }, uid);
    }
  });

  describe("a row the form put there is an admin's, on every route that reads rows", () => {
    /** A row of the run's own, as its older form would have left it accepted. */
    const OWN_ROW = { runId: RUN.agi, courseId: COURSE.agi, uid: "nobody", displayName: "Nell Carter", email: "nobody@example.com", status: "accepted", availability: "Mondays 18:00–19:30" };

    beforeEach(async () => {
      await press();
      world.db.seed(rowPath("nobody"), OWN_ROW);
    });

    test("the run's track lead opens the board and is listed only the person who applied to the run itself", async () => {
      const shown = await board("yusuf");
      assert.equal(shown.status, 200);
      assert.deepEqual(shown.body.people.map((row) => row.uid), ["nobody"]);
      assert.equal(shown.body.people[0].fromForm, null);
      assert.deepEqual(shown.body.people[0].availability, ["Mondays 18:00–19:30"]);
      assert.equal(shown.body.groups.length, 3);
      const sent = JSON.stringify(shown.body);
      for (const uid of AGI_HOLDERS) assert.ok(!sent.includes(CAST[uid].displayName.split(" ")[0]), uid);
      // An admin is listed everybody.
      assert.deepEqual((await board("zach")).body.people.map((row) => row.uid).sort(), [...AGI_HOLDERS, "nobody"].sort());
    });

    test("the run's own queue lists them to an admin, and to nobody else", async () => {
      for (const who of ["yusuf", "lloyd"]) {
        const shown = await queue(who);
        assert.equal(shown.status, 200, who);
        assert.deepEqual(shown.body.applications.map((row) => row.uid), ["nobody"], who);
      }
      assert.deepEqual((await queue("zach")).body.applications.map((row) => row.uid).sort(), [...AGI_HOLDERS, "nobody"].sort());
    });

    test("a track lead cannot place one, and is answered as for somebody with no application", async () => {
      const before = everything();
      const tried = await place("yusuf", [
        { uid: "amara", groupId: GROUP.monday },
        { uid: "no-such-person", groupId: GROUP.monday },
      ]);
      assert.equal(tried.status, 200);
      assert.deepEqual(tried.body, {
        ok: true,
        placed: 0,
        rejected: [
          { uid: "amara", reason: "not-accepted" },
          { uid: "no-such-person", reason: "not-accepted" },
        ],
      });
      assert.equal(everything(), before);
      // The person who applied to the run itself is theirs to place, as before.
      assert.equal((await place("yusuf", [{ uid: "nobody", groupId: GROUP.monday }])).body.placed, 1);
    });

    test("a track lead's publish emails none of them and names none of them", async () => {
      await place("zach", [{ uid: "amara", groupId: GROUP.monday }]);
      await place("yusuf", [{ uid: "nobody", groupId: GROUP.monday }]);
      const published = await publish("yusuf");
      assert.equal(published.status, 200, JSON.stringify(published.body));
      assert.deepEqual(world.mail.map((message) => message.to), ["nobody@example.com"]);
      const said = JSON.stringify(published.body);
      for (const uid of AGI_HOLDERS) assert.ok(!said.includes(CAST[uid].displayName.split(" ")[0]), uid);
      assert.equal(world.db.read(`courseEnrolments/${RUN.agi}__amara`).allocatedEmailAt, undefined);
    });

    test("the run's reviewer cannot decide or annotate one, and is told there is no such application", async () => {
      const before = everything();
      const decided = await call("lloyd", routes.decide.POST, { runId: RUN.agi, uid: "amara" }, { body: { action: "reject" }, course: true });
      const noted = await call("lloyd", routes.notes.PATCH, { runId: RUN.agi, uid: "amara" }, { body: { reviewerNotes: "x" }, course: true });
      assert.deepEqual(short(decided), [404, "Application not found"]);
      assert.deepEqual(short(noted), [404, "Application not found"]);
      // Exactly what a uid with no row is answered.
      assert.deepEqual(short(await call("lloyd", routes.decide.POST, { runId: RUN.agi, uid: "no-such-person" }, { body: { action: "reject" }, course: true })), [404, "Application not found"]);
      assert.equal(everything(), before);
      // The row of the run's own is still theirs.
      assert.equal((await call("lloyd", routes.notes.PATCH, { runId: RUN.agi, uid: "nobody" }, { body: { reviewerNotes: "Keen." }, course: true })).status, 200);
    });

    test("an admin can decide one on the run's own list, and nobody is emailed, because a row carries no address", async () => {
      const decided = await call("zach", routes.decide.POST, { runId: RUN.agi, uid: "tariq" }, { body: { action: "reject" }, course: true });
      assert.equal(decided.status, 200, decided.body?.error);
      await new Promise((done) => setImmediate(done));
      assert.equal(world.db.read(rowPath("tariq")).status, "rejected");
      assert.equal(world.mail.length, 0);
      assert.deepEqual([run().applicationCounts.accepted, run().applicationCounts.rejected], [AGI_HOLDERS.length - 1, 1]);
      assert.ok(!(await board()).body.people.some((row) => row.uid === "tariq"));
    });
  });
});


// ---------------------------------------------------------------------------
// 7. A placement, a publish and the member area
// ---------------------------------------------------------------------------

describe("7. a placement and a publish then work, with the code that was already there", () => {
  test("the board's first placement makes the place on the run, as it always has", async () => {
    await press();
    const placed = await place("zach", [
      { uid: "amara", groupId: GROUP.thursday },
      { uid: "dev", groupId: GROUP.monday },
    ]);
    assert.deepEqual(placed.body, { ok: true, placed: 2, rejected: [] });
    const seat = world.db.read(`courseEnrolments/${RUN.agi}__amara`);
    assert.deepEqual(
      [seat.runId, seat.courseId, seat.uid, seat.groupId, seat.status, seat.role, seat.applicationId],
      [RUN.agi, COURSE.agi, "amara", GROUP.thursday, "active", "learner", `${RUN.agi}__amara`],
    );
    assert.equal(world.db.read(`courseGroups/${GROUP.thursday}`).memberCount, 1);
    assert.equal(world.db.read(`courseGroups/${GROUP.monday}`).memberCount, 1);
    const shown = (await board()).body.people.find((row) => row.uid === "amara");
    assert.deepEqual([shown.groupId, shown.enrolmentStatus], [GROUP.thursday, "active"]);
  });

  test("nobody who was not handed over can be placed", async () => {
    await press();
    const tried = await place("zach", [
      { uid: "nina", groupId: GROUP.monday },
      { uid: "ines", groupId: GROUP.monday },
      { uid: "omar", groupId: GROUP.monday },
      { uid: "wen", groupId: GROUP.monday },
    ]);
    assert.equal(tried.body.placed, 0);
    assert.deepEqual(tried.body.rejected.map((entry) => entry.reason), ["not-accepted", "not-accepted", "not-accepted", "not-accepted"]);
    assert.deepEqual(pathsUnder("courseEnrolments/"), []);
  });

  test("Publish waits until everybody handed over is in a group, then tells each of them once", async () => {
    await press();
    await place("zach", [
      { uid: "amara", groupId: GROUP.thursday },
      { uid: "dev", groupId: GROUP.monday },
    ]);
    const early = await publish();
    assert.equal(early.status, 409);
    assert.deepEqual([...early.body.unplaced].sort(), ["Bea Lindqvist", "Tariq Mensah"]);
    assert.equal(world.mail.length, 0);

    await place("zach", [
      { uid: "bea", groupId: GROUP.monday },
      { uid: "tariq", groupId: GROUP.thursday },
    ]);
    const published = await publish();
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.deepEqual([published.body.emailed, published.body.skipped], [4, 0]);
    // To the account's own address: a row from the form carries none.
    assert.deepEqual(world.mail.map((message) => message.to).sort(), AGI_HOLDERS.map((uid) => `${uid}@example.com`));
    for (const uid of AGI_HOLDERS) {
      assert.ok(world.db.read(`courseEnrolments/${RUN.agi}__${uid}`).allocatedEmailAt instanceof Date, uid);
    }
    // The cohort's mailing list, written by Publish as it always was.
    const lists = pathsUnder("subscriptions/").map((path) => world.db.read(path));
    assert.deepEqual(lists.map((row) => row.email).sort(), AGI_HOLDERS.map((uid) => `${uid}@example.com`));
    for (const row of lists) assert.deepEqual([row.channel, row.subscribed, row.confirmed], [`cohort:${RUN.agi}`, true, true]);
    assert.deepEqual(world.pushes.map((push) => push.uid).sort(), AGI_HOLDERS);

    const again = await publish();
    assert.deepEqual([again.body.emailed, world.mail.length], [0, 4]);
  });
});


// ---------------------------------------------------------------------------
// 8. A place given back
// ---------------------------------------------------------------------------

describe("8. a place given back", () => {
  const WHY = { kind: "times", other: "" };

  test("before the hand-over: they are not handed over, and no list names them", async () => {
    const shown = await panel();
    assert.equal(shown.holders, AGI_HOLDERS.length);
    assert.deepEqual(names(shown.toHandOver).sort(), AGI_HOLDERS.map((uid) => CAST[uid].displayName).sort());
    assert.ok(!JSON.stringify(shown).includes("Nina"));
    await press();
    assert.ok(!JSON.stringify(await panel()).includes("Nina"));
  });

  test("afterwards: nothing removes them, and the panel names them for an admin", async () => {
    await press();
    await place("zach", [{ uid: "tariq", groupId: GROUP.monday }]);
    const gaveBack = await reply("tariq", { reply: "cant-make-it", reason: WHY });
    assert.equal(gaveBack.status, 200, gaveBack.body?.error);

    const before = everything();
    assert.deepEqual((await press()).body.receipt, { handedOver: 0, alreadyThere: AGI_HOLDERS.length - 1 });
    assert.equal(everything(), before, "a press after somebody gave a place back wrote something");
    // Still on the run's list, still in their group: nothing here takes anybody off.
    assert.equal(world.db.read(rowPath("tariq")).status, "accepted");
    assert.equal(world.db.read(`courseEnrolments/${RUN.agi}__tariq`).status, "active");

    const shown = await panel();
    assert.deepEqual([shown.holders, shown.onTheList], [AGI_HOLDERS.length - 1, AGI_HOLDERS.length - 1]);
    assert.deepEqual(shown.gaveBack, [
      {
        uid: "tariq",
        name: "Tariq Mensah",
        applicationPath: `/admin/admissions/forms/${ROUND}/programmes/${AGI}/applications/tariq`,
      },
    ]);
    assert.deepEqual(shown.toHandOver, []);
    // And the board says so on their card.
    const card = (await board()).body.people.find((row) => row.uid === "tariq");
    assert.equal(card.fromForm.holdsPlace, false);
  });

  test("the admin acts with what was already there: off their group, then off the run's list", async () => {
    await press();
    await place("zach", [{ uid: "tariq", groupId: GROUP.monday }]);
    await reply("tariq", { reply: "cant-make-it", reason: WHY });

    const removed = await call("zach", routes.remove.POST, { runId: RUN.agi, uid: "tariq" }, { course: true });
    assert.equal(removed.status, 200, removed.body?.error);
    assert.equal(world.db.read(`courseGroups/${GROUP.monday}`).memberCount, 0);
    const decided = await call("zach", routes.decide.POST, { runId: RUN.agi, uid: "tariq" }, { body: { action: "reject" }, course: true });
    assert.equal(decided.status, 200, decided.body?.error);
    await new Promise((done) => setImmediate(done));
    assert.equal(world.mail.length, 0, "taking somebody off a run's list emailed them");

    assert.deepEqual((await board()).body.people.map((row) => row.uid).sort(), AGI_HOLDERS.filter((uid) => uid !== "tariq"));
    assert.deepEqual((await panel()).gaveBack, []);
    // And a later press does not put them back.
    assert.deepEqual((await press()).body.receipt, { handedOver: 0, alreadyThere: AGI_HOLDERS.length - 1 });
    assert.equal(world.db.read(rowPath("tariq")).status, "rejected");
  });

});

