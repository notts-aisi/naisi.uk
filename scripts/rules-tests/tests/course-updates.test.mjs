/**
 * Rules tests for `courseUpdates`, a run's updates (Q18): shut to every
 * browser, admins, an update's writer and the people it is to included. The
 * updates route (/api/courses/runs/[runId]/updates) is the only writer, and
 * the server decides who is shown which update: an update to one group must
 * never reach another group's people, so no browser reads the rows.
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
  await getTestEnv("course-updates");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "drafter", "approver", "lead", "facilitator", "member", "pending1"];

const UPDATE = {
  runId: "run1",
  to: "group",
  groupId: "grp1",
  title: "Room change for Group B this week",
  message: "We are in B52 on Tuesday. Same time, 6pm.",
  authorUid: "facilitator",
  postedAt: new Date("2026-11-16T09:00:00Z"),
  email: { planned: 7, sent: 7, held: 0, suppressed: 0, failed: 0, settled: true },
};

async function seedUpdate() {
  await seed(async (db) => {
    await db.collection("courseUpdates").doc("u1").set(UPDATE);
  });
}

describe("courseUpdates: shut to every browser", () => {
  it("nobody reads an update or lists them, its writer, the people it is to and an admin included", async () => {
    await seedCast();
    await seedUpdate();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseUpdates").doc("u1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseUpdates").doc("u1").get());
      await assertFails(db.collection("courseUpdates").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseUpdates").where("authorUid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("courseUpdates").doc("u1").get());
  });

  it("nobody writes one: not a new update, not an edit, not what its email did, not a delete", async () => {
    await seedCast();
    await seedUpdate();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseUpdates").doc(`new-${uid}`).set({ ...UPDATE, authorUid: uid }));
      await assertFails(db.collection("courseUpdates").doc("u1").update({ message: "Changed" }));
      await assertFails(db.collection("courseUpdates").doc("u1").update({ "email.sent": 99 }));
      await assertFails(db.collection("courseUpdates").doc("u1").delete());
    }
    await assertFails((await asAnon()).collection("courseUpdates").doc("u2").set(UPDATE));
  });
});
