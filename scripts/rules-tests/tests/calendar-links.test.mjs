/**
 * Rules tests for `calendarLinks`, one private calendar link per person (Add
 * to calendar, board st-calendar-phone): shut to every browser, the link's
 * own owner and admins included. The link route (/api/courses/calendar) is
 * the only writer and shows the owner their link; the feed route
 * (/api/courses/calendar/[token]/sessions.ics) finds whose a token is on the
 * server. No browser reads or writes a row: a readable token is a readable
 * calendar.
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
  await getTestEnv("calendar-links");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("other", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member", "other", "pending1"];

const TOKEN = "A".repeat(43);
const LINK = { uid: "member", token: TOKEN, createdAt: new Date("2026-11-03T09:00:00Z") };

async function seedLink() {
  await seed(async (db) => {
    await db.collection("calendarLinks").doc("member").set(LINK);
  });
}

describe("calendarLinks: shut to every browser", () => {
  it("nobody reads a link or lists them: its owner, another member, the lead and an admin included", async () => {
    await seedCast();
    await seedLink();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("calendarLinks").doc("member").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("calendarLinks").doc("member").get());
      await assertFails(db.collection("calendarLinks").doc(uid).get());
      await assertFails(db.collection("calendarLinks").where("uid", "==", "member").get());
      await assertFails(db.collection("calendarLinks").where("token", "==", TOKEN).get());
      await assertFails(db.collection("calendarLinks").where("uid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("calendarLinks").doc("member").get());
    await assertFails((await asAnon()).collection("calendarLinks").where("token", "==", TOKEN).get());
  });

  it("nobody writes one: not a new link, not a new secret, not a delete, the owner included", async () => {
    await seedCast();
    await seedLink();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("calendarLinks").doc(uid).set({ uid, token: "B".repeat(43), createdAt: new Date() }));
      await assertFails(db.collection("calendarLinks").doc("member").update({ token: "C".repeat(43) }));
      await assertFails(db.collection("calendarLinks").doc("member").delete());
    }
    await assertFails((await asAnon()).collection("calendarLinks").doc("anon").set({ uid: "anon", token: "D".repeat(43), createdAt: new Date() }));
  });
});
