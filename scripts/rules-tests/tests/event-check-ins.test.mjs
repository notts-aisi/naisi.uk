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
 * And the two things on the event itself that decide whether anybody can be
 * checked in: `selfCheckIn`, the editor's switch, which a browser writes as a
 * boolean and nothing else; and `doorOpenedAt` with `doorOpenedBy`, which only
 * /api/events/[id]/door writes, so no browser opens a door, closes one, or
 * says somebody else opened it, an admin's included.
 *
 * FOR THE REGISTRY OWNER: save as scripts/rules-tests/tests/event-check-ins.test.mjs.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
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

// ---------------------------------------------------------------------------
// The event: whether people can check themselves in, and the door
// ---------------------------------------------------------------------------

/** An event as the editor's create leaves one (`createEvent` in src/features/events/eventMutations.ts). */
function newEvent(authorUid, extra = {}) {
  return {
    title: "VR games night",
    blocks: [],
    location: "",
    visibility: "public",
    capacity: null,
    waitlistEnabled: false,
    noSignup: false,
    selfCheckIn: false,
    signupForm: [],
    foodProvenance: "none",
    coverBranding: "corner",
    status: "draft",
    authorUid,
    authorDisplayName: authorUid,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

const OPENED = { doorOpenedAt: new Date("2026-11-01T13:05:00Z"), doorOpenedBy: "admin1" };

async function seedEditors() {
  await seedCast();
  await seedUser("drafter", { role: "member", permissions: { draftEvent: true } });
  await seedUser("approver", { role: "member", permissions: { approveEvent: true } });
  await seedUser("collab", { role: "committee" });
  await seed(async (db) => {
    await db.collection("events").doc("draft1").set(newEvent("drafter", { collaboratorUids: ["collab"] }));
    await db.collection("events").doc("pending1").set(newEvent("drafter", { status: "pending" }));
    await db.collection("events").doc("live1").set(newEvent("drafter", { status: "published", ...OPENED }));
    await db.collection("events").doc("opened-draft").set(newEvent("drafter", { ...OPENED }));
  });
}

describe("events: the self check-in switch is the editor's, as a boolean", () => {
  it("a new event is made with it off, and with nothing else in its place", async () => {
    await seedEditors();
    const db = await asUser("drafter");
    // The editor's own create: off.
    await assertSucceeds(db.collection("events").doc("made").set(newEvent("drafter")));
    // A create that predates the switch carries none: off too.
    const older = newEvent("drafter");
    delete older.selfCheckIn;
    await assertSucceeds(db.collection("events").doc("made-older").set(older));
    await assertSucceeds(db.collection("events").doc("made-on").set(newEvent("drafter", { selfCheckIn: true })));
    for (const value of ["true", 1, null, { on: true }]) {
      await assertFails(db.collection("events").doc(`made-${String(value)}`).set(newEvent("drafter", { selfCheckIn: value })));
    }
  });

  it("the author, a collaborator and an approver turn it on and off where the editor saves client-direct", async () => {
    await seedEditors();
    await assertSucceeds((await asUser("drafter")).collection("events").doc("draft1").update({ selfCheckIn: true }));
    await assertSucceeds((await asUser("collab")).collection("events").doc("draft1").update({ selfCheckIn: false }));
    await assertSucceeds((await asUser("approver")).collection("events").doc("pending1").update({ selfCheckIn: true }));
    await assertSucceeds((await asUser("admin1")).collection("events").doc("live1").update({ selfCheckIn: true }));
  });

  it("anything but a boolean is refused, an admin's included", async () => {
    await seedEditors();
    for (const value of ["true", "yes", 1, null, []]) {
      await assertFails((await asUser("drafter")).collection("events").doc("draft1").update({ selfCheckIn: value }));
      await assertFails((await asUser("admin1")).collection("events").doc("draft1").update({ selfCheckIn: value }));
    }
  });

  it("nobody else turns it on: a member, a pending account, signed out, and the author once the event is live", async () => {
    await seedEditors();
    for (const uid of ["member1", "pending1", "organiser"]) {
      await assertFails((await asUser(uid)).collection("events").doc("draft1").update({ selfCheckIn: true }));
    }
    await assertFails((await asAnon()).collection("events").doc("draft1").update({ selfCheckIn: true }));
    await assertFails((await asUser("drafter")).collection("events").doc("live1").update({ selfCheckIn: true }));
  });
});

describe("events: the door is opened by the door route alone", () => {
  it("nobody opens a door from a browser, an admin, the author and an approver included", async () => {
    await seedEditors();
    const opening = { doorOpenedAt: new Date(), doorOpenedBy: "drafter" };
    // Every event here is one whose door nobody has opened; an open one is the next test's.
    for (const [uid, id] of [["admin1", "draft1"], ["admin1", "pending1"], ["drafter", "draft1"], ["collab", "draft1"], ["approver", "pending1"]]) {
      const db = await asUser(uid);
      await assertFails(db.collection("events").doc(id).update(opening));
      await assertFails(db.collection("events").doc(id).update({ doorOpenedAt: new Date() }));
      await assertFails(db.collection("events").doc(id).update({ doorOpenedBy: uid }));
    }
    // Nor is an event made with its door already open.
    await assertFails((await asUser("drafter")).collection("events").doc("made-open").set(newEvent("drafter", opening)));
    await assertFails((await asUser("drafter")).collection("events").doc("made-open-2").set(newEvent("drafter", { doorOpenedAt: null })));
    await assertFails((await asUser("admin1")).collection("events").doc("made-open-3").set(newEvent("admin1", opening)));
  });

  it("nobody closes an open door, or says somebody else opened it", async () => {
    await seedEditors();
    const remove = firebase.firestore.FieldValue.delete();
    for (const [uid, id] of [["admin1", "live1"], ["admin1", "opened-draft"], ["drafter", "opened-draft"]]) {
      const db = await asUser(uid);
      await assertFails(db.collection("events").doc(id).update({ doorOpenedAt: remove, doorOpenedBy: remove }));
      await assertFails(db.collection("events").doc(id).update({ doorOpenedAt: null }));
      await assertFails(db.collection("events").doc(id).update({ doorOpenedBy: "member1" }));
      await assertFails(db.collection("events").doc(id).update({ doorOpenedAt: new Date("2026-11-01T13:30:00Z") }));
    }
  });

  it("an ordinary save still goes through on an event whose door was opened", async () => {
    await seedEditors();
    // The pin is an equality, not a ban on documents that carry the fields.
    await assertSucceeds((await asUser("drafter")).collection("events").doc("opened-draft").update({ title: "VR games night, again" }));
    await assertSucceeds((await asUser("admin1")).collection("events").doc("live1").update({ title: "VR games night", selfCheckIn: false }));
    // The control: the fields are there, as the route left them.
    await seed(async (unruled) => {
      const live = (await unruled.collection("events").doc("live1").get()).data();
      assert.equal(live.doorOpenedBy, "admin1");
      assert.ok(live.doorOpenedAt);
    });
  });
});
