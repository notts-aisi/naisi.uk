/**
 * Rules tests for events for chosen people (src/lib/events/reach.ts,
 * src/lib/events/invitations.ts).
 *
 * An event is for anyone (`visibility: "public"`), for people with a NAISI
 * account (`"members"`, and an event with no value reads as that, as it
 * always did), or only for the people its organiser chose (`"chosen"`). A
 * published listed event is readable by any signed-in browser, as before. An
 * event for chosen people, or one whose value is none of the three, is
 * readable only by the people who run events (admins, the committee, and the
 * holders of draftEvent or approveEvent): the people invited to it read it on
 * the server, which decides who may open it, never from a browser. A
 * browser writes `visibility` as one of the three values, `announce` as a
 * boolean, and never `programme`, which only the audience route writes, an
 * admin's browser included.
 *
 * And the two server-only collections: `eventAudiences` (who an event is
 * for, as chosen) and `eventInvitations` (who was invited), shut to every
 * browser, admins and the people invited included.
 */
import { after, afterEach, before, describe, it } from "node:test";
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
  await getTestEnv("events-chosen-people");
});
after(cleanup);
afterEach(clearData);

function newEvent(authorUid, extra = {}) {
  return {
    title: "Pitching dinner",
    blocks: [],
    location: "Cobden Room",
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

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("su1", { role: "committee", suRecognised: true });
  await seedUser("committee1", { role: "committee", suRecognised: false });
  await seedUser("drafter", { role: "member", permissions: { draftEvent: true } });
  await seedUser("approver", { role: "member", permissions: { approveEvent: true } });
  // Invited to the event for chosen people: a plain member.
  await seedUser("invitee", { role: "member" });
  await seedUser("stranger", { role: "member" });
  await seedUser("pending1", { role: "pending" });
  await seed(async (db) => {
    await db.collection("events").doc("public1").set(newEvent("drafter", { status: "published", visibility: "public" }));
    await db.collection("events").doc("members1").set(newEvent("drafter", { status: "published", visibility: "members" }));
    await db.collection("events").doc("older1").set(newEvent("drafter", { status: "published" }));
    await db.collection("events").doc("chosen1").set(
      newEvent("drafter", {
        status: "published",
        visibility: "chosen",
        programme: { roundId: "round1", programmeId: "agi", name: "AGI Strategy" },
      }),
    );
    await db.collection("events").doc("odd1").set(newEvent("drafter", { status: "published", visibility: "secret" }));
    await db.collection("events").doc("draft1").set(newEvent("drafter", { visibility: "chosen" }));
    await db.collection("eventAudiences").doc("chosen1").set({ eventId: "chosen1", include: ["person:invitee"], exclude: [], setBy: "su1", setAt: new Date() });
    await db.collection("eventInvitations").doc("chosen1__invitee").set({
      eventId: "chosen1",
      uid: "invitee",
      invitedAt: new Date(),
      invitedBy: "admin1",
      via: "publish",
      how: "grid",
      outcome: "sent",
      why: null,
    });
  });
}

const RUNS_EVENTS = ["admin1", "su1", "committee1", "drafter", "approver"];

describe("events: who may read an event for chosen people from a browser", () => {
  it("a published listed event, missing value included, is read by any signed-in browser, as before", async () => {
    await seedCast();
    for (const uid of ["invitee", "stranger", ...RUNS_EVENTS]) {
      const db = await asUser(uid);
      for (const id of ["public1", "members1", "older1"]) await assertSucceeds(db.collection("events").doc(id).get());
    }
    for (const id of ["public1", "members1"]) await assertFails((await asAnon()).collection("events").doc(id).get());
  });

  it("an event for chosen people is the events team's alone: its invitee and a stranger are refused", async () => {
    await seedCast();
    for (const uid of RUNS_EVENTS) await assertSucceeds((await asUser(uid)).collection("events").doc("chosen1").get());
    for (const uid of ["invitee", "stranger", "pending1"]) await assertFails((await asUser(uid)).collection("events").doc("chosen1").get());
    await assertFails((await asAnon()).collection("events").doc("chosen1").get());
  });

  it("a value that is none of the three fails closed, as the code reads it", async () => {
    await seedCast();
    await assertFails((await asUser("stranger")).collection("events").doc("odd1").get());
    await assertSucceeds((await asUser("su1")).collection("events").doc("odd1").get());
  });

  it("a query a member could make for published events does not reach one for chosen people", async () => {
    await seedCast();
    // Unfiltered by who it is for, the query is refused whole for a member: it would include chosen1.
    await assertFails((await asUser("stranger")).collection("events").where("status", "==", "published").get());
    await assertFails((await asUser("invitee")).collection("events").where("status", "==", "published").get());
    // The people who run events read every event, as the manage list does.
    await assertSucceeds((await asUser("committee1")).collection("events").where("status", "==", "published").get());
  });
});

describe("events: what a browser may write about who it is for", () => {
  it("the editor writes one of the three values, and announce as a boolean", async () => {
    await seedCast();
    const db = await asUser("drafter");
    for (const visibility of ["public", "members", "chosen"]) {
      await assertSucceeds(db.collection("events").doc("draft1").update({ visibility }));
    }
    await assertSucceeds(db.collection("events").doc("draft1").update({ announce: false }));
    await assertSucceeds(db.collection("events").doc("draft1").update({ announce: true }));
    for (const visibility of ["secret", "", 1, null]) {
      await assertFails(db.collection("events").doc("draft1").update({ visibility }));
    }
    for (const announce of ["false", 0, null]) {
      await assertFails(db.collection("events").doc("draft1").update({ announce }));
    }
    await assertSucceeds((await asUser("drafter")).collection("events").doc("made1").set(newEvent("drafter", { visibility: "chosen", announce: false })));
    await assertFails((await asUser("drafter")).collection("events").doc("made2").set(newEvent("drafter", { visibility: "invite" })));
  });

  it("no browser sets, changes or takes off the programme an event is part of, an admin's included", async () => {
    await seedCast();
    const programme = { roundId: "round1", programmeId: "agi", name: "AGI Strategy" };
    await assertFails((await asUser("drafter")).collection("events").doc("draft1").update({ programme }));
    await assertFails((await asUser("admin1")).collection("events").doc("draft1").update({ programme }));
    await assertFails((await asUser("admin1")).collection("events").doc("chosen1").update({ programme: null }));
    await assertFails(
      (await asUser("drafter")).collection("events").doc("made3").set(newEvent("drafter", { visibility: "chosen", programme })),
    );
    // Writing everything else leaves it as it is, and passes.
    await assertSucceeds((await asUser("admin1")).collection("events").doc("chosen1").update({ title: "Pitching supper" }));
  });
});

describe("eventAudiences and eventInvitations: closed to every browser", () => {
  for (const [collection, id] of [
    ["eventAudiences", "chosen1"],
    ["eventInvitations", "chosen1__invitee"],
  ]) {
    it(`${collection}: nobody reads or writes it from a browser`, async () => {
      await seedCast();
      for (const uid of ["admin1", "su1", "committee1", "drafter", "approver", "invitee", "stranger", "pending1"]) {
        const db = await asUser(uid);
        await assertFails(db.collection(collection).doc(id).get());
        await assertFails(db.collection(collection).where("eventId", "==", "chosen1").get());
        await assertFails(db.collection(collection).doc(id).set({ eventId: "chosen1" }));
        await assertFails(db.collection(collection).doc("new1").set({ eventId: "chosen1", uid }));
      }
      await assertFails((await asUser("invitee")).collection(collection).where("uid", "==", "invitee").get());
      await assertFails((await asAnon()).collection(collection).doc(id).get());
    });
  }
});
