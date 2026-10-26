/**
 * Rules tests for the impact questionnaire's part (b): `kairosChoices` (one
 * document per person: whether their name and programme record go to Kairos)
 * and `programmeRatings` (what a group's facilitators, the programme's lead
 * and admins say about each fellow at a programme's end, and each run's
 * sheet). Both shut to every browser, the person's own included: every write
 * is a route on the Admin SDK (`/api/account/kairos`, the survey answer
 * routes, `/api/courses/groups/[groupId]/ratings`) and every read is a server
 * page or route. A readable rating would show somebody what was said about
 * them; a readable choice is nobody's business but its owner's, and the
 * profile shows it to them from the server.
 *
 * Goes to scripts/rules-tests/tests/kairos-and-ratings.test.mjs (the registry
 * owner places it).
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
  await getTestEnv("kairos-and-ratings");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member1", { role: "member" });
  await seedUser("member2", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member1", "member2", "pending1"];

const CHOICE = { uid: "member1", shared: false, at: new Date("2026-12-10T12:00:00Z"), via: "settings" };
const RATING = {
  kind: "rating",
  runId: "run1",
  groupId: "group1",
  raterUid: "facilitator",
  ratedUid: "member1",
  answers: { f2: 4, f5: "strongYes" },
  savedAt: new Date("2026-12-10T12:00:00Z"),
};
const SHEET = { kind: "sheet", runId: "run1", lastSessionOn: "2026-12-09" };

async function seedRecords() {
  await seed(async (db) => {
    await db.collection("kairosChoices").doc("member1").set(CHOICE);
    await db.collection("programmeRatings").doc("run1__facilitator__member1").set(RATING);
    await db.collection("programmeRatings").doc("run1").set(SHEET);
  });
}

describe("kairosChoices and programmeRatings: shut to every browser", () => {
  it("nobody reads a choice or a rating, or lists them: the person, the rater, the lead and an admin included", async () => {
    await seedCast();
    await seedRecords();
    // The control: the documents are there, and an admin's session is served
    // a read only an admin may make, so the refusals below are these blocks'.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("kairosChoices").doc("member1").get()).exists, true);
      assert.equal((await unruled.collection("programmeRatings").doc("run1__facilitator__member1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("kairosChoices").doc("member1").get());
      await assertFails(db.collection("kairosChoices").doc(uid).get());
      await assertFails(db.collection("kairosChoices").get());
      await assertFails(db.collection("programmeRatings").doc("run1__facilitator__member1").get());
      await assertFails(db.collection("programmeRatings").doc("run1").get());
      await assertFails(db.collection("programmeRatings").where("runId", "==", "run1").get());
      await assertFails(db.collection("programmeRatings").where("ratedUid", "==", uid).get());
      await assertFails(db.collection("programmeRatings").where("raterUid", "==", uid).get());
      await assertFails(db.collection("programmeRatings").where("kind", "==", "sheet").get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("kairosChoices").doc("member1").get());
    await assertFails(anon.collection("programmeRatings").doc("run1__facilitator__member1").get());
  });

  it("nobody writes one: not their own choice, not a rating of anybody, not a sheet, not a delete", async () => {
    await seedCast();
    await seedRecords();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("kairosChoices").doc(uid).set({ ...CHOICE, uid, shared: true }));
      await assertFails(db.collection("kairosChoices").doc("member1").update({ shared: true }));
      await assertFails(db.collection("kairosChoices").doc("member1").delete());
      await assertFails(db.collection("programmeRatings").doc(`run1__${uid}__member2`).set({ ...RATING, raterUid: uid, ratedUid: "member2" }));
      await assertFails(db.collection("programmeRatings").doc("run1__facilitator__member1").update({ answers: {} }));
      await assertFails(db.collection("programmeRatings").doc("run1__facilitator__member1").delete());
      await assertFails(db.collection("programmeRatings").doc("run2").set({ ...SHEET, runId: "run2" }));
    }
    const anon = await asAnon();
    await assertFails(anon.collection("kairosChoices").doc("anon").set({ ...CHOICE, uid: "anon" }));
    await assertFails(anon.collection("programmeRatings").doc("run1__anon__member1").set({ ...RATING, raterUid: "anon" }));
  });
});
