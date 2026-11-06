/**
 * Rules tests for TOLD PLACEMENTS: a placement an admin made is read from a
 * browser by nobody but an admin, and opens nobody's progress pen, until
 * Publish has told its owner. That is the rule every page already keeps.
 *
 * A placement is one `courseEnrolments` row, and it is told when it is a
 * facilitator's row, when its owner took the seat themselves on an open run
 * (`selfEnrolled`), or when Publish has emailed its owner a group
 * (`allocatedEmailAt`). ONCE TOLD, A SEAT STAYS TOLD THROUGH ANY MOVE: the
 * allocate route keeps the stamp, writes the group they were told about into
 * `toldGroupId`, and the next Publish emails them that they moved, so neither
 * rule below ever reads the group. The pages ask `placementIsTold` and
 * `placementIsShownTo` in src/lib/firestore/courseEnrolments.ts;
 * `firestore.rules` asks `isToldPlacement(row)`. Two rules use it:
 *
 *  - the OWN-ROW READ of `courseEnrolments`: its owner reads a told row and
 *    nothing else; an admin reads every row; nobody reads another person's;
 *  - the PROGRESS PEN (`isEnrolledActive` on `courseProgress` writes): an
 *    active enrolment writes progress once it is told, and not before, an
 *    admin's own included.
 *
 * Every row here is written in the shape a route writes it: the allocate
 * route's new seat, the same seat once Publish has stamped it, the same seat
 * moved since (the stamp kept, `toldGroupId` naming the group it was told
 * about), the seat of somebody who left and was put back (the stamp deleted,
 * the delivery note kept), the enrol route's open seat and the facilitators
 * route's row. A rule that only held for tidy fixtures would be no rule at
 * all.
 *
 * ## The rule and the pages, row by row
 *
 * The last group runs the pages' own `placementIsTold` (through the unit
 * suite's TypeScript loader, as `users-profile-self-edit.test.mjs` runs the
 * profile form's function) and the rules over the same stored rows: every
 * combination of a `role`, a `selfEnrolled` and an `allocatedEmailAt` that is
 * absent, null, the right type or the wrong one. Each row is read back
 * through the SDK and handed to the normaliser exactly as a route would, and
 * the owner's read and a progress write must each be allowed exactly where
 * the pages call the row told. So the two cannot drift apart in either
 * direction without this file going red.
 *
 * EVERY CASE BUT THE ADMIN AND SIGNED-OUT ONES RUNS AS A MEMBER. An admin's
 * read branch is resource-independent, so testing as an admin would pass
 * whatever the member-facing half of the rule said.
 *
 * ## Mutation check (each run against the whole rules suite; restore byte for byte afterwards)
 *
 *  1. Drop `&& isToldPlacement(resource.data)` from the `courseEnrolments`
 *     read -> 5 go red: the untold seat, the put-back seat, the own-rows
 *     list, the table and the moves' agreement.
 *  2. Drop the told clause from `isEnrolledActive` -> 5: the untold seat's
 *     write, the put-back seat losing the pen, the admin's own untold seat,
 *     the table and the moves' agreement.
 *  3. Drop the facilitator half of `isToldPlacement` -> 3: the told shapes'
 *     reads, their writes and the table. Drop the `selfEnrolled` half -> the
 *     same 3.
 *  4. Drop the Publish stamp half -> 18: nine here (the moved seat's reads
 *     and pen among them), and the nine tests in `courses.test.mjs` and
 *     `courses-schedule.test.mjs` that stand on a told seed.
 *  5. Loosen `selfEnrolled == true` to `!= false`, the stamp's
 *     `is timestamp` to `!= null`, or `role == 'facilitator'` to
 *     `!= 'learner'` -> the table, each time: only it holds the rows a looser
 *     reading would call told (a null or "true" flag, a stamp stored as
 *     text, a null or "Facilitator" role).
 *  6. Read `row.role` without its default -> nothing goes red, and nothing
 *     can: in a rule, an `||` with one half that errors and another that is
 *     true is true, and a row refused by an error is refused all the same.
 *     The default keeps the helper from erroring, which the comment beside it
 *     asks a maintainer to keep.
 *  7. In src/lib/firestore/courseEnrolments.ts, drop `placementIsTold`'s
 *     facilitator line -> the table, naming the rows the pages no longer
 *     call told: the pages drifting from the rule.
 *
 * Namespace: `course-placements-told` (see `getTestEnv`: one project id per
 * file, or a parallel file's `clearFirestore()` wipes these fixtures).
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { createLoader } from "../../../tests/lib/tsLoader.mjs";
import {
  asAnon,
  asUser,
  assertFails,
  assertSucceeds,
  cleanup,
  clearData,
  getTestEnv,
  seed,
  seedUser,
} from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-placements-told");
});
after(cleanup);
afterEach(clearData);

// The pages' own rule, run from source.
const { loadTs } = createLoader();
const { placementIsTold, normalizeCourseEnrolment } = await loadTs(
  "lib/firestore/courseEnrolments.ts",
);

const RUN = "run1";
/** When Publish emailed the placed member their group. */
const TOLD_AT = new Date("2026-10-27T18:00:00Z");

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("ada", { role: "member" });
  await seedUser("ben", { role: "member" });
  await seedUser("cat", { role: "member" });
  await seedUser("dev", { role: "member" });
  await seedUser("eve", { role: "member" });
  await seedUser("fay", { role: "member" });
}

const enrolmentPath = (uid) => `courseEnrolments/${RUN}__${uid}`;

/** A seat the allocate route has just created: placed, nobody told yet. */
function allocatedSeat(uid, overrides = {}) {
  return {
    runId: RUN,
    courseId: "course1",
    uid,
    groupId: "grp1",
    status: "active",
    role: "learner",
    applicationId: `${RUN}__${uid}`,
    joinedWeekNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** The same seat once Publish has emailed its owner their group. */
const toldSeat = (uid) =>
  allocatedSeat(uid, { allocatedEmailAt: TOLD_AT, allocatedEmailDelivery: "sent" });

/**
 * The same seat moved since Publish told its owner about grp1: the allocate
 * route keeps the stamp and the delivery note, and writes the group they were
 * told about into `toldGroupId`. Still told: they see grp2 at once, and the
 * next Publish emails them that they moved.
 */
const movedToldSeat = (uid) =>
  allocatedSeat(uid, {
    groupId: "grp2",
    allocatedEmailAt: TOLD_AT,
    allocatedEmailDelivery: "sent",
    toldGroupId: "grp1",
  });

/**
 * One told seat through a run of moves, each step in the shape the allocate
 * route writes it: told about grp1 before the seat remembered its group (so
 * no `toldGroupId`), moved to grp2, to no group, and back to grp1.
 */
const MOVES = (uid) => [
  toldSeat(uid),
  movedToldSeat(uid),
  { ...movedToldSeat(uid), groupId: null },
  { ...movedToldSeat(uid), groupId: "grp1" },
];

/**
 * The seat of somebody who left and was put back: the allocate route deletes
 * the stamp (coming back earns a fresh first email) and the group it was told
 * about, and leaves the delivery note for the next Publish to overwrite, so
 * the note alone is present. Untold again.
 */
const putBackSeat = (uid) =>
  allocatedSeat(uid, { groupId: "grp2", allocatedEmailDelivery: "sent" });

/** The enrol route's seat on an open run: the owner chose it. */
const selfEnrolledSeat = (uid) =>
  allocatedSeat(uid, { selfEnrolled: true, applicationId: null, streamId: null });

/** The facilitators route's row: no group of its own, no stamp. */
function facilitatorRow(uid) {
  return {
    runId: RUN,
    courseId: "course1",
    uid,
    groupId: null,
    status: "active",
    role: "facilitator",
    applicationId: null,
    joinedWeekNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function seedRows(rows) {
  await seed(async (db) => {
    for (const [uid, row] of Object.entries(rows)) {
      await db.doc(enrolmentPath(uid)).set(row);
    }
  });
}

/** One of each shape, owned by a different member. */
const EVERY_SHAPE = () => ({
  ada: allocatedSeat("ada"),
  ben: putBackSeat("ben"),
  cat: toldSeat("cat"),
  dev: selfEnrolledSeat("dev"),
  eve: facilitatorRow("eve"),
  fay: movedToldSeat("fay"),
});

/**
 * The payload `buildProgressWrite` emits, with a cohort-visible comment.
 * Unticked: a tick is the tick route's (Admin SDK), and a browser create may
 * not set `completed` or `completedAt`; a comment is what a browser writes.
 */
function progressDoc(uid, itemId) {
  return {
    runId: RUN,
    uid,
    weekNumber: 1,
    itemKind: "material",
    itemId,
    completed: false,
    publicComment: "Worth reading twice.",
    hasPublicComment: true,
  };
}

const writeProgress = (db, uid, itemId) =>
  db.doc(`courseProgress/${RUN}__${uid}__${itemId}`).set(progressDoc(uid, itemId));

// ---------------------------------------------------------------------------
// The own-row read
// ---------------------------------------------------------------------------

describe("courseEnrolments: a placement is read by its owner once Publish has told them", () => {
  it("refuses its owner a seat an admin allocated and Publish has not told them about", async () => {
    await seedCast();
    await seedRows({ ada: allocatedSeat("ada") });
    const ada = await asUser("ada");
    await assertFails(ada.doc(enrolmentPath("ada")).get());
  });

  it("refuses its owner a seat put back after leaving, until Publish tells them again", async () => {
    // Coming back deletes the stamp: the row now names a group nobody has
    // emailed them about since. Publish pressed again stamps it, and the row
    // reads again.
    await seedCast();
    await seedRows({ ben: putBackSeat("ben") });
    const ben = await asUser("ben");
    await assertFails(ben.doc(enrolmentPath("ben")).get());

    await seedRows({ ben: { ...putBackSeat("ben"), allocatedEmailAt: TOLD_AT } });
    await assertSucceeds(ben.doc(enrolmentPath("ben")).get());
  });

  it("keeps a seat its owner was told about readable through every move: to another group, to no group and back", async () => {
    // A move keeps the stamp, so its owner reads where they are now at once,
    // wherever they are moved, and nothing waits for the next Publish.
    await seedCast();
    const fay = await asUser("fay");
    for (const row of MOVES("fay")) {
      await seedRows({ fay: row });
      await assertSucceeds(fay.doc(enrolmentPath("fay")).get());
    }
  });

  it("lets its owner read a seat Publish has told them about, moved since or not, a seat they took themselves and a facilitator's row", async () => {
    await seedCast();
    await seedRows(EVERY_SHAPE());
    for (const uid of ["cat", "dev", "eve", "fay"]) {
      const own = await asUser(uid);
      await assertSucceeds(own.doc(enrolmentPath(uid)).get());
    }
  });

  it("lets an admin read every row, told or not", async () => {
    await seedCast();
    await seedRows(EVERY_SHAPE());
    const admin = await asUser("admin1");
    for (const uid of Object.keys(EVERY_SHAPE())) {
      await assertSucceeds(admin.doc(enrolmentPath(uid)).get());
    }
  });

  it("never lets a member read anybody else's row, told or not, nor a signed-out visitor any", async () => {
    await seedCast();
    await seedRows(EVERY_SHAPE());
    const anon = await asAnon();
    for (const uid of Object.keys(EVERY_SHAPE())) {
      // Every OTHER member of the cast, told rows of their own included.
      for (const reader of ["ada", "ben", "cat", "dev", "eve", "fay"].filter((r) => r !== uid)) {
        const db = await asUser(reader);
        await assertFails(db.doc(enrolmentPath(uid)).get());
      }
      await assertFails(anon.doc(enrolmentPath(uid)).get());
    }
  });

  it("refuses a member's list of their own rows: a list is judged on its query, and `uid` alone cannot say told", async () => {
    // No page lists enrolments from the browser; every one reads them through
    // a route. This holds the consequence for whoever adds one: the query has
    // to be one the rule can prove told, or it is refused whole, however many
    // of the rows it would return are told.
    await seedCast();
    await seedRows({ cat: toldSeat("cat") });
    const cat = await asUser("cat");
    await assertFails(cat.collection("courseEnrolments").where("uid", "==", "cat").get());
  });
});

// ---------------------------------------------------------------------------
// The progress pen
// ---------------------------------------------------------------------------

describe("courseProgress: nobody writes progress on a run Publish has not told them they are on", () => {
  it("refuses a progress write on an allocated seat Publish has not told its owner about", async () => {
    await seedCast();
    await seedRows({ ada: allocatedSeat("ada") });
    const ada = await asUser("ada");
    await assertFails(writeProgress(ada, "ada", "m1"));
  });

  it("takes the pen from somebody put back after leaving, and gives it back when Publish tells them", async () => {
    // Told: they write. Put back after leaving: the stamp is gone and so is
    // the pen, for an update of a row they wrote while told as much as for a
    // new one. Publish again: they write again.
    await seedCast();
    await seedRows({ ben: toldSeat("ben") });
    const ben = await asUser("ben");
    await assertSucceeds(writeProgress(ben, "ben", "m1"));

    await seedRows({ ben: putBackSeat("ben") });
    await assertFails(writeProgress(ben, "ben", "m1"));
    await assertFails(writeProgress(ben, "ben", "m2"));

    await seedRows({ ben: { ...putBackSeat("ben"), allocatedEmailAt: TOLD_AT } });
    await assertSucceeds(writeProgress(ben, "ben", "m1"));
  });

  it("never takes the pen from somebody moved after Publish told them, wherever they are moved", async () => {
    // A move keeps the stamp, so it keeps the pen: an update of a row they
    // wrote in the group they were told about, and a new one, at every step.
    await seedCast();
    const fay = await asUser("fay");
    for (const [index, row] of MOVES("fay").entries()) {
      await seedRows({ fay: row });
      await assertSucceeds(writeProgress(fay, "fay", "m1"));
      await assertSucceeds(writeProgress(fay, "fay", `m${index + 2}`));
    }
  });

  it("lets a seat Publish has told, moved since or not, a seat its owner took and a facilitator's row each write progress", async () => {
    await seedCast();
    await seedRows(EVERY_SHAPE());
    for (const uid of ["cat", "dev", "eve", "fay"]) {
      const own = await asUser(uid);
      await assertSucceeds(writeProgress(own, uid, "m1"));
    }
  });

  it("refuses an admin's own untold seat too: the pen waits for Publish for everybody", async () => {
    // The admin READ branch is the board's: an admin sees every placement.
    // Writing progress is acting as a member of the run, and that waits for
    // Publish like anybody else's.
    await seedCast();
    await seedRows({ admin1: allocatedSeat("admin1") });
    const admin = await asUser("admin1");
    await assertFails(writeProgress(admin, "admin1", "m1"));

    await seedRows({ admin1: toldSeat("admin1") });
    await assertSucceeds(writeProgress(admin, "admin1", "m1"));
  });

  it("still needs the seat to be active: a told seat that has been left writes nothing", async () => {
    await seedCast();
    await seedRows({
      cat: { ...toldSeat("cat"), status: "withdrawn" },
      dev: { ...selfEnrolledSeat("dev"), status: "removed" },
    });
    await assertFails(writeProgress(await asUser("cat"), "cat", "m1"));
    await assertFails(writeProgress(await asUser("dev"), "dev", "m1"));
  });
});

// ---------------------------------------------------------------------------
// The rule and the pages agree, row by row
// ---------------------------------------------------------------------------

/** A field left out of the stored row altogether. */
const ABSENT = Symbol("absent");

/** Each field: absent, null, the values the routes write, and a wrong type. */
const ROLES = [ABSENT, null, "learner", "facilitator", "Facilitator"];
const SELF_ENROLLED = [ABSENT, null, false, true, "true"];
const STAMPS = [ABSENT, null, TOLD_AT, "2026-10-27T18:00:00Z"];

const show = (value) =>
  value === ABSENT ? "absent" : value instanceof Date ? "a timestamp" : JSON.stringify(value);

/** Every combination, as the stored row and a label for a failure message. */
function everyRow(uid) {
  const rows = [];
  for (const role of ROLES) {
    for (const selfEnrolled of SELF_ENROLLED) {
      for (const stamp of STAMPS) {
        const row = {
          runId: RUN,
          courseId: "course1",
          uid,
          groupId: "grp1",
          status: "active",
          joinedWeekNumber: 1,
          createdAt: new Date(),
        };
        if (role !== ABSENT) row.role = role;
        if (selfEnrolled !== ABSENT) row.selfEnrolled = selfEnrolled;
        if (stamp !== ABSENT) row.allocatedEmailAt = stamp;
        rows.push({
          row,
          label: `role ${show(role)}, selfEnrolled ${show(selfEnrolled)}, allocatedEmailAt ${show(stamp)}`,
        });
      }
    }
  }
  return rows;
}

/** Whether a rules call was allowed, as a boolean rather than a throw. */
async function allowed(promise) {
  try {
    await promise;
    return true;
  } catch (err) {
    if (err?.code === "permission-denied") return false;
    throw err;
  }
}

describe("the rule and the pages agree on every row", () => {
  it("allows the owner's read and a progress write exactly where `placementIsTold` says told", async () => {
    await seedCast();
    const ada = await asUser("ada");
    const rows = everyRow("ada");
    const disagreements = [];
    let told = 0;

    for (const [index, { row, label }] of rows.entries()) {
      // Stored, then read back through the SDK, so the normaliser sees what a
      // route sees: a timestamp comes back as a Timestamp, not as a Date.
      let stored;
      await seed(async (db) => {
        await db.doc(enrolmentPath("ada")).set(row);
        stored = (await db.doc(enrolmentPath("ada")).get()).data();
      });
      const pages = placementIsTold(normalizeCourseEnrolment(`${RUN}__ada`, stored));
      if (pages) told += 1;

      const read = await allowed(ada.doc(enrolmentPath("ada")).get());
      const write = await allowed(writeProgress(ada, "ada", `t${index}`));
      if (read !== pages) {
        disagreements.push(`${label}: the pages say ${pages ? "told" : "untold"}, the owner's read is ${read ? "allowed" : "refused"}`);
      }
      if (write !== pages) {
        disagreements.push(`${label}: the pages say ${pages ? "told" : "untold"}, a progress write is ${write ? "allowed" : "refused"}`);
      }
    }

    // The rows that differ first, so a drift on either side says which.
    assert.deepEqual(disagreements, [], `firestore.rules and placementIsTold disagree:\n  ${disagreements.join("\n  ")}`);
    // Not vacuous: the table holds both kinds of row, in proportions that
    // follow from it (only "facilitator", only true and only a timestamp tell).
    assert.equal(rows.length, ROLES.length * SELF_ENROLLED.length * STAMPS.length);
    assert.equal(rows.length - told, 4 * 4 * 3, "the untold rows: every other role, flag and stamp");
  });

  it("agree that a move keeps a told seat told at every step, and that a seat put back after leaving is untold", async () => {
    // The table above keeps every row in one group. This moves a told seat
    // between groups: each step, and the put-back seat, stored, read back and
    // judged by the pages and by both rules alike.
    await seedCast();
    const fay = await asUser("fay");
    const [told1, moved2, unplaced, back1] = MOVES("fay");
    const steps = [
      { label: "told about grp1", row: told1, told: true },
      { label: "moved to grp2", row: moved2, told: true },
      { label: "moved to no group", row: unplaced, told: true },
      { label: "moved back to grp1", row: back1, told: true },
      { label: "put back after leaving", row: putBackSeat("fay"), told: false },
    ];
    for (const [index, { label, row, told }] of steps.entries()) {
      let stored;
      await seed(async (db) => {
        await db.doc(enrolmentPath("fay")).set(row);
        stored = (await db.doc(enrolmentPath("fay")).get()).data();
      });
      assert.equal(placementIsTold(normalizeCourseEnrolment(`${RUN}__fay`, stored)), told, `the pages, ${label}`);
      assert.equal(await allowed(fay.doc(enrolmentPath("fay")).get()), told, `the owner's read, ${label}`);
      assert.equal(await allowed(writeProgress(fay, "fay", `s${index}`)), told, `a progress write, ${label}`);
    }
  });
});
