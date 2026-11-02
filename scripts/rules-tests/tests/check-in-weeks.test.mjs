/**
 * Rules tests for the weeks of a programme's check-ins: `checkInWeeks` (one
 * document per course run and week: which check-ins the week showed the
 * programme's lead, fixed the first time the week was whole). Shut to every
 * browser, an admin's and the lead's included: it is created only by the
 * scheduler's job on the Admin SDK, deleted only by the run's destroy, and
 * read only on the server by the Surveys tab. A browser able to write one
 * could change which check-ins a lead's week counts.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("check-in-weeks");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("committee1", { role: "committee", suRecognised: false });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member1", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "committee1", "facilitator", "member1", "pending1"];

const RUN = "agi-strategy-autumn-2026__run00001";
const ID = `${RUN}__w03`;
const RECORD = {
  runId: RUN,
  weekNumber: 3,
  surveyIds: [`ci-${"a".repeat(40)}`, `ci-${"b".repeat(40)}`],
  frozenAt: new Date("2026-11-17T23:00:00Z"),
};

async function seedRecord() {
  await seed(async (db) => {
    await db.collection("checkInWeeks").doc(ID).set(RECORD);
  });
}

describe("checkInWeeks: shut to every browser", () => {
  it("nobody reads one or lists them, an admin and the programme's lead included, nor anybody signed out", async () => {
    await seedCast();
    await seedRecord();
    // The control: the document is there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("checkInWeeks").doc(ID).get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("checkInWeeks").doc(ID).get());
      await assertFails(db.collection("checkInWeeks").get());
      await assertFails(db.collection("checkInWeeks").where("runId", "==", RUN).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("checkInWeeks").doc(ID).get());
    await assertFails(anon.collection("checkInWeeks").where("runId", "==", RUN).get());
  });

  it("nobody writes one: not a new week, not a check-in added to or taken from a week, not a delete", async () => {
    await seedCast();
    await seedRecord();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("checkInWeeks").doc(`${RUN}__w04`).set({ ...RECORD, weekNumber: 4 }));
      await assertFails(db.collection("checkInWeeks").doc(ID).update({ surveyIds: [...RECORD.surveyIds, `ci-${"c".repeat(40)}`] }));
      await assertFails(db.collection("checkInWeeks").doc(ID).update({ surveyIds: [] }));
      await assertFails(db.collection("checkInWeeks").doc(ID).delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("checkInWeeks").doc(`${RUN}__w04`).set({ ...RECORD, weekNumber: 4 }));
    await assertFails(anon.collection("checkInWeeks").doc(ID).delete());
  });
});
