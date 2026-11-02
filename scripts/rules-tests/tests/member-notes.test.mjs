/**
 * Rules tests for `memberNotes`, the notes the team keeps about a person
 * (privacy v13 and v15). Shut to every browser, the person a note is about,
 * the programme's lead and admins included: the notes routes
 * (/api/admin/members/[uid]/notes for admins, and the programme's own
 * .../programmes/[programmeId]/people/[uid]/notes for its lead) are the only
 * readers and writers, on the Admin SDK after their own gate. The person must
 * never read a note about themselves from their own browser, and a lead must
 * never read a note kept to admins.
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
  await getTestEnv("member-notes");
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
  uid: "member",
  text: "Thoughtful in every reflection; might facilitate next term.",
  authorUid: "admin1",
  draftedByClaude: false,
  runId: "run1",
  programmeLabel: "AGI Strategy, Autumn 2026",
  createdAt: new Date("2026-11-02T12:00:00Z"),
  updatedAt: new Date("2026-11-02T12:00:00Z"),
};

async function seedNote() {
  await seed(async (db) => {
    await db.collection("memberNotes").doc("note1").set(NOTE);
  });
}

describe("memberNotes: shut to every browser", () => {
  it("nobody reads a note or lists them: the person it is about, the lead and an admin included", async () => {
    await seedCast();
    await seedNote();
    // The control: the note is there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("memberNotes").doc("note1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("memberNotes").doc("note1").get());
      await assertFails(db.collection("memberNotes").where("uid", "==", "member").get());
      await assertFails(db.collection("memberNotes").where("uid", "==", uid).get());
      await assertFails(db.collection("memberNotes").where("authorUid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("memberNotes").doc("note1").get());
  });

  it("nobody writes one: not a new note, not an edit, not a delete, an admin included", async () => {
    await seedCast();
    await seedNote();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("memberNotes").doc(`new_${uid}`).set({ ...NOTE, authorUid: uid }));
      await assertFails(db.collection("memberNotes").doc("note1").update({ text: "Changed" }));
      await assertFails(db.collection("memberNotes").doc("note1").delete());
    }
    await assertFails((await asAnon()).collection("memberNotes").doc("x").set(NOTE));
  });
});
