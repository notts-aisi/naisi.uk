/**
 * Rules tests for public numbers: `publicNumbers` (one document per programme
 * of a term's form: what its public page's "Last term" block shows, as an
 * admin published it). Shut to every browser, an admin's included: it is
 * written only by the publish route and deleted only by Take it down, both an
 * admin's on the Admin SDK, and read only on the server, the public page
 * through a fetcher that projects the block's own fields. A browser read
 * would hand a visitor the record whole, with who published it.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("public-numbers");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("committee1", { role: "committee", suRecognised: false });
  await seedUser("member1", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "committee1", "member1", "pending1"];

const ID = "autumn-2026__f0rm0001__agi-strategy";
const RECORD = {
  roundId: "autumn-2026__f0rm0001",
  programmeId: "agi-strategy",
  courseId: "agi-strategy-fellowship__c0urse01",
  term: "Autumn 2026",
  lastSessionOn: "2026-12-09",
  heading: "How autumn 2026 went.",
  numbers: [{ id: "recommend", figure: { kind: "one", value: "23 of 27" }, words: "fellows would recommend it", n: 27, base: "From 27 answers" }],
  quotes: [{ text: "Writing the threat model." }],
  attribution: "Autumn 2026 fellow",
  footer: "From the fellowship’s own surveys, autumn 2026: 27 of 31 fellows answered at the end.",
  publishedAt: new Date("2026-12-11T10:00:00Z"),
  publishedByUid: "admin1",
};

async function seedRecord() {
  await seed(async (db) => {
    await db.collection("publicNumbers").doc(ID).set(RECORD);
  });
}

describe("publicNumbers: shut to every browser", () => {
  it("nobody reads one or lists them, an admin and the programme's lead included, nor anybody signed out", async () => {
    await seedCast();
    await seedRecord();
    // The control: the document is there, and an admin's session is served a
    // read only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("publicNumbers").doc(ID).get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("publicNumbers").doc(ID).get());
      await assertFails(db.collection("publicNumbers").get());
      await assertFails(db.collection("publicNumbers").where("courseId", "==", RECORD.courseId).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("publicNumbers").doc(ID).get());
    await assertFails(anon.collection("publicNumbers").where("courseId", "==", RECORD.courseId).get());
  });

  it("nobody writes one: not a new record, not a change to the published numbers, not a take-down", async () => {
    await seedCast();
    await seedRecord();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("publicNumbers").doc(`spring-2027__f0rm0002__agi-strategy`).set({ ...RECORD, roundId: "spring-2027__f0rm0002", publishedByUid: uid }));
      await assertFails(db.collection("publicNumbers").doc(ID).update({ numbers: [] }));
      await assertFails(db.collection("publicNumbers").doc(ID).update({ quotes: [{ text: "Words nobody ticked." }] }));
      await assertFails(db.collection("publicNumbers").doc(ID).delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("publicNumbers").doc("x").set(RECORD));
    await assertFails(anon.collection("publicNumbers").doc(ID).delete());
  });
});
