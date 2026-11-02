/**
 * Rules tests for the question sets: `surveyQuestionSets` (one document per
 * kind of survey, the questions it starts with as an admin changed them on
 * Run NAISI › Surveys › Question sets). Shut to every browser, an admin's
 * included: it is written only by the question sets route on the Admin SDK,
 * which holds that a programme's, a check-in's and a report's questions
 * change their words alone, and read only on the server. A browser able to
 * write one could change what every survey made afterwards asks, past that
 * rule.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("survey-question-sets");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("su1", { role: "committee", suRecognised: true });
  await seedUser("committee1", { role: "committee", suRecognised: false });
  await seedUser("member1", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "su1", "committee1", "member1", "pending1"];

/** A words-only set and the survey after an event's, as the route keeps them. */
const BEFORE = {
  kind: "before",
  words: { "q_c1:title": "Which of these is most like you now?" },
  updatedAt: new Date("2026-11-02T10:00:00Z"),
  updatedByUid: "admin1",
};
const EVENT = {
  kind: "event",
  items: [
    { kind: "question", id: "q_ev_how", type: "rating", title: "How did it go?", body: [], required: false, optional: false, rating: { max: 5 } },
  ],
  updatedAt: new Date("2026-11-02T10:00:00Z"),
  updatedByUid: "admin1",
};

async function seedSets() {
  await seed(async (db) => {
    await db.collection("surveyQuestionSets").doc("before").set(BEFORE);
    await db.collection("surveyQuestionSets").doc("event").set(EVENT);
  });
}

describe("surveyQuestionSets: shut to every browser", () => {
  it("nobody reads one or lists them, an admin included, nor anybody signed out", async () => {
    await seedCast();
    await seedSets();
    // The control: the documents are there, and an admin's session is served
    // a read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("surveyQuestionSets").doc("before").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("surveyQuestionSets").doc("before").get());
      await assertFails(db.collection("surveyQuestionSets").doc("event").get());
      await assertFails(db.collection("surveyQuestionSets").get());
      await assertFails(db.collection("surveyQuestionSets").where("kind", "==", "before").get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("surveyQuestionSets").doc("before").get());
    await assertFails(anon.collection("surveyQuestionSets").get());
  });

  it("nobody writes one: not a new set, not a word or a question changed, not a delete", async () => {
    await seedCast();
    await seedSets();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("surveyQuestionSets").doc("after").set({ ...BEFORE, kind: "after" }));
      await assertFails(db.collection("surveyQuestionSets").doc("before").update({ words: { "q_c1:title": "Something else" } }));
      // A words-only set given questions of its own: what the route refuses, refused here too.
      await assertFails(db.collection("surveyQuestionSets").doc("before").update({ items: EVENT.items }));
      await assertFails(db.collection("surveyQuestionSets").doc("event").update({ items: [] }));
      await assertFails(db.collection("surveyQuestionSets").doc("event").delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("surveyQuestionSets").doc("leaving").set({ kind: "leaving", words: {} }));
    await assertFails(anon.collection("surveyQuestionSets").doc("before").delete());
  });
});
