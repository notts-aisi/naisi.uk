/**
 * Rules tests for the two records Claude and Pangram leave on a run (privacy
 * v13): `courseBestAnswers` (Claude's pick of a week's strongest answers,
 * for an admin and the programme's lead through their route) and
 * `coursePangramChecks` (Pangram's readings of one person's answers, for
 * admins alone through theirs). Both are shut to every browser: the people
 * picked or checked, the programme's lead, the group's facilitators and
 * admins included. The routes on the Admin SDK are the only readers and
 * writers, after their own doors.
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
  await getTestEnv("course-coursework-claude");
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

const BEST = {
  runId: "run1",
  weekId: "w03",
  weekNumber: 3,
  questions: [{ key: "reflection:p1", kind: "reflection", text: "What surprised you?", picks: [{ uid: "fellow", reason: "Fellow 1 ties it to the reading." }] }],
  hard: "Most found the second reading hard.",
  labels: { "Fellow 1": "fellow" },
  uids: ["fellow"],
  fingerprint: "abc",
  at: "2026-11-02T12:00:00.000Z",
};

const CHECK = {
  runId: "run1",
  uid: "fellow",
  parts: { row1: { label: "Human", headline: "Human Written", fractionAi: 0, fractionAiAssisted: 0, fractionHuman: 1, hash: "h", worthALook: false, at: "2026-11-02T12:00:00.000Z" } },
};

async function seedRecords() {
  await seed(async (db) => {
    await db.collection("courseBestAnswers").doc("run1__w03").set(BEST);
    await db.collection("coursePangramChecks").doc("run1__fellow").set(CHECK);
  });
}

describe("courseBestAnswers and coursePangramChecks: shut to every browser", () => {
  it("nobody reads one or lists them: the person picked or checked, the lead and an admin included", async () => {
    await seedCast();
    await seedRecords();
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseBestAnswers").doc("run1__w03").get()).exists, true);
      assert.equal((await unruled.collection("coursePangramChecks").doc("run1__fellow").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("fellow").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseBestAnswers").doc("run1__w03").get());
      await assertFails(db.collection("courseBestAnswers").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseBestAnswers").where("uids", "array-contains", uid).get());
      await assertFails(db.collection("coursePangramChecks").doc("run1__fellow").get());
      await assertFails(db.collection("coursePangramChecks").where("runId", "==", "run1").get());
      await assertFails(db.collection("coursePangramChecks").where("uid", "==", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("courseBestAnswers").doc("run1__w03").get());
    await assertFails(anon.collection("coursePangramChecks").doc("run1__fellow").get());
  });

  it("nobody writes one: not a new one, not an edit, not a delete, an admin included", async () => {
    await seedCast();
    await seedRecords();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseBestAnswers").doc("run1__w04").set(BEST));
      await assertFails(db.collection("courseBestAnswers").doc("run1__w03").update({ hard: "Changed" }));
      await assertFails(db.collection("courseBestAnswers").doc("run1__w03").delete());
      await assertFails(db.collection("coursePangramChecks").doc(`run1__${uid}`).set({ ...CHECK, uid }));
      await assertFails(db.collection("coursePangramChecks").doc("run1__fellow").update({ parts: {} }));
      await assertFails(db.collection("coursePangramChecks").doc("run1__fellow").delete());
    }
  });
});
