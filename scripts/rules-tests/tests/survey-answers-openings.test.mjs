/**
 * Rules tests for the openings of one person's survey answers (board
 * sv-person): a row in `recordOpenings` of kind `survey-answers`
 * (src/lib/firestore/recordOpenings.ts, `openSurveyAnswersRecorded`), written
 * by the Admin SDK before anything of the answers is read. Its block is the
 * sealed predictions' own, deny-all; these hold it for a survey-shaped row,
 * which names its person by `subjectUid` or, for a guest of an event, by
 * `subjectSignupId`, and names no run. Nobody reads or lists one, the person
 * it is about and admins included, and nobody writes, changes or deletes one.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("survey-answers-openings");
});
after(cleanup);
afterEach(clearData);

/** Everybody signed in: the opener, another admin, the person, a lead, a facilitator, a member, a waiting account. */
const EVERYONE = ["admin1", "admin2", "member", "lead", "facilitator", "othermember", "pending1"];

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("admin2", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("othermember", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

/** An opening of the member's answers, and of a guest's, as the Admin SDK writes them. */
const OPENING = {
  kind: "survey-answers",
  actorUid: "admin1",
  actorName: "Ada Admin",
  subjectUid: "member",
  surveyId: "survey-after",
  surveyIds: ["survey-after", "survey-before"],
  openedAt: new Date("2026-12-01T11:04:00Z"),
};
const GUEST_OPENING = {
  kind: "survey-answers",
  actorUid: "admin1",
  actorName: "Ada Admin",
  subjectSignupId: "rsvp-guest",
  surveyId: "survey-event",
  surveyIds: ["survey-event"],
  openedAt: new Date("2026-11-02T12:00:00Z"),
};

async function seedOpenings() {
  await seed(async (db) => {
    await db.collection("recordOpenings").doc("member-opening").set(OPENING);
    await db.collection("recordOpenings").doc("guest-opening").set(GUEST_OPENING);
  });
}

describe("recordOpenings: an opening of survey answers is shut to every browser", () => {
  it("nobody reads or lists one: the person it is about, the opener and other admins included", async () => {
    await seedCast();
    await seedOpenings();
    // The control: both are there, and an admin's session is served a read only an admin may make.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("recordOpenings").doc("member-opening").get()).exists, true);
      assert.equal((await unruled.collection("recordOpenings").doc("guest-opening").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("recordOpenings").doc("member-opening").get());
      await assertFails(db.collection("recordOpenings").doc("guest-opening").get());
      await assertFails(db.collection("recordOpenings").where("subjectUid", "==", "member").get());
      await assertFails(db.collection("recordOpenings").where("subjectUid", "==", uid).get());
      await assertFails(db.collection("recordOpenings").where("subjectSignupId", "==", "rsvp-guest").get());
      await assertFails(db.collection("recordOpenings").where("surveyId", "==", "survey-after").get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("recordOpenings").doc("member-opening").get());
    await assertFails(anon.collection("recordOpenings").where("subjectSignupId", "==", "rsvp-guest").get());
  });

  it("nobody writes, changes or deletes one: an admin's own opening included", async () => {
    await seedCast();
    await seedOpenings();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("recordOpenings").doc(`by-${uid}`).set({ ...OPENING, actorUid: uid }));
      await assertFails(db.collection("recordOpenings").doc("member-opening").update({ actorName: "Somebody else" }));
      await assertFails(db.collection("recordOpenings").doc("member-opening").update({ surveyIds: [] }));
      await assertFails(db.collection("recordOpenings").doc("member-opening").delete());
      await assertFails(db.collection("recordOpenings").doc("guest-opening").delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("recordOpenings").doc("x").set(GUEST_OPENING));
  });
});
