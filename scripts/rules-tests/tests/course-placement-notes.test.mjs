/**
 * Rules tests for `coursePlacementNotes`, what an admin or a programme's lead
 * chose for somebody placed outside the times they gave: a note for the top
 * of their "Your group" email, or none. Shut to every browser, the person a
 * note is about, the programme's lead and admins included. The notes route
 * (/api/courses/runs/[runId]/allocation/publish/notes) and Publish are the
 * only readers and writers, on the Admin SDK after their own gate: a note can
 * name a group before Publish has told its person, so no browser reads one.
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
  await getTestEnv("course-placement-notes");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("member", { role: "member" });
  await seedUser("othermember", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "member", "othermember", "pending1"];

const NOTE = {
  runId: "run1",
  uid: "member",
  groupId: "grp1",
  choice: "note",
  text: "We know Wednesday lunchtime wasn't one of your times; it was the only group with room.",
  savedByUid: "admin1",
  savedAt: new Date("2026-10-29T12:00:00Z"),
};

async function seedNote() {
  await seed(async (db) => {
    await db.collection("coursePlacementNotes").doc("run1__member").set(NOTE);
  });
}

describe("coursePlacementNotes: shut to every browser", () => {
  it("nobody reads a note or lists them: the person it is about, the lead and an admin included", async () => {
    await seedCast();
    await seedNote();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("coursePlacementNotes").doc("run1__member").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePlacementNotes").doc("run1__member").get());
      await assertFails(db.collection("coursePlacementNotes").where("runId", "==", "run1").get());
      await assertFails(db.collection("coursePlacementNotes").where("uid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("coursePlacementNotes").doc("run1__member").get());
  });

  it("nobody writes one: not a new note, not an edit, not a delete, the person it is about included", async () => {
    await seedCast();
    await seedNote();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePlacementNotes").doc(`run1__${uid}`).set({ ...NOTE, uid }));
      await assertFails(db.collection("coursePlacementNotes").doc("run1__member").update({ text: "Changed" }));
      await assertFails(db.collection("coursePlacementNotes").doc("run1__member").delete());
    }
    await assertFails((await asAnon()).collection("coursePlacementNotes").doc("run1__x").set(NOTE));
  });
});
