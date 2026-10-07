/**
 * Rules tests for the profile page's own save, as the member who presses it.
 *
 * ## Why this file exists when the rules did not change
 *
 * The profile page saves client-direct. Its save has always written the
 * preferred name, the university email and the notification maps. It also
 * writes the member's own degree (`profile.subject`) and the month they
 * expect to finish (`profile.expectedGraduation`), each only when the member
 * changed it. Both were set once at registration before, and corrected by an
 * admin after that.
 *
 * That write depends on the users self-update rule pinning named FIELDS and
 * keeping `keys().hasOnly()` off `profile`, the property
 * `users-push-preferences.test.mjs` explains at length. A key list added to
 * `profile` later would refuse this save only on the day a member corrects
 * their degree. The browser suite presses Save changes without changing
 * either, so it would stay green. These writes are the alarm.
 *
 * The other half: what a member may correct is their own answer, on their own
 * document. The same save may not carry an admin-set field and may not be
 * aimed at somebody else.
 *
 * EVERY CASE RUNS AS A MEMBER. The admin branch of the self-update rule is
 * resource-independent, so testing this as an admin would pass whatever the
 * member-facing half of the rule said.
 *
 * ## Mutation check (restore bit-exact afterwards)
 *
 *  1. Add `&& request.resource.data.profile.keys().hasOnly(['preferredName',
 *     'universityEmail', 'notifications', 'newsletter'])` to the users
 *     self-update rule -> the three save tests go red.
 *  2. Delete `request.resource.data.role == resource.data.role` from the
 *     self-update branch -> the role test goes red.
 *  3. Rename `patch["profile.subject"]` in ProfileForm.tsx -> the source test
 *     goes red, which is the cue to bring this file back in step with the
 *     form.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
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

before(async () => {
  // Unique per file: a shared project id lets one file's clearFirestore()
  // wipe another's fixtures mid-test (see harness.mjs).
  await getTestEnv("users-profile-self-edit");
});
after(cleanup);
afterEach(clearData);

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FORM = readFileSync(join(REPO_ROOT, "src", "features", "profile", "ProfileForm.tsx"), "utf8");

const UNI_EMAIL = "ada@nottingham.ac.uk";

/** A member as registration leaves one, with a verified university address. */
function stored() {
  return {
    role: "member",
    profile: {
      preferredName: "Ada",
      universityEmail: UNI_EMAIL,
      uniEmailVerifiedAt: new Date("2026-09-20T10:00:00Z"),
      status: "undergraduate",
      subject: "Mathematics",
      expectedGraduation: "2027-06",
      motivation: "To learn.",
      notifications: {
        channels: { gmail: true, uniEmail: false },
        categories: { newsletter: true, events: false, courses: true, tasks: true },
        push: { newsletter: false, events: false, courses: true, tasks: false },
      },
    },
  };
}

/**
 * What the form's save always sends, as it sends it: dotted paths, the
 * university email restated unchanged, both notification shapes.
 */
function alwaysSent() {
  const { notifications } = stored().profile;
  return {
    "profile.preferredName": "Ada",
    "profile.universityEmail": UNI_EMAIL,
    "profile.notifications": notifications,
    "profile.newsletter": { subscribed: true, deliverToGmail: true, deliverToUniEmail: false },
  };
}

describe("a member corrects their own degree and graduation on the profile page", () => {
  it("saves both beside everything the form always sends", async () => {
    await seedUser("edit1", stored());
    const db = await asUser("edit1");
    await assertSucceeds(
      db
        .collection("users")
        .doc("edit1")
        .update({
          ...alwaysSent(),
          "profile.subject": "Mathematics and Computer Science",
          "profile.expectedGraduation": "2028-06",
        }),
    );
  });

  it("saves one of them alone, which is what a single correction sends", async () => {
    await seedUser("edit2", stored());
    const db = await asUser("edit2");
    await assertSucceeds(
      db
        .collection("users")
        .doc("edit2")
        .update({ ...alwaysSent(), "profile.subject": "Philosophy" }),
    );
    await assertSucceeds(
      db
        .collection("users")
        .doc("edit2")
        .update({ ...alwaysSent(), "profile.expectedGraduation": "2027-12" }),
    );
  });

  it("saves a graduation for an account that never stored one", async () => {
    // An older account answered a year of study and has no graduation field,
    // so its first correction ADDS a key to `profile`. The size cap counts
    // keys, and one more has to fit.
    const older = stored();
    delete older.profile.expectedGraduation;
    older.profile.year = "2nd year";
    await seedUser("edit3", older);
    const db = await asUser("edit3");
    await assertSucceeds(
      db
        .collection("users")
        .doc("edit3")
        .update({ ...alwaysSent(), "profile.expectedGraduation": "2028-06" }),
    );
  });

  it("cannot carry a role change, or any other admin-set field, along with it", async () => {
    await seedUser("edit4", { ...stored(), email: "edit4@example.com", policyVersion: "v5" });
    const db = await asUser("edit4");
    const carried = {
      role: "admin",
      tracks: ["technical"],
      permissions: { manageMembership: true },
      suRecognised: true,
      admissionsReviewer: true,
      paidMembershipYears: ["2026/27"],
      email: "someone-else@example.com",
      policyVersion: "v99",
    };
    for (const [field, value] of Object.entries(carried)) {
      await assertFails(
        db
          .collection("users")
          .doc("edit4")
          .update({ ...alwaysSent(), "profile.subject": "Philosophy", [field]: value }),
      );
    }
  });

  it("cannot be aimed at somebody else's document", async () => {
    await seedUser("edit5", stored());
    await seedUser("other", stored());
    const db = await asUser("edit5");
    await assertFails(
      db
        .collection("users")
        .doc("other")
        .update({ "profile.subject": "Philosophy", "profile.expectedGraduation": "2028-06" }),
    );
  });
});

describe("the form still sends what these cases stand for", () => {
  it("writes the two fields by their dotted paths, in the member's own save", () => {
    // Checked against the source so the cases above cannot outlive the write
    // they describe. If the form stops sending either path, or sends it some
    // other way, bring this file back in step before trusting it.
    for (const literal of [
      'patch["profile.subject"] = subjectTrimmed',
      'patch["profile.expectedGraduation"] = graduation',
      'await updateDoc(doc(db, "users", user.uid), patch)',
    ]) {
      assert.ok(
        FORM.includes(literal),
        `src/features/profile/ProfileForm.tsx no longer contains \`${literal}\`. The rules cases ` +
          "in this file describe the save as it was written. Read the form's save again and " +
          "change the cases to send what it sends now.",
      );
    }
  });
});
