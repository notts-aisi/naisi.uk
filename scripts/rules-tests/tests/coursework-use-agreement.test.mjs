/**
 * Rules tests for `courseworkUseAgreedAt` on `users/{uid}`: the moment a
 * person FIRST agreed to privacy v13 or later, from which what they write on
 * a course may be used outside its programme (src/lib/legal/courseworkUse.ts).
 *
 * Only the server writes it (the re-consent route and the registration's
 * profile-complete route, on the Admin SDK, which these rules do not see), so
 * no browser may bring it on a create, and no browser may introduce, change
 * or remove it on an update: not the person it belongs to, and not an admin.
 * A moment a browser could set is a moment that could be dated before writing
 * its owner never agreed to share.
 *
 * The `still lets ...` controls prove the flows that must survive: a
 * registration's create without it, a member's own profile edit and an
 * admin's ordinary update of a member who carries it.
 */
import { after, afterEach, before, describe, it } from "node:test";
import {
  asUser,
  assertFails,
  assertSucceeds,
  cleanup,
  clearData,
  getTestEnv,
  seedUser,
} from "../lib/harness.mjs";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

/** The sentinel a browser's `serverTimestamp()` sends: `request.time` in the rules. */
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

before(async () => {
  await getTestEnv("coursework-use-agreement");
});
after(cleanup);
afterEach(clearData);

const AGREED = new Date("2026-10-30T09:00:00Z");

/** What registration's create sends (src/auth/signInWithGoogle.ts), for one uid. */
function registration(uid) {
  return {
    email: `${uid}@example.com`,
    displayName: "N",
    photoURL: null,
    role: "pending",
    profile: { preferredName: "N" },
    showOnMembers: false,
    policyVersion: "terms.1+privacy.13",
    policyAgreedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
}

describe("courseworkUseAgreedAt: written by the server alone", () => {
  it("refuses a registration's create that carries the moment, whatever its value", async () => {
    const db = await asUser("newbie");
    await assertFails(
      db.collection("users").doc("newbie").set({ ...registration("newbie"), courseworkUseAgreedAt: new Date("2020-01-01") }),
    );
    await assertFails(
      db.collection("users").doc("newbie").set({ ...registration("newbie"), courseworkUseAgreedAt: serverTimestamp() }),
    );
  });

  it("still lets a registration's create through without it (the flow must survive)", async () => {
    const db = await asUser("newbie2");
    await assertSucceeds(db.collection("users").doc("newbie2").set(registration("newbie2")));
  });

  it("refuses a member introducing it on their own account", async () => {
    await seedUser("m1", { role: "member", policyVersion: "terms.1+privacy.13", profile: { preferredName: "M" } });
    const db = await asUser("m1");
    await assertFails(db.collection("users").doc("m1").update({ courseworkUseAgreedAt: new Date("2020-01-01") }));
    await assertFails(db.collection("users").doc("m1").update({ courseworkUseAgreedAt: serverTimestamp() }));
  });

  it("refuses a member moving it, or taking it off", async () => {
    await seedUser("m2", {
      role: "member",
      policyVersion: "terms.1+privacy.13",
      courseworkUseAgreedAt: AGREED,
      profile: { preferredName: "M" },
    });
    const db = await asUser("m2");
    await assertFails(db.collection("users").doc("m2").update({ courseworkUseAgreedAt: new Date("2020-01-01") }));
    await assertFails(db.collection("users").doc("m2").update({ courseworkUseAgreedAt: serverTimestamp() }));
    await assertFails(db.collection("users").doc("m2").update({ courseworkUseAgreedAt: null }));
  });

  it("refuses an admin's browser introducing, moving or taking it off", async () => {
    await seedUser("admin1", { role: "admin" });
    await seedUser("subject1", { role: "member", policyVersion: "terms.1+privacy.13" });
    await seedUser("subject2", { role: "member", policyVersion: "terms.1+privacy.13", courseworkUseAgreedAt: AGREED });
    const db = await asUser("admin1");
    await assertFails(db.collection("users").doc("subject1").update({ courseworkUseAgreedAt: new Date("2020-01-01") }));
    await assertFails(db.collection("users").doc("subject2").update({ courseworkUseAgreedAt: new Date("2020-01-01") }));
    await assertFails(db.collection("users").doc("subject2").update({ courseworkUseAgreedAt: null }));
  });

  it("still lets a member who carries it edit their own profile (the flow must survive)", async () => {
    await seedUser("m3", {
      role: "member",
      policyVersion: "terms.1+privacy.13",
      courseworkUseAgreedAt: AGREED,
      profile: { preferredName: "M" },
    });
    const db = await asUser("m3");
    await assertSucceeds(db.collection("users").doc("m3").update({ "profile.preferredName": "Renamed", showOnMembers: true }));
  });

  it("still lets an admin make an ordinary change to somebody who carries it (the flow must survive)", async () => {
    await seedUser("admin2", { role: "admin" });
    await seedUser("subject3", { role: "member", policyVersion: "terms.1+privacy.13", courseworkUseAgreedAt: AGREED });
    const db = await asUser("admin2");
    await assertSucceeds(db.collection("users").doc("subject3").update({ tracks: ["technical"] }));
  });
});
