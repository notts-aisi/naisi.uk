/**
 * Rules tests for `courseFacilitating`, asking people to facilitate: shut to
 * every browser, admins and the person an ask is about included. The routes
 * under /api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators
 * and /api/courses/facilitator-asks/[askId]/answer are the only writers, and
 * the server decides what anybody is shown: the programme's lead and admins
 * see who was asked and what they answered, and the person asked sees their
 * own ask on its page and nothing else.
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
  await getTestEnv("course-facilitating");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("committee1", { role: "committee", suRecognised: true });
  await seedUser("member1", { role: "member" });
  await seedUser("member2", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "drafter", "approver", "committee1", "member1", "member2", "pending1"];

const ASK = {
  kind: "ask",
  runId: "run1",
  roundId: "round1",
  programmeId: "agi",
  groupId: "group1",
  uid: "member1",
  seat: "ask1",
  askedByUid: "committee1",
  askedAt: new Date("2026-10-26T12:00:00Z"),
  replyBy: { dateKey: "2026-10-28", time: "12:00" },
  answer: null,
  answeredAt: null,
  remindedAt: null,
  reminders: 0,
  delivery: "sent",
  email: { subject: "s", greeting: "g", paragraphs: ["p"], button: { label: "b", href: "h" }, signOff: { name: "n", role: "r" } },
  toName: "Member One",
  firstName: "Member",
  leadName: "Committee",
};
const TRAINING = {
  kind: "training",
  runId: "run1",
  dateKey: "2026-10-28",
  time: "18:00",
  room: "Room B5",
  setByUid: "committee1",
  setAt: new Date("2026-10-25T12:00:00Z"),
};
const ASK_TEST = {
  kind: "ask-test",
  runId: "run1",
  byUid: "committee1",
  at: new Date("2026-10-26T11:00:00Z"),
  wording: "0".repeat(64),
  replyBy: { dateKey: "2026-10-28", time: "12:00" },
};

async function seedFacilitating() {
  await seed(async (db) => {
    await db.collection("courseFacilitating").doc("ask1").set(ASK);
    await db.collection("courseFacilitating").doc("run1__training").set(TRAINING);
    await db.collection("courseFacilitating").doc("run1__asktest").set(ASK_TEST);
  });
}

describe("courseFacilitating: shut to every browser", () => {
  it("nobody reads an ask, the training or the test record, or lists them, the person asked and an admin included", async () => {
    await seedCast();
    await seedFacilitating();
    // The control: the rows are there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseFacilitating").doc("ask1").get()).exists, true);
      assert.equal((await unruled.collection("courseFacilitating").doc("run1__training").get()).exists, true);
      assert.equal((await unruled.collection("courseFacilitating").doc("run1__asktest").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseFacilitating").doc("ask1").get());
      await assertFails(db.collection("courseFacilitating").doc("run1__training").get());
      await assertFails(db.collection("courseFacilitating").doc("run1__asktest").get());
      await assertFails(db.collection("courseFacilitating").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseFacilitating").where("uid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("courseFacilitating").doc("ask1").get());
  });

  it("nobody writes one: not an ask, not an answer to their own, not the training, not a test, not a delete", async () => {
    await seedCast();
    await seedFacilitating();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseFacilitating").doc(`ask-by-${uid}`).set({ ...ASK, uid, seat: `ask-by-${uid}` }));
      await assertFails(db.collection("courseFacilitating").doc("ask1").update({ answer: "yes" }));
      await assertFails(db.collection("courseFacilitating").doc("run1__training").set({ ...TRAINING, room: "Elsewhere" }));
      await assertFails(db.collection("courseFacilitating").doc("run1__asktest").set({ ...ASK_TEST, byUid: uid }));
      await assertFails(db.collection("courseFacilitating").doc("ask1").delete());
      await assertFails(db.collection("courseFacilitating").doc("run1__training").delete());
    }
    await assertFails((await asAnon()).collection("courseFacilitating").doc("ask2").set({ ...ASK, seat: "ask2" }));
  });
});
