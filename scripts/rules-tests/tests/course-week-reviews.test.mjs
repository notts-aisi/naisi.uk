/**
 * Rules tests for `courseWeekReviews` (privacy v15): Claude's review of one
 * week of a run, its draft grades, what people found hard and who might need
 * a hand, by account. Shut to every browser: the people it names, the
 * programme's lead, the group's facilitators and admins included. The week
 * review's page and route on the Admin SDK, after their door admits an
 * admin, and the two deletions are its only readers and writers.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-week-reviews");
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

const REVIEW = {
  runId: "run1",
  weekId: "w03",
  weekNumber: 3,
  grades: {
    state: "ready",
    at: new Date("2026-11-23T09:12:00Z"),
    askedByUid: "admin1",
    model: "claude-opus-5-5",
    fingerprint: "abc",
    sent: 1,
    items: [{ uid: "fellow", rowId: "row1", questionKey: "written:a1", grade: 7, hash: "h" }],
  },
  themes: null,
  hands: {
    state: "ready",
    at: new Date("2026-11-23T09:12:00Z"),
    askedByUid: "admin1",
    model: "claude-opus-5-5",
    fingerprint: "def",
    sent: { answers: 1, reflections: 0, reports: 0 },
    labels: { "Fellow 1": "fellow" },
    groupLabels: { "Group 1": "grp1" },
    list: [{ uid: "fellow", why: "Fellow 1 seems unsure of the second reading.", answers: 1, reports: 0 }],
  },
  uids: ["fellow"],
};

async function seedReview() {
  await seed(async (db) => {
    await db.collection("courseWeekReviews").doc("run1__w03").set(REVIEW);
  });
}

describe("courseWeekReviews: shut to every browser", () => {
  it("nobody reads one or lists them: the person it names, the lead, a facilitator and an admin included", async () => {
    await seedCast();
    await seedReview();
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseWeekReviews").doc("run1__w03").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("fellow").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseWeekReviews").doc("run1__w03").get());
      await assertFails(db.collection("courseWeekReviews").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseWeekReviews").where("uids", "array-contains", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("courseWeekReviews").doc("run1__w03").get());
  });

  it("nobody writes one: not a new one, not an edit, not a delete, an admin included", async () => {
    await seedCast();
    await seedReview();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseWeekReviews").doc("run1__w04").set({ ...REVIEW, weekId: "w04", weekNumber: 4 }));
      await assertFails(db.collection("courseWeekReviews").doc("run1__w03").update({ grades: null }));
      await assertFails(db.collection("courseWeekReviews").doc("run1__w03").delete());
    }
  });
});
