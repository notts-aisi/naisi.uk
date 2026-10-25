/**
 * Rules tests for `coursePitches`, pitching week's pitches: shut to every
 * browser, admins and the pitch's own pitcher included. The routes under
 * /api/courses/runs/[runId]/pitching/ are the only writers, and the server
 * decides what anybody is shown of a pitch: who picked what is never sent to
 * a browser, so the rows that hold it cannot be read from one either.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
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
  await getTestEnv("course-pitches");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("committee1", { role: "committee", suRecognised: true });
  await seedUser("pitcher", { role: "member" });
  await seedUser("picker", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "drafter", "approver", "committee1", "pitcher", "picker", "pending1"];

const PITCH = {
  runId: "run1",
  courseId: "course1",
  groupId: "grp1",
  weekId: "w03",
  weekNumber: 3,
  title: "Probe transfer",
  paper: { kind: "typed", title: "A paper about probes" },
  twist: "Try it on a smaller open model.",
  pitcherUids: ["pitcher"],
  wouldJoinUids: ["picker"],
};

async function seedPitch() {
  await seed(async (db) => {
    await db.collection("coursePitches").doc("p1").set(PITCH);
  });
}

describe("coursePitches: shut to every browser", () => {
  it("nobody reads a pitch or lists pitches, its pitcher, a picker and an admin included", async () => {
    await seedCast();
    await seedPitch();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("coursePitches").doc("p1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("pitcher").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePitches").doc("p1").get());
      await assertFails(db.collection("coursePitches").where("runId", "==", "run1").get());
      await assertFails(db.collection("coursePitches").where("wouldJoinUids", "array-contains", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("coursePitches").doc("p1").get());
  });

  it("nobody writes one: not a new pitch, not a pick added, not a delete", async () => {
    await seedCast();
    await seedPitch();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePitches").doc(`new-${uid}`).set({ ...PITCH, pitcherUids: [uid], wouldJoinUids: [] }));
      await assertFails(db.collection("coursePitches").doc("p1").update({ wouldJoinUids: ["picker", uid] }));
      await assertFails(db.collection("coursePitches").doc("p1").update({ title: "Changed" }));
      await assertFails(db.collection("coursePitches").doc("p1").delete());
    }
    await assertFails((await asAnon()).collection("coursePitches").doc("p2").set(PITCH));
  });
});
