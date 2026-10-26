/**
 * Rules tests for `courseFacilitatorGuide`, a course's facilitator guide
 * (each week's session plan and notes, and the course's own documents): shut
 * to every browser, admins, the programme's lead and a group's facilitators
 * included. The loader's route
 * (/api/courses/[courseId]/facilitator-guide/[slot]) is the only writer, and
 * the guide's pages and routes read it on the server after the guide's own
 * gate, so no browser reads or writes a document.
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
  await getTestEnv("course-facilitator-guide");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member", "pending1"];

const DOC = {
  courseId: "course1",
  slot: "w03-plan",
  weekNumber: 3,
  title: "Session 3: Reading the sky",
  blocks: [{ type: "heading", level: 2, runs: [{ text: "Run sheet" }] }],
  updatedAt: new Date("2026-10-26T10:00:00Z"),
};

async function seedDoc() {
  await seed(async (db) => {
    await db.collection("courseGroups").doc("grp1").set({ runId: "run1", courseId: "course1", name: "Group B", facilitatorUids: ["facilitator"], archived: false });
    await db.collection("courseFacilitatorGuide").doc("course1__w03-plan").set(DOC);
  });
}

describe("courseFacilitatorGuide: shut to every browser", () => {
  it("nobody reads a document or lists them: an admin, the lead and the group's facilitator included", async () => {
    await seedCast();
    await seedDoc();
    // The control: the document is there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseFacilitatorGuide").doc("course1__w03-plan").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseFacilitatorGuide").doc("course1__w03-plan").get());
      await assertFails(db.collection("courseFacilitatorGuide").where("courseId", "==", "course1").get());
      await assertFails(db.collection("courseFacilitatorGuide").where("slot", "==", "w03-plan").get());
      await assertFails(db.collection("courseFacilitatorGuide").get());
    }
    await assertFails((await asAnon()).collection("courseFacilitatorGuide").doc("course1__w03-plan").get());
  });

  it("nobody writes one: not a new document, not an edit, not a delete, an admin included", async () => {
    await seedCast();
    await seedDoc();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseFacilitatorGuide").doc(`course1__w04-plan-${uid}`).set({ ...DOC, slot: "w04-plan" }));
      await assertFails(db.collection("courseFacilitatorGuide").doc("course1__w03-plan").update({ title: "Changed" }));
      await assertFails(db.collection("courseFacilitatorGuide").doc("course1__w03-plan").delete());
    }
    await assertFails((await asAnon()).collection("courseFacilitatorGuide").doc("course1__handbook").set({ ...DOC, slot: "handbook" }));
  });
});
