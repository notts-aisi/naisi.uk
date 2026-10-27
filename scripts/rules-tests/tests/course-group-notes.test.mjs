/**
 * Rules tests for `courseGroupNotes`, the notes a group's facilitators share
 * (C30): shut to every browser, a note's writer, the group's facilitators,
 * the programme's lead and admins included. The notes route
 * (/api/courses/groups/[groupId]/notes) is the only writer, and the pages that
 * show notes read them on the server after their own gate, so no browser
 * reads or writes a row.
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
  await getTestEnv("course-group-notes");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("cofacilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "cofacilitator", "member", "pending1"];

const NOTE = {
  runId: "run1",
  groupId: "grp1",
  authorUid: "facilitator",
  body: "Chloe and Isaac carried week 2. Try smaller pairs for the first 20 minutes.",
  createdAt: new Date("2026-11-11T19:30:00Z"),
};

async function seedNote() {
  await seed(async (db) => {
    await db.collection("courseGroups").doc("grp1").set({ runId: "run1", name: "Group B", facilitatorUids: ["facilitator", "cofacilitator"] });
    await db.collection("courseGroupNotes").doc("n1").set(NOTE);
  });
}

describe("courseGroupNotes: shut to every browser", () => {
  it("nobody reads a note or lists them: its writer, the group's facilitators, the lead and an admin included", async () => {
    await seedCast();
    await seedNote();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseGroupNotes").doc("n1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseGroupNotes").doc("n1").get());
      await assertFails(db.collection("courseGroupNotes").where("groupId", "==", "grp1").get());
      await assertFails(db.collection("courseGroupNotes").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseGroupNotes").where("authorUid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("courseGroupNotes").doc("n1").get());
  });

  it("nobody writes one: not a new note, not an edit, not a delete, the group's own facilitators included", async () => {
    await seedCast();
    await seedNote();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseGroupNotes").doc(`new-${uid}`).set({ ...NOTE, authorUid: uid }));
      await assertFails(db.collection("courseGroupNotes").doc("n1").update({ body: "Changed" }));
      await assertFails(db.collection("courseGroupNotes").doc("n1").delete());
    }
    await assertFails((await asAnon()).collection("courseGroupNotes").doc("n2").set(NOTE));
  });
});
