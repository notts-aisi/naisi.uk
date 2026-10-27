/**
 * Rules tests for check-in (`eventCheckIns`, src/lib/firestore/eventCheckIns.ts):
 * who came to an event, shut to every browser, admins, the event's organiser
 * and the person themselves included. The check-in routes under
 * /api/events/[id] are the only writers, on the Admin SDK, and the server
 * decides what anybody is shown: names only to the people who run check-in
 * (admins and SU-recognised committee), counts to the event's other
 * organisers, and a person only their own "you're checked in". A readable
 * record would name who came to which event, and a walk-in's email.
 *
 * FOR THE REGISTRY OWNER: save as scripts/rules-tests/tests/event-check-ins.test.mjs.
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
  await getTestEnv("event-check-ins");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("su1", { role: "committee", suRecognised: true });
  await seedUser("organiser", { role: "committee", suRecognised: false });
  await seedUser("member1", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "su1", "organiser", "member1", "pending1"];

const SIGNUP = {
  eventId: "event1",
  kind: "signup",
  rsvpId: "rsvp1",
  uid: "member1",
  name: null,
  email: null,
  emailGoesAt: null,
  how: "qr",
  byUid: null,
  at: new Date("2026-11-01T14:05:00Z"),
  namesOffAt: new Date("2027-11-01T17:00:00Z"),
  namesOff: false,
};
const WALK_IN = {
  eventId: "event1",
  kind: "walk-in",
  rsvpId: null,
  uid: null,
  name: "Dan Fitzgerald",
  email: "dan@example.com",
  emailGoesAt: new Date("2026-11-08T17:00:00Z"),
  how: "door",
  byUid: "su1",
  at: new Date("2026-11-01T14:15:00Z"),
  namesOffAt: new Date("2027-11-01T17:00:00Z"),
  namesOff: false,
};

async function seedCheckIns() {
  await seed(async (db) => {
    await db.collection("events").doc("event1").set({ title: "VR games night", status: "published", authorUid: "organiser" });
    await db.collection("eventCheckIns").doc("c1").set(SIGNUP);
    await db.collection("eventCheckIns").doc("c2").set(WALK_IN);
  });
}

describe("eventCheckIns: shut to every browser", () => {
  it("nobody reads a check-in or lists them: the person, the organiser, SU-recognised committee and an admin included", async () => {
    await seedCast();
    await seedCheckIns();
    // The control: the records are there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("eventCheckIns").doc("c1").get()).exists, true);
      assert.equal((await unruled.collection("eventCheckIns").doc("c2").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("eventCheckIns").doc("c1").get());
      await assertFails(db.collection("eventCheckIns").doc("c2").get());
      await assertFails(db.collection("eventCheckIns").get());
      await assertFails(db.collection("eventCheckIns").where("eventId", "==", "event1").get());
      await assertFails(db.collection("eventCheckIns").where("uid", "==", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("eventCheckIns").doc("c1").get());
    await assertFails(anon.collection("eventCheckIns").where("eventId", "==", "event1").get());
  });

  it("nobody writes one: not a check-in of their own, not a tick, not an undo, not an email taken off", async () => {
    await seedCast();
    await seedCheckIns();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(
        db.collection("eventCheckIns").doc(`self-${uid}`).set({ ...SIGNUP, uid, rsvpId: null, kind: "walk-in", name: "Me" }),
      );
      await assertFails(db.collection("eventCheckIns").add({ ...WALK_IN, byUid: uid }));
      await assertFails(db.collection("eventCheckIns").doc("c1").update({ how: "door", byUid: uid }));
      await assertFails(db.collection("eventCheckIns").doc("c2").update({ email: null, emailGoesAt: null }));
      await assertFails(db.collection("eventCheckIns").doc("c1").delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("eventCheckIns").doc("c3").set(WALK_IN));
    await assertFails(anon.collection("eventCheckIns").doc("c1").delete());
  });
});
