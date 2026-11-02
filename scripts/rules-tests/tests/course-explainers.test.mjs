/**
 * Rules tests for `courseExplainers`: an explainer an admin scheduled from a
 * week's review, the admin's topic, who explains, how long and the sessions
 * it opens. Shut to every browser: whoever explains, the group's
 * facilitators and members, the programme's lead and admins included. Its
 * route, the pages and routes that draw a session's ticket, "Week N is open"
 * and the two deletions read and write it on the Admin SDK alone.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-explainers");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("explainer", { role: "committee" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("fellow", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "explainer", "lead", "facilitator", "fellow", "pending1"];

const EXPLAINER = {
  runId: "run1",
  roundId: "round1",
  programmeId: "prog1",
  fromWeekId: "w03",
  fromWeekNumber: 3,
  topic: "Who pays for the lamps",
  explainerUid: "explainer",
  minutes: 10,
  sessions: [{ groupId: "grp1", sessionKey: "w04", weekNumber: 4, startsAt: new Date("2026-11-19T18:00:00Z") }],
  scheduledByUid: "admin1",
  scheduledAt: new Date("2026-11-18T10:00:00Z"),
  cancelledAt: null,
  cancelledByUid: null,
};

async function seedExplainer() {
  await seed(async (db) => {
    await db.collection("courseExplainers").doc("e1").set(EXPLAINER);
  });
}

describe("courseExplainers: shut to every browser", () => {
  it("nobody reads one or lists them: whoever explains, the group's people, the lead and an admin included", async () => {
    await seedCast();
    await seedExplainer();
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseExplainers").doc("e1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("fellow").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseExplainers").doc("e1").get());
      await assertFails(db.collection("courseExplainers").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseExplainers").where("explainerUid", "==", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("courseExplainers").doc("e1").get());
  });

  it("nobody writes one: not a new one, not a cancel, not a delete, an admin included", async () => {
    await seedCast();
    await seedExplainer();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseExplainers").doc("e2").set({ ...EXPLAINER, topic: "Another" }));
      await assertFails(db.collection("courseExplainers").doc("e1").update({ cancelledAt: new Date(), cancelledByUid: uid }));
      await assertFails(db.collection("courseExplainers").doc("e1").delete());
    }
  });
});
