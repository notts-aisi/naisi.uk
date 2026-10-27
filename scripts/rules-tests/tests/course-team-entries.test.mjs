/**
 * Rules tests for `courseTeamEntries`, what an incubator's teams write on
 * their pages (each week's check-in, the team's links and its one
 * hand-in): shut to every browser, admins and a team's own people included.
 * The routes under /api/courses/runs/[runId]/team are the only writers, and
 * the server decides who reads which team's page: the team, the
 * programme's lead and admins, and nobody else.
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
  await getTestEnv("course-team-entries");
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

const PLACE = { runId: "run1", courseId: "course1", groupId: "grp1", teamId: "t1" };

const CHECK_IN = {
  ...PLACE,
  kind: "check-in",
  weekNumber: 5,
  did: "Got the original code running on the small model.",
  inTheWay: "",
  byUid: "member1",
};
const LINK = { ...PLACE, kind: "link", label: "Repo", url: "https://example.com/repo", byUid: "member1" };
const HAND_IN = {
  ...PLACE,
  kind: "hand-in",
  url: "https://example.com/doc",
  summary: "We replicated a paper on a smaller open model.",
  whoDidWhat: "",
  byUid: "member2",
};

async function seedEntries() {
  await seed(async (db) => {
    await db.collection("courseTeamEntries").doc("t1__checkin__w05").set(CHECK_IN);
    await db.collection("courseTeamEntries").doc("link1").set(LINK);
    await db.collection("courseTeamEntries").doc("t1__handin").set(HAND_IN);
  });
}

describe("courseTeamEntries: shut to every browser", () => {
  it("nobody reads an entry or lists them, the team's own people and an admin included", async () => {
    await seedCast();
    await seedEntries();
    // The control: the rows are there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseTeamEntries").doc("t1__handin").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      for (const id of ["t1__checkin__w05", "link1", "t1__handin"]) {
        await assertFails(db.collection("courseTeamEntries").doc(id).get());
      }
      await assertFails(db.collection("courseTeamEntries").where("teamId", "==", "t1").get());
      await assertFails(db.collection("courseTeamEntries").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseTeamEntries").where("byUid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("courseTeamEntries").doc("t1__handin").get());
  });

  it("nobody writes one: not a check-in, a link or a hand-in, not a change, not a removal", async () => {
    await seedCast();
    await seedEntries();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseTeamEntries").doc(`t1__checkin__w06`).set({ ...CHECK_IN, weekNumber: 6, byUid: uid }));
      await assertFails(db.collection("courseTeamEntries").doc(`link-${uid}`).set({ ...LINK, byUid: uid }));
      await assertFails(db.collection("courseTeamEntries").doc("t1__checkin__w05").update({ did: "Changed.", byUid: uid }));
      await assertFails(db.collection("courseTeamEntries").doc("t1__handin").update({ summary: "Changed.", byUid: uid }));
      await assertFails(db.collection("courseTeamEntries").doc("t1__handin").update({ byUid: null }));
      await assertFails(db.collection("courseTeamEntries").doc("link1").delete());
    }
    await assertFails((await asAnon()).collection("courseTeamEntries").doc("t2__handin").set({ ...HAND_IN, teamId: "t2" }));
  });
});
