/**
 * Rules tests for the anonymous keep, change and drop form (docs/surveys.md,
 * "The anonymous form at a programme's end"): `anonymousFeedbackForms`,
 * `anonymousFeedbackWaiting` and `anonymousFeedback`, shut to every browser,
 * admins and the programme's lead included. The form's route is the only
 * writer of an answer and the night's move the only writer of a kept one;
 * the readers' page reads them on the server. A readable form is a readable
 * link, and a browser read of an answer would hand the database's own time
 * on each record to whoever made it.
 *
 * To: scripts/rules-tests/tests/anonymous-feedback.test.mjs
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
  await getTestEnv("anonymous-feedback");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member1", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member1", "pending1"];

const TOKEN = "A".repeat(43);
const FORM = {
  roundId: "round1",
  programmeId: "prog1",
  runId: "run1",
  programmeName: "AGI Strategy",
  programmeKind: "fellowship",
  token: TOKEN,
  opensAt: new Date("2026-12-02T09:00:00Z"),
  closesAt: new Date("2026-12-20T23:59:00Z"),
  closedAt: null,
};
const ANSWER = {
  roundId: "round1",
  programmeId: "prog1",
  runId: "run1",
  keep: "The small groups.",
  change: "Start on time.",
  drop: "",
  day: "2026-12-09",
};

async function seedForm() {
  await seed(async (db) => {
    await db.collection("anonymousFeedbackForms").doc("survey1").set(FORM);
    await db.collection("anonymousFeedbackWaiting").doc("waiting1").set(ANSWER);
    await db.collection("anonymousFeedback").doc("kept1").set(ANSWER);
  });
}

describe("the anonymous form: shut to every browser", () => {
  it("nobody reads the form, an answer waiting or an answer kept, or lists them: the lead and an admin included", async () => {
    await seedCast();
    await seedForm();
    // The control: the records are there, and an admin's session is served a
    // read only an admin may make, so the refusals below are these blocks'.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("anonymousFeedbackForms").doc("survey1").get()).exists, true);
      assert.equal((await unruled.collection("anonymousFeedbackWaiting").doc("waiting1").get()).exists, true);
      assert.equal((await unruled.collection("anonymousFeedback").doc("kept1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("anonymousFeedbackForms").doc("survey1").get());
      await assertFails(db.collection("anonymousFeedbackForms").where("token", "==", TOKEN).get());
      await assertFails(db.collection("anonymousFeedbackForms").where("roundId", "==", "round1").get());
      await assertFails(db.collection("anonymousFeedbackWaiting").doc("waiting1").get());
      await assertFails(db.collection("anonymousFeedbackWaiting").get());
      await assertFails(db.collection("anonymousFeedback").doc("kept1").get());
      await assertFails(db.collection("anonymousFeedback").where("roundId", "==", "round1").get());
      await assertFails(db.collection("anonymousFeedback").where("runId", "==", "run1").get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("anonymousFeedbackForms").where("token", "==", TOKEN).get());
    await assertFails(anon.collection("anonymousFeedbackWaiting").doc("waiting1").get());
    await assertFails(anon.collection("anonymousFeedback").doc("kept1").get());
  });

  it("nobody writes one: not a form, not an answer, not a change, not a delete, signed out included", async () => {
    await seedCast();
    await seedForm();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("anonymousFeedbackForms").doc("survey2").set({ ...FORM, token: "B".repeat(43) }));
      await assertFails(db.collection("anonymousFeedbackForms").doc("survey1").update({ closedAt: new Date() }));
      await assertFails(db.collection("anonymousFeedbackForms").doc("survey1").delete());
      await assertFails(db.collection("anonymousFeedbackWaiting").doc(`waiting-${uid}`).set(ANSWER));
      await assertFails(db.collection("anonymousFeedbackWaiting").doc("waiting1").update({ keep: "Changed." }));
      await assertFails(db.collection("anonymousFeedbackWaiting").doc("waiting1").delete());
      await assertFails(db.collection("anonymousFeedback").doc(`kept-${uid}`).set(ANSWER));
      await assertFails(db.collection("anonymousFeedback").doc("kept1").update({ drop: "Changed." }));
      await assertFails(db.collection("anonymousFeedback").doc("kept1").delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("anonymousFeedbackWaiting").doc("waiting2").set(ANSWER));
    await assertFails(anon.collection("anonymousFeedback").doc("kept2").set(ANSWER));
    await assertFails(anon.collection("anonymousFeedbackForms").doc("survey3").set(FORM));
  });
});
