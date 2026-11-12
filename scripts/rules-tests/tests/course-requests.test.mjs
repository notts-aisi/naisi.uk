/**
 * Rules tests for `courseRequests`, what somebody on a programme asks of the
 * people running it and what became of it: first, a facilitator asking for a
 * line of a finished register to be corrected, with why. Shut to every
 * browser, the person who asked, the person a request is about, the
 * programme's lead and admins included. The request routes, the register's
 * read and the pages' loaders are the only readers and writers, on the Admin
 * SDK after their own gate: a request can carry a reason about a named
 * person, which is served only to the people a route decides may read it.
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
  await getTestEnv("course-requests");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("pending1", { role: "pending" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member", "pending1"];

const REQUEST = {
  kind: "register-correction",
  runId: "run1",
  groupId: "grp1",
  roundId: "round1",
  programmeId: "prog1",
  sessionKey: "w01",
  weekId: "w01",
  subjectUid: "member",
  askedByUid: "facilitator",
  askedAt: new Date("2026-11-10T09:40:00Z"),
  change: { from: { mark: "absent", online: false }, to: { mark: "present", online: false } },
  reason: "They were there all session. I tapped the wrong line.",
  status: "waiting",
  handlingUid: null,
  handlingAt: null,
  decidedByUid: null,
  decidedAt: null,
  withdrawnAt: null,
  reply: "",
  history: [{ what: "asked", byUid: "facilitator", at: new Date("2026-11-10T09:40:00Z") }],
};

async function seedRequest() {
  await seed(async (db) => {
    await db.collection("courseRequests").doc("req1").set(REQUEST);
  });
}

describe("courseRequests: shut to every browser", () => {
  it("nobody reads a request or lists them: who asked, who it is about, the lead and an admin included", async () => {
    await seedCast();
    await seedRequest();
    // The control: the row is there, and an admin's session is served a read
    // only an admin may make, so the refusals below are this block's.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("courseRequests").doc("req1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseRequests").doc("req1").get());
      await assertFails(db.collection("courseRequests").where("status", "==", "waiting").get());
      await assertFails(db.collection("courseRequests").where("runId", "==", "run1").get());
      await assertFails(db.collection("courseRequests").where("groupId", "==", "grp1").get());
      await assertFails(db.collection("courseRequests").where("askedByUid", "==", uid).get());
      await assertFails(db.collection("courseRequests").where("subjectUid", "==", uid).get());
    }
    await assertFails((await asAnon()).collection("courseRequests").doc("req1").get());
  });

  it("nobody writes one: not a new request, not a decision, not a withdrawal, not a delete", async () => {
    await seedCast();
    await seedRequest();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("courseRequests").doc(`new-${uid}`).set({ ...REQUEST, askedByUid: uid }));
      await assertFails(db.collection("courseRequests").add({ ...REQUEST, askedByUid: uid }));
      await assertFails(db.collection("courseRequests").doc("req1").update({ status: "approved", decidedByUid: uid }));
      await assertFails(db.collection("courseRequests").doc("req1").update({ status: "withdrawn" }));
      await assertFails(db.collection("courseRequests").doc("req1").update({ handlingUid: uid }));
      await assertFails(db.collection("courseRequests").doc("req1").delete());
    }
    await assertFails((await asAnon()).collection("courseRequests").doc("x").set(REQUEST));
  });
});
