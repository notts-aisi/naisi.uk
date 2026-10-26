/**
 * Rules tests for `courseCertificates`, a programme's certificates: shut to
 * every browser, admins and a certificate's own owner included. Written only
 * on the server (the send under
 * /api/admissions/forms/[roundId]/programmes/[programmeId]/certificates, the
 * owner's switch at /api/courses/certificates/[code] and the two deletion
 * cascades) and read only there: the page at /c/<code> decides who sees what.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { asAnon, asUser, assertFails, assertSucceeds, cleanup, clearData, getTestEnv, seed, seedUser } from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-certificates");
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

const CERTIFICATE = {
  kind: "finished",
  code: "K7Q2M9XH4PWR3TDB",
  uid: "member1",
  runId: "run1",
  linkOn: true,
  issuedAt: new Date("2026-12-14T10:00:00Z"),
  snapshot: {
    name: "Member One",
    did: "finished the",
    programme: "AGI Strategy Fellowship",
    term: "Autumn 2026",
    weeks: "6 weeks",
    credit: "based on the BlueDot Impact curriculum",
    issuedOn: "Mon 14 Dec 2026",
  },
  email: { state: "sent", at: new Date("2026-12-14T10:00:00Z") },
};

async function seedCertificate() {
  await seed(async (db) => {
    await db.collection("courseCertificates").doc("run1__member1__finished").set(CERTIFICATE);
  });
}

describe("courseCertificates: shut to every browser", () => {
  it("nobody reads one or lists them, by code, owner or run, its owner and an admin included, even with its link on", async () => {
    await seedCast();
    await seedCertificate();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseCertificates").doc("run1__member1__finished").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member1").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseCertificates").doc("run1__member1__finished").get());
      await assertFails(db.collection("courseCertificates").where("code", "==", "K7Q2M9XH4PWR3TDB").get());
      await assertFails(db.collection("courseCertificates").where("uid", "==", uid).get());
      await assertFails(db.collection("courseCertificates").where("runId", "==", "run1").get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("courseCertificates").doc("run1__member1__finished").get());
    await assertFails(anon.collection("courseCertificates").where("code", "==", "K7Q2M9XH4PWR3TDB").get());
  });

  it("nobody writes one: not a new one, not its link, its words or its owner, not a delete", async () => {
    await seedCast();
    await seedCertificate();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(
        db.collection("courseCertificates").doc(`run1__${uid}__facilitated`).set({ ...CERTIFICATE, kind: "facilitated", uid, code: "R3H8T5VW2KQ9MZ4C" }),
      );
      await assertFails(db.collection("courseCertificates").doc("run1__member1__finished").update({ linkOn: false }));
      await assertFails(db.collection("courseCertificates").doc("run1__member1__finished").update({ "snapshot.name": "Somebody Else" }));
      await assertFails(db.collection("courseCertificates").doc("run1__member1__finished").update({ uid }));
      await assertFails(db.collection("courseCertificates").doc("run1__member1__finished").delete());
    }
    await assertFails((await asAnon()).collection("courseCertificates").doc("run2__x__finished").set({ ...CERTIFICATE, runId: "run2", uid: "x" }));
  });
});
