/**
 * Rules tests for `courseGroupSharedNotes`, the notes a group's people and
 * facilitators share with the group on its week pages (C29): shut to every
 * browser, a note's writer, the group's own people and facilitators, the
 * programme's lead and admins included. The shared notes routes
 * (/api/courses/groups/[groupId]/shared-notes and .../[noteId]) are the only
 * writers, and the pages that show notes read them on the server through the
 * one reader, after it has asked who is reading, so no browser reads or
 * writes a row: a group's notes must never reach another group.
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
  await getTestEnv("course-group-shared-notes");
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

const NOTE = {
  runId: "run1",
  groupId: "grp1",
  weekNumber: 3,
  authorUid: "member",
  body: "I found the second reading's argument weaker than it looks. Happy to say why tonight.",
  createdAt: new Date("2026-11-17T09:00:00Z"),
};

async function seedNote() {
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
    await db.collection("courseGroupSharedNotes").doc("n1").set(NOTE);
  });
}

describe("courseGroupSharedNotes: shut to every browser", () => {
  it("nobody reads a note or lists them: its writer, the group's facilitator, the lead and an admin included", async () => {
    await seedCast();
    await seedNote();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseGroupSharedNotes").doc("n1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseGroupSharedNotes").doc("n1").get());
      await assertFails(db.collection("courseGroupSharedNotes").where("groupId", "==", "grp1").get());
      await assertFails(db.collection("courseGroupSharedNotes").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseGroupSharedNotes").where("authorUid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("courseGroupSharedNotes").doc("n1").get());
  });

  it("nobody writes one: not a new note, not an edit, not a delete, its own writer and the group's facilitator included", async () => {
    await seedCast();
    await seedNote();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseGroupSharedNotes").doc(`new-${uid}`).set({ ...NOTE, authorUid: uid }));
      await assertFails(db.collection("courseGroupSharedNotes").doc("n1").update({ body: "Changed" }));
      await assertFails(db.collection("courseGroupSharedNotes").doc("n1").delete());
    }
    await assertFails((await asAnon()).collection("courseGroupSharedNotes").doc("n2").set(NOTE));
  });
});
