/**
 * Rules tests for `courseSessionReports`, each facilitator's own report on a
 * session of their group: shut to every browser, its writer, the group's
 * other facilitator, the people a report picks, the programme's lead and
 * admins included. The report route
 * (/api/courses/groups/[groupId]/session-report) is the only writer, and the
 * pages that show reports read them on the server after their own gates, so
 * no browser reads or writes a row.
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
  await getTestEnv("course-session-reports");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("cofacilitator", { role: "member" });
  await seedUser("aisha", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "cofacilitator", "aisha", "member", "pending1"];

const REPORT_ID = "run1__grp1__w03__facilitator";

const REPORT = {
  runId: "run1",
  groupId: "grp1",
  sessionKey: "w03",
  weekNumber: 3,
  occurrence: 1,
  writerUid: "facilitator",
  answers: {
    how: 4,
    wentWell: "The race discussion got everyone talking.",
    didnt: "Ran ten minutes over.",
    unclear: ["something-else"],
    engaged: [{ uid: "aisha", note: "Brought the compute reading into the race debate." }],
    notRead: [],
    needsHand: [],
    forLead: "",
  },
  aboutUids: ["aisha"],
  parts: [],
  sentAt: new Date("2026-11-18T20:14:00Z"),
  updatedAt: new Date("2026-11-18T20:14:00Z"),
};

async function seedReport() {
  await seed(async (db) => {
    await db.collection("courseGroups").doc("grp1").set({ runId: "run1", name: "Group C", facilitatorUids: ["facilitator", "cofacilitator"] });
    await db.collection("courseSessionReports").doc(REPORT_ID).set(REPORT);
  });
}

describe("courseSessionReports: shut to every browser", () => {
  it("nobody reads a report or lists them: its writer, the other facilitator, the person it picks, the lead and an admin included", async () => {
    await seedCast();
    await seedReport();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseSessionReports").doc(REPORT_ID).get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseSessionReports").doc(REPORT_ID).get());
      await assertFails(db.collection("courseSessionReports").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseSessionReports").where("groupId", "==", "grp1").get());
      await assertFails(db.collection("courseSessionReports").where("writerUid", "==", uid).get());
      await assertFails(db.collection("courseSessionReports").where("aboutUids", "array-contains", uid).get());
    }
    await assertFails((await asAnon()).collection("courseSessionReports").doc(REPORT_ID).get());
  });

  it("nobody writes one: not a new report, not a change, not a delete, the group's own facilitators included", async () => {
    await seedCast();
    await seedReport();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseSessionReports").doc(`run1__grp1__w03__${uid}`).set({ ...REPORT, writerUid: uid }));
      await assertFails(db.collection("courseSessionReports").doc(REPORT_ID).update({ "answers.how": 1 }));
      await assertFails(db.collection("courseSessionReports").doc(REPORT_ID).delete());
    }
    await assertFails((await asAnon()).collection("courseSessionReports").doc("r2").set(REPORT));
  });
});
