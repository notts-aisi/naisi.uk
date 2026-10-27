/**
 * Rules tests for `coursePairs`, each person's place in a group's pairs for
 * a session in pairs (Technical AI Safety's hands-on night): which pair they
 * are in and whether they are bringing a laptop. Shut to every browser: the
 * person it is about, their partner, the group's facilitators, the
 * programme's lead and admins included. One route on the Admin SDK is the
 * only writer (/api/courses/groups/[groupId]/pairs, for the group's live
 * facilitators, the programme's lead and admins), and the pages read on the
 * server after their own gates, so no browser reads or writes a record: a
 * client read would hand a fellow another pair, and anybody the group's
 * laptops.
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
  await getTestEnv("course-pairs");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("partner", { role: "member" });
  await seedUser("othermember", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member", "partner", "othermember", "pending1"];

const RECORD = {
  runId: "run1",
  groupId: "grp1",
  uid: "member",
  weekId: "w05",
  weekNumber: 5,
  blockId: "is-1",
  pair: 1,
  laptop: true,
  updatedAt: new Date("2026-11-24T20:10:00Z"),
};

const PATH = "run1__grp1__member__is-1";

async function seedRecord() {
  await seed(async (db) => {
    await db.collection("courseGroups").doc("grp1").set({ runId: "run1", name: "Group B", facilitatorUids: ["facilitator"] });
    for (const uid of ["member", "partner"]) {
      await db.collection("courseEnrolments").doc(`run1__${uid}`).set({
        runId: "run1",
        uid,
        groupId: "grp1",
        role: "learner",
        status: "active",
        allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
      });
    }
    await db.collection("coursePairs").doc(PATH).set(RECORD);
    await db.collection("coursePairs").doc("run1__grp1__partner__is-1").set({ ...RECORD, uid: "partner", laptop: false });
  });
}

describe("coursePairs: shut to every browser", () => {
  it("nobody reads a record or lists them: the person it is about, their partner, the group's facilitator, the lead and an admin included", async () => {
    await seedCast();
    await seedRecord();
    // The control: the record is there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("coursePairs").doc(PATH).get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePairs").doc(PATH).get());
      await assertFails(db.collection("coursePairs").where("runId", "==", "run1").get());
      await assertFails(db.collection("coursePairs").where("groupId", "==", "grp1").get());
      await assertFails(db.collection("coursePairs").where("uid", "==", uid).get());
      await assertFails(db.collection("coursePairs").where("uid", "==", "member").get());
    }
    await assertFails((await asAnon()).collection("coursePairs").doc(PATH).get());
  });

  it("nobody writes one: not a pair, not a laptop, not a delete, the person it is about and the group's facilitator included", async () => {
    await seedCast();
    await seedRecord();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePairs").doc(`run1__grp1__${uid}__is-1`).set({ ...RECORD, uid, pair: 2 }));
      await assertFails(db.collection("coursePairs").doc(PATH).update({ pair: 2 }));
      await assertFails(db.collection("coursePairs").doc(PATH).update({ laptop: false }));
      await assertFails(db.collection("coursePairs").doc(PATH).delete());
    }
    await assertFails((await asAnon()).collection("coursePairs").doc("run1__grp1__x__is-1").set(RECORD));
  });
});
