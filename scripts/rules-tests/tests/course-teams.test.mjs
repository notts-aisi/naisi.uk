/**
 * Rules tests for `courseTeams`, an incubator's teams: shut to every browser,
 * admins and a team's own people included. The routes under
 * /api/admissions/forms/[roundId]/programmes/[programmeId]/teams are the only
 * writers, and the server decides what anybody is shown of a team: the lead
 * and admins see the teams, each person is told their own by email, and what
 * each was told is never sent to a browser.
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
  await getTestEnv("course-teams");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("committee1", { role: "committee", suRecognised: true });
  await seedUser("member1", { role: "member" });
  await seedUser("member2", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "drafter", "approver", "committee1", "member1", "member2", "pending1"];

const TEAM = {
  runId: "run1",
  courseId: "course1",
  groupId: "grp1",
  name: "Probe transfer",
  project: "Replicate A paper about probes, then: try it on a smaller open model",
  source: { kind: "pitch", pitchId: "p1" },
  memberUids: ["member1", "member2"],
  toldAs: [{ uid: "member1", fingerprint: "f".repeat(64) }],
};

async function seedTeam() {
  await seed(async (db) => {
    await db.collection("courseTeams").doc("t1").set(TEAM);
  });
}

describe("courseTeams: shut to every browser", () => {
  it("nobody reads a team or lists teams, its own people and an admin included", async () => {
    await seedCast();
    await seedTeam();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseTeams").doc("t1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseTeams").doc("t1").get());
      await assertFails(db.collection("courseTeams").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseTeams").where("memberUids", "array-contains", uid).get());
    }
    await assertFails((await asAnon()).collection("courseTeams").doc("t1").get());
  });

  it("nobody writes one: not a new team, not a move, not what somebody was told, not a delete", async () => {
    await seedCast();
    await seedTeam();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseTeams").doc(`new-${uid}`).set({ ...TEAM, memberUids: [uid], toldAs: [] }));
      await assertFails(db.collection("courseTeams").doc("t1").update({ memberUids: ["member1", "member2", uid] }));
      await assertFails(db.collection("courseTeams").doc("t1").update({ toldAs: [] }));
      await assertFails(db.collection("courseTeams").doc("t1").delete());
    }
    await assertFails((await asAnon()).collection("courseTeams").doc("t2").set(TEAM));
  });
});
