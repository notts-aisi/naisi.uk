/**
 * Rules tests for `coursePacksAndCases`, what each person has in a week's
 * packs and talks (plan item 8; Q32 A): the pack they picked or were given,
 * the case they were given, and their own "Ready for my talk". Shut to every
 * browser: the person it is about, the group's facilitators, the programme's
 * lead and admins included. Two routes on the Admin SDK are the only writers
 * (/api/courses/runs/[runId]/packs-and-cases/[blockId], the person's own;
 * /api/courses/groups/[groupId]/draw, the draw), and the pages read on the
 * server after their own gates, so no browser reads or writes a record: a
 * client read would hand a fellow somebody else's case, and a co-facilitator
 * a facilitator's own pick or ready box.
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
  await getTestEnv("course-packs-and-cases");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("othermember", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member", "othermember", "pending1"];

const RECORD = {
  runId: "run1",
  uid: "member",
  weekId: "w03",
  weekNumber: 3,
  blockId: "cs-1",
  kind: "talk",
  caseId: "ca-1",
  ready: true,
  givenAt: new Date("2026-11-10T20:10:00Z"),
};

async function seedRecord() {
  await seed(async (db) => {
    await db.collection("courseGroups").doc("grp1").set({ runId: "run1", name: "Group B", facilitatorUids: ["facilitator"] });
    await db.collection("courseEnrolments").doc("run1__member").set({
      runId: "run1",
      uid: "member",
      groupId: "grp1",
      role: "learner",
      status: "active",
      allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
    });
    await db.collection("coursePacksAndCases").doc("run1__member__cs-1").set(RECORD);
  });
}

describe("coursePacksAndCases: shut to every browser", () => {
  it("nobody reads a record or lists them: the person it is about, the group's facilitator, the lead and an admin included", async () => {
    await seedCast();
    await seedRecord();
    // The control: the record is there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("coursePacksAndCases").doc("run1__member__cs-1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePacksAndCases").doc("run1__member__cs-1").get());
      await assertFails(db.collection("coursePacksAndCases").where("runId", "==", "run1").get());
      await assertFails(db.collection("coursePacksAndCases").where("uid", "==", uid).get());
      await assertFails(db.collection("coursePacksAndCases").where("uid", "==", "member").get());
    }
    await assertFails((await asAnon()).collection("coursePacksAndCases").doc("run1__member__cs-1").get());
  });

  it("nobody writes one: not a pick, not a ready box, not a case, not a delete, the person it is about included", async () => {
    await seedCast();
    await seedRecord();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePacksAndCases").doc(`run1__${uid}__co-2`).set({ ...RECORD, uid, blockId: "co-2", kind: "pack", packId: "pk-4" }));
      await assertFails(db.collection("coursePacksAndCases").doc("run1__member__cs-1").update({ ready: false }));
      await assertFails(db.collection("coursePacksAndCases").doc("run1__member__cs-1").update({ caseId: "ca-3" }));
      await assertFails(db.collection("coursePacksAndCases").doc("run1__member__cs-1").delete());
    }
    await assertFails((await asAnon()).collection("coursePacksAndCases").doc("run1__x__cs-1").set(RECORD));
  });
});
