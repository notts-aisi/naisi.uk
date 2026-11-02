/**
 * Rules tests for `messageSends`, the record of each message sent from
 * Messages: shut to every browser, admins and the message's own writer
 * included. The send route (/api/messages) is the only writer, on the Admin
 * SDK, and nothing reads the records in a browser: they say who a message
 * reached and why somebody was left out, by account.
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
  await getTestEnv("message-sends");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("committee1", { role: "committee", suRecognised: false });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "committee1", "facilitator", "member", "pending1"];

const RECORD = {
  writerUid: "lead",
  tags: [{ id: "group:grp1", label: "AGI Strategy: Group B", sign: "include" }],
  mode: "notice",
  row: null,
  subject: "Room change this week",
  people: [
    { uid: "member", kind: "notice", leftOut: null, outcome: "sent" },
    { uid: "facilitator", kind: "notice", leftOut: "suppressed", outcome: null },
  ],
  counts: { people: 2, emailed: 1, leftOut: 1, sent: 1, held: 0, suppressed: 0, failed: 0 },
  reasons: { suppressed: 1 },
  postedUpdateId: null,
  sentAt: new Date("2026-11-16T09:00:00Z"),
  settled: true,
};

async function seedRecord() {
  await seed(async (db) => {
    await db.collection("messageSends").doc("s1").set(RECORD);
  });
}

describe("messageSends: shut to every browser", () => {
  it("nobody reads a record or lists them, its writer, the people it reached and an admin included", async () => {
    await seedCast();
    await seedRecord();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("messageSends").doc("s1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("messageSends").doc("s1").get());
      await assertFails(db.collection("messageSends").where("writerUid", "==", uid).get());
      await assertFails(db.collection("messageSends").get());
    }
    await assertFails((await asAnon()).collection("messageSends").doc("s1").get());
  });

  it("nobody writes one: not a new record, not an edit, not its counts, not a delete", async () => {
    await seedCast();
    await seedRecord();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("messageSends").doc(`new-${uid}`).set({ ...RECORD, writerUid: uid }));
      await assertFails(db.collection("messageSends").doc("s1").update({ subject: "Changed" }));
      await assertFails(db.collection("messageSends").doc("s1").update({ "counts.sent": 99 }));
      await assertFails(db.collection("messageSends").doc("s1").delete());
    }
    await assertFails((await asAnon()).collection("messageSends").doc("s2").set(RECORD));
  });
});
