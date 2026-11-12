/**
 * Rules tests for a run's week's in-place editing records:
 *
 *  - `courseRuns/{runId}/weeks/{weekId}/history/{saveId}`: one record for
 *    every save of the week (who, when, the week's blocks after it);
 *  - `courseRuns/{runId}/weeks/{weekId}/editLock/{lockId}`: who is editing
 *    the week now.
 *
 * Both are shut to every browser, admins included: the editing routes under
 * /api/courses/runs/[runId]/weeks/[weekId]/ read and write them through the
 * Admin SDK after their gate (src/lib/courses/weekEdit/), because a history
 * names who edited and when, which is for admins and the programme's lead
 * alone. Everybody who may author the week itself (an admin, an approver, the
 * run's drafter-owner, a track lead) is refused here too, and the week they
 * sit under stays as readable and writable as it always was.
 */
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-week-history");
});
after(cleanup);
afterEach(clearData);

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

/** Every kind of signed-in caller, the week's own authors first. */
const EVERYONE = ["admin1", "approver", "drafter", "lead", "fellow", "pending1"];

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("lead", { role: "member" });
  await seedUser("fellow", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const WEEK = "courseRuns/run1/weeks/w03";

const SAVE = {
  seq: 2,
  kind: "edit",
  at: new Date("2026-11-10T14:24:00Z"),
  byUid: "admin1",
  summary: "Part 2: new link for a reading",
  blockId: "src-1",
  partNumber: 2,
  change: null,
  reach: { groups: 11, exceptGroupIds: [], exceptNames: [] },
  work: { ticks: 7, answers: 0, takenOut: 0 },
  restoredFrom: null,
  told: null,
  title: "What could go wrong",
  blockCount: 1,
  fingerprint: "0123456789abcdef",
  asked: {},
  blocks: [],
};

const HOLD = {
  holderUid: "admin1",
  since: new Date("2026-11-10T14:31:00Z"),
  keptAt: new Date("2026-11-10T14:31:30Z"),
  runId: "run1",
  weekId: "w03",
};

async function seedWorld() {
  await seed(async (db) => {
    await db.collection("courseRuns").doc("run1").set({
      courseId: "course1",
      courseTitle: "AI Safety Fundamentals",
      label: "Autumn 2026",
      academicYear: "2026/27",
      status: "running",
      startDate: "2026-11-02",
      weekPlan: [],
      applicationForm: [],
      applicationsOpenAt: null,
      applicationsCloseAt: null,
      applicationCap: null,
      authorUid: "drafter",
      admissionsReviewerUids: [],
      runFacilitatorUids: [],
      trackLeadUids: ["lead"],
      applicationCounts: { ...ZERO_COUNTS },
      groupCount: 0,
      channel: "cohort:run1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.doc(WEEK).set({ weekNumber: 3, title: "What could go wrong", published: true, blocks: [] });
    await db.doc(`${WEEK}/history/s000002`).set(SAVE);
    await db.doc(`${WEEK}/editLock/current`).set(HOLD);
  });
}

describe("a week's history and edit lock: shut to every browser", () => {
  it("nobody reads a save or lists them, the week's own authors and an admin included", async () => {
    await seedCast();
    await seedWorld();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.doc(`${WEEK}/history/s000002`).get());
      await assertFails(db.collection(`${WEEK}/history`).get());
      await assertFails(db.collection(`${WEEK}/history`).orderBy("seq", "desc").get());
    }
    const anon = await asAnon();
    await assertFails(anon.doc(`${WEEK}/history/s000002`).get());
    await assertFails(anon.collection(`${WEEK}/history`).get());
  });

  it("nobody writes a save: not a new one, not a change, not a delete", async () => {
    await seedCast();
    await seedWorld();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.doc(`${WEEK}/history/s000003`).set({ ...SAVE, seq: 3, byUid: uid }));
      await assertFails(db.doc(`${WEEK}/history/s000002`).update({ summary: "Changed by a browser" }));
      await assertFails(db.doc(`${WEEK}/history/s000002`).delete());
    }
  });

  it("nobody reads the edit lock, or takes, keeps or gives it back from a browser", async () => {
    await seedCast();
    await seedWorld();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.doc(`${WEEK}/editLock/current`).get());
      await assertFails(db.collection(`${WEEK}/editLock`).get());
      await assertFails(db.doc(`${WEEK}/editLock/current`).set({ ...HOLD, holderUid: uid }));
      await assertFails(db.doc(`${WEEK}/editLock/current`).update({ keptAt: new Date() }));
      await assertFails(db.doc(`${WEEK}/editLock/current`).delete());
    }
    const anon = await asAnon();
    await assertFails(anon.doc(`${WEEK}/editLock/current`).get());
  });

  it("the week itself stays as it was: readable by everybody signed in, writable by its authors", async () => {
    await seedCast();
    await seedWorld();
    for (const uid of EVERYONE) await assertSucceeds((await asUser(uid)).doc(WEEK).get());
    await assertSucceeds((await asUser("admin1")).doc(WEEK).update({ title: "What could go wrong, again" }));
    await assertFails((await asUser("fellow")).doc(WEEK).update({ title: "Not theirs to change" }));
  });
});
