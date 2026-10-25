/**
 * Rules tests for `courseFinishing`, who finished a programme: shut to every
 * browser, admins and the person a decision is about included. The two
 * routes under /api/admissions/forms/[roundId]/programmes/[programmeId]/finishing
 * are the only writers, and the server decides what anybody is shown: the
 * programme's lead and admins see the rule and the list, and each member is
 * told only whether they finished, never the rule.
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
  await getTestEnv("course-finishing");
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

const RULE = { kind: "rule", runId: "run1", atLeast: 4, setAt: new Date("2026-11-30T09:00:00Z") };
const DECISION = {
  kind: "person",
  runId: "run1",
  uid: "member1",
  finished: true,
  byUid: "committee1",
  at: new Date("2026-12-10T09:00:00Z"),
};

async function seedFinishing() {
  await seed(async (db) => {
    await db.collection("courseFinishing").doc("run1").set(RULE);
    await db.collection("courseFinishing").doc("run1__member1").set(DECISION);
  });
}

describe("courseFinishing: shut to every browser", () => {
  it("nobody reads the rule or a decision, or lists them, the person it is about and an admin included", async () => {
    await seedCast();
    await seedFinishing();
    // The control: the rows are there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseFinishing").doc("run1").get()).exists, true);
      assert.equal((await unruled.collection("courseFinishing").doc("run1__member1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseFinishing").doc("run1").get());
      await assertFails(db.collection("courseFinishing").doc("run1__member1").get());
      await assertFails(db.collection("courseFinishing").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseFinishing").where("uid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("courseFinishing").doc("run1").get());
  });

  it("nobody writes one: not a rule, not a decision about themselves or anybody, not a delete", async () => {
    await seedCast();
    await seedFinishing();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseFinishing").doc("run1").set({ ...RULE, atLeast: 1 }));
      await assertFails(db.collection("courseFinishing").doc(`run1__${uid}`).set({ ...DECISION, uid, byUid: uid }));
      await assertFails(db.collection("courseFinishing").doc("run1__member1").update({ finished: false }));
      await assertFails(db.collection("courseFinishing").doc("run1__member1").delete());
      await assertFails(db.collection("courseFinishing").doc("run1").delete());
    }
    await assertFails((await asAnon()).collection("courseFinishing").doc("run2").set({ ...RULE, runId: "run2" }));
  });
});
