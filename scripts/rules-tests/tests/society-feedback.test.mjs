/**
 * Rules tests for anonymous feedback for the whole society (docs/surveys.md,
 * "Anonymous feedback for the whole society"): `societyFeedbackWaiting` and
 * `societyFeedback`, shut to every browser, admins included. The form's route
 * is the only writer of an entry, the night's move the only writer of a kept
 * one, and the admins' routes the only other writers; the admins' page reads
 * them on the server. A browser read of an entry would hand the database's
 * own time on each record to whoever made it.
 *
 * To: scripts/rules-tests/tests/society-feedback.test.mjs
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("society-feedback");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("committee1", { role: "committee" });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member1", { role: "member" });
  await seedUser("pending1", { role: "pending" });
  await seedUser("rejected1", { role: "rejected" });
}

const EVERYONE = ["admin1", "lead", "committee1", "facilitator", "member1", "pending1", "rejected1"];

const ENTRY = {
  words: "We ran out of time for the last topic most weeks.",
  day: "2026-11-09",
  roundId: "round1",
  programmeId: "prog1",
  programmeName: "AGI Strategy",
  week: 2,
  about: "facilitator",
};

async function seedEntries() {
  await seed(async (db) => {
    await db.collection("societyFeedbackWaiting").doc("waiting1").set(ENTRY);
    await db.collection("societyFeedback").doc("kept1").set(ENTRY);
  });
}

describe("anonymous feedback: shut to every browser", () => {
  it("nobody reads an entry waiting or kept, or lists them: an admin included", async () => {
    await seedCast();
    await seedEntries();
    // The control: the records are there, and an admin's session is served a
    // read only an admin may make, so the refusals below are these blocks'.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("societyFeedbackWaiting").doc("waiting1").get()).exists, true);
      assert.equal((await unruled.collection("societyFeedback").doc("kept1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("societyFeedbackWaiting").doc("waiting1").get());
      await assertFails(db.collection("societyFeedbackWaiting").get());
      await assertFails(db.collection("societyFeedback").doc("kept1").get());
      await assertFails(db.collection("societyFeedback").get());
      await assertFails(db.collection("societyFeedback").where("day", ">=", "2026-09-01").get());
      await assertFails(db.collection("societyFeedback").where("programmeId", "==", "prog1").get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("societyFeedbackWaiting").doc("waiting1").get());
    await assertFails(anon.collection("societyFeedback").doc("kept1").get());
    await assertFails(anon.collection("societyFeedback").get());
  });

  it("nobody writes one: not an entry, not a mark, not a note, not a delete, signed out included", async () => {
    await seedCast();
    await seedEntries();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("societyFeedbackWaiting").doc(`waiting-${uid}`).set(ENTRY));
      await assertFails(db.collection("societyFeedbackWaiting").doc("waiting1").update({ words: "Changed." }));
      await assertFails(db.collection("societyFeedbackWaiting").doc("waiting1").delete());
      await assertFails(db.collection("societyFeedback").doc(`kept-${uid}`).set(ENTRY));
      await assertFails(db.collection("societyFeedback").doc("kept1").update({ dealtWith: { byUid: uid, byName: "", at: new Date() } }));
      await assertFails(db.collection("societyFeedback").doc("kept1").update({ note: { text: "A note.", byUid: uid, byName: "", at: new Date() } }));
      await assertFails(db.collection("societyFeedback").doc("kept1").delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("societyFeedbackWaiting").doc("waiting2").set(ENTRY));
    await assertFails(anon.collection("societyFeedback").doc("kept2").set(ENTRY));
  });
});
