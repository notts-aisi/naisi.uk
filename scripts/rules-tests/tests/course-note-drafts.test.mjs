/**
 * Rules tests for `courseNoteDrafts` (privacy v15): Claude's draft of an
 * end-of-week note about one person, from one week of a run, with what it was
 * built from. Shut to every browser: the person it is about, the people whose
 * ratings and feedback it was built from, the programme's lead, the group's
 * facilitators and admins included. The week's notes page and routes on the
 * Admin SDK, after their door admits an admin, and the two deletions are its
 * only readers and writers.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-note-drafts");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "committee" });
  await seedUser("fellow", { role: "member" });
  await seedUser("otherfellow", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "fellow", "otherfellow", "pending1"];

const DRAFT = {
  runId: "run1",
  weekId: "w03",
  weekNumber: 3,
  uid: "fellow",
  text: "The fellow takes a clear position. Rater 1 called it the clearest in the group.",
  builtFrom: [
    { kind: "work", weekNumber: 3, submittedAt: new Date("2026-11-17T20:00:00Z"), written: 1, reflections: 0, boxes: 0 },
    { kind: "feedback", weekNumber: 3, byUid: "facilitator", role: "facilitator", on: "writtenAnswer", at: new Date("2026-11-18T10:00:00Z") },
    { kind: "rating", weekNumber: 3, raterUid: "lead", role: "lead", label: "Rater 1", rating: 8, comment: "Clearest in the group", at: new Date("2026-11-18T11:00:00Z") },
  ],
  raters: { "Rater 1": "lead" },
  sourceUids: ["facilitator", "lead"],
  fingerprint: "abc",
  model: "claude-opus-5-5",
  at: new Date("2026-11-19T09:00:00Z"),
  askedByUid: "admin1",
};

async function seedDraft() {
  await seed(async (db) => {
    await db.collection("courseNoteDrafts").doc("run1__w03__fellow").set(DRAFT);
  });
}

describe("courseNoteDrafts: shut to every browser", () => {
  it("nobody reads one or lists them: the person it is about, its raters, the lead, a facilitator and an admin included", async () => {
    await seedCast();
    await seedDraft();
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseNoteDrafts").doc("run1__w03__fellow").get()).exists, true);
    });
    // The harness reads with the rules on: an admin reads a user, so a refusal below is the block's.
    await assertSucceeds((await asUser("admin1")).collection("users").doc("fellow").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseNoteDrafts").doc("run1__w03__fellow").get());
      await assertFails(db.collection("courseNoteDrafts").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseNoteDrafts").where("uid", "==", "fellow").get());
      await assertFails(db.collection("courseNoteDrafts").where("sourceUids", "array-contains", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("courseNoteDrafts").doc("run1__w03__fellow").get());
  });

  it("nobody writes one: not a new one, not an edit, not a delete, an admin included", async () => {
    await seedCast();
    await seedDraft();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseNoteDrafts").doc("run1__w04__fellow").set({ ...DRAFT, weekId: "w04", weekNumber: 4 }));
      await assertFails(db.collection("courseNoteDrafts").doc("run1__w03__fellow").update({ text: "Changed in a browser." }));
      await assertFails(db.collection("courseNoteDrafts").doc("run1__w03__fellow").delete());
    }
  });
});
