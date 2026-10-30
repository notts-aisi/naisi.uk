/**
 * Rules tests for surveys (docs/surveys.md): `surveys`, `surveyPeople` and
 * `surveyAnswers`, shut to every browser, admins and a row's own person
 * included. The survey routes under /api/surveys are the only writers, and
 * the server decides what anybody is shown: the admins' pages read the
 * survey, who it went to and the totals, and the answer page and its routes
 * find a person's own row by the secret in their link. A readable people row
 * is a readable secret, and a readable answer names who said what.
 *
 * The questions somebody left blank (docs/surveys.md) add no collection: the
 * link of blanks is on the person's row (`blanks`, `blanksPresses`) and what
 * they send later is on their answer (`fills`), both under these blocks. The
 * last block holds each of those fields shut too.
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
  await getTestEnv("surveys");
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

const TOKEN = "A".repeat(43);
const SURVEY = {
  kind: "before",
  privacy: "confidential",
  name: "AGI Strategy: before",
  title: "Before you start",
  audience: { kind: "programme", roundId: "round1", programmeId: "prog1" },
  runId: "run1",
  closesAt: new Date("2026-11-08T23:59:00Z"),
  closedAt: null,
  firstSentAt: new Date("2026-10-29T09:00:00Z"),
  testToken: "B".repeat(43),
  createdByUid: "admin1",
};
const PERSON = {
  surveyId: "survey1",
  roundId: "round1",
  respondent: { kind: "account", uid: "member1" },
  token: TOKEN,
  sentAt: new Date("2026-10-29T09:00:00Z"),
  answered: true,
};
const ANSWER = {
  surveyId: "survey1",
  roundId: "round1",
  respondent: { kind: "account", uid: "member1" },
  answers: {},
  sentAt: new Date("2026-10-30T18:00:00Z"),
  via: "link",
  afterFirstSession: false,
};

async function seedSurvey() {
  await seed(async (db) => {
    await db.collection("surveys").doc("survey1").set(SURVEY);
    await db.collection("surveyPeople").doc("survey1__member1").set(PERSON);
    await db.collection("surveyAnswers").doc("answer1").set(ANSWER);
  });
}

describe("surveys: shut to every browser", () => {
  it("nobody reads a survey, a people row or an answer, or lists them: the person, the lead and an admin included", async () => {
    await seedCast();
    await seedSurvey();
    // The control: the rows are there, and an admin's session is served a read
    // only an admin may make, so the refusals below are these blocks'.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("surveys").doc("survey1").get()).exists, true);
      assert.equal((await unruled.collection("surveyPeople").doc("survey1__member1").get()).exists, true);
      assert.equal((await unruled.collection("surveyAnswers").doc("answer1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("surveys").doc("survey1").get());
      await assertFails(db.collection("surveys").get());
      await assertFails(db.collection("surveyPeople").doc("survey1__member1").get());
      await assertFails(db.collection("surveyPeople").doc(`survey1__${uid}`).get());
      await assertFails(db.collection("surveyPeople").where("token", "==", TOKEN).get());
      await assertFails(db.collection("surveyPeople").where("respondent.uid", "==", uid).get());
      await assertFails(db.collection("surveyAnswers").doc("answer1").get());
      await assertFails(db.collection("surveyAnswers").where("surveyId", "==", "survey1").get());
      await assertFails(db.collection("surveyAnswers").where("respondent.uid", "==", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("surveys").doc("survey1").get());
    await assertFails(anon.collection("surveyPeople").where("token", "==", TOKEN).get());
    await assertFails(anon.collection("surveyAnswers").doc("answer1").get());
  });

  it("nobody writes one: not a survey, not a row, not an answer, not a delete, the person included", async () => {
    await seedCast();
    await seedSurvey();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("surveys").doc("survey2").set({ ...SURVEY, createdByUid: uid }));
      await assertFails(db.collection("surveys").doc("survey1").update({ closedAt: new Date() }));
      await assertFails(db.collection("surveys").doc("survey1").delete());
      await assertFails(
        db.collection("surveyPeople").doc(`survey1__${uid}`).set({
          ...PERSON,
          respondent: { kind: "account", uid },
          token: "C".repeat(43),
          answered: false,
        }),
      );
      await assertFails(db.collection("surveyPeople").doc("survey1__member1").update({ answered: false }));
      await assertFails(db.collection("surveyPeople").doc("survey1__member1").delete());
      await assertFails(db.collection("surveyAnswers").doc("answer2").set({ ...ANSWER, respondent: { kind: "account", uid } }));
      await assertFails(db.collection("surveyAnswers").doc("answer1").update({ respondent: null }));
      await assertFails(db.collection("surveyAnswers").doc("answer1").delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("surveyPeople").doc("survey1__anon").set({ ...PERSON, respondent: null }));
    await assertFails(anon.collection("surveyAnswers").doc("answer3").set({ ...ANSWER, respondent: null, via: "link" }));
  });
});

describe("surveys: the questions left blank are shut too", () => {
  const BLANKS = { token: "D".repeat(43), sentAt: new Date("2026-10-30T09:00:00Z"), delivery: "sent", spentAt: null };
  const FILL = { answers: { q_c2: { type: "percent", value: 35 } }, sentAt: new Date("2026-10-30T10:00:00Z"), via: "link", afterFirstSession: false };

  async function seedBlanks() {
    await seed(async (db) => {
      await db.collection("surveys").doc("survey1").set(SURVEY);
      await db
        .collection("surveyPeople")
        .doc("survey1__member1")
        .set({ ...PERSON, blanks: BLANKS, blanksPresses: [{ at: new Date("2026-10-30T09:00:00Z"), byUid: "admin1", count: 1 }] });
      await db.collection("surveyAnswers").doc("answer1").set({ ...ANSWER, fills: [FILL] });
    });
  }

  it("nobody finds a row by its link of blanks, or reads a later send, the person and an admin included", async () => {
    await seedCast();
    await seedBlanks();
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("surveyPeople").where("blanks.token", "==", BLANKS.token).get()).size, 1);
      assert.equal(((await unruled.collection("surveyAnswers").doc("answer1").get()).data() ?? {}).fills.length, 1);
    });
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("surveyPeople").where("blanks.token", "==", BLANKS.token).get());
      await assertFails(db.collection("surveyPeople").doc("survey1__member1").get());
      await assertFails(db.collection("surveyAnswers").doc("answer1").get());
    }
    await assertFails((await asAnon()).collection("surveyPeople").where("blanks.token", "==", BLANKS.token).get());
  });

  it("nobody presses for blanks, spends a link or adds a later send from a browser, the person and an admin included", async () => {
    await seedCast();
    await seedBlanks();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      const row = db.collection("surveyPeople").doc("survey1__member1");
      await assertFails(row.update({ blanks: { ...BLANKS, token: "E".repeat(43) } }));
      await assertFails(row.update({ "blanks.spentAt": new Date() }));
      await assertFails(row.update({ blanksPresses: [] }));
      const answer = db.collection("surveyAnswers").doc("answer1");
      await assertFails(answer.update({ fills: [FILL, { ...FILL, answers: { q_c4: { type: "scale", value: 2 } } }] }));
      await assertFails(answer.update({ fills: [] }));
      await assertFails(answer.update({ answers: { q_c2: { type: "percent", value: 1 } } }));
    }
    const anon = await asAnon();
    await assertFails(anon.collection("surveyPeople").doc("survey1__member1").update({ "blanks.spentAt": new Date() }));
    await assertFails(anon.collection("surveyAnswers").doc("answer1").update({ fills: [] }));
  });
});
