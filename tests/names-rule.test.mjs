/**
 * WHICH NAME A VIEWER SEES, run.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The privacy policy says: "Only the committee sees your full name; everyone
 * else sees the name you go by." The rule is `nameForViewer` and its parts in
 * `src/lib/names/staffName.ts`; the staff screens' loader is `staffNamesFor`
 * in `src/lib/names/load.ts`. This suite runs both as every kind of viewer:
 *
 *  1. THE VIEWER. The committee role and admins see the full name,
 *     SU-recognised or not; everybody else, a facilitator who is a member
 *     included, sees the name people go by, and nothing taken from the full
 *     name: no surname, no initial.
 *  2. THE PARTS a staff screen draws: "Priya Shah (Pri)", the name people go
 *     by left out where it is only the start of the full name.
 *  3. TWO PEOPLE WITH ONE FULL NAME on one staff screen, told apart by their
 *     programme and group, and for an admin their email, read by the loader
 *     against a store; and a guest who gave one word, marked.
 *  4. THE SHARED HELPERS put the name people go by first: `accountNameOf`,
 *     which names every route's session, and `fullNameOfUser`, which course
 *     screens read.
 *  5. THE CERTIFICATE prints what it printed before the site asked for a full
 *     name, through its own rule.
 *
 * `tests/full-name-readers.test.mjs` is the other half: every file that reads,
 * writes or draws a full name, with the gate in front of it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export const getAdminDb = () => null;\nexport const getAdminAuth = () => null;"],
  ]),
});

const names = await loadTs("lib/names/staffName.ts");
const { staffNamesFor } = await loadTs("lib/names/load.ts");
const { certificateNameOf } = await loadTs("lib/names/certificateName.ts");
const { accountNameOf } = await loadTs("lib/firestore/users.ts");
const { fullNameOfUser, firstNameOfUser } = await loadTs("lib/courses/programmeLead.ts");

/** An account made with Google: Google's name stored as its display name. */
const PRIYA = { displayName: "Priya Shah", email: "priya@example.com", profile: { preferredName: "Pri", fullName: "Priya Shah" } };

/** Every kind of viewer, as the session's role. */
const VIEWERS = {
  admin: { role: "admin" },
  "SU-recognised committee": { role: "committee", suRecognised: true },
  "committee the SU does not recognise": { role: "committee", suRecognised: false },
  "a member who facilitates a group": { role: "member" },
  "an account waiting for approval": { role: "pending" },
  "an account turned down": { role: "rejected" },
  "nobody signed in": null,
};

// ===========================================================================
// 1. The viewer
// ===========================================================================

describe("the committee sees a full name, and everybody else the name people go by", () => {
  test("who the committee is: the role and admins, SU-recognised or not", () => {
    const sees = Object.fromEntries(Object.entries(VIEWERS).map(([label, viewer]) => [label, names.seesFullNames(viewer)]));
    assert.deepEqual(sees, {
      admin: true,
      "SU-recognised committee": true,
      "committee the SU does not recognise": true,
      "a member who facilitates a group": false,
      "an account waiting for approval": false,
      "an account turned down": false,
      "nobody signed in": false,
    });
  });

  test("the rule, run as every viewer", () => {
    const seen = Object.fromEntries(
      Object.entries(VIEWERS).map(([label, viewer]) => [label, names.nameForViewer(viewer, names.accountNamesOf(PRIYA), "NAISI member")]),
    );
    assert.deepEqual(seen, {
      admin: "Priya Shah (Pri)",
      "SU-recognised committee": "Priya Shah (Pri)",
      "committee the SU does not recognise": "Priya Shah (Pri)",
      "a member who facilitates a group": "Pri",
      "an account waiting for approval": "Pri",
      "an account turned down": "Pri",
      "nobody signed in": "Pri",
    });
  });

  test("a member is never shown anything taken from a full name: no surname, no initial", () => {
    const sams = [
      { profile: { fullName: "Sam Okoro", preferredName: "Sam" } },
      { profile: { fullName: "Sam Patel", preferredName: "Sam" } },
    ];
    for (const account of sams) {
      const shown = names.nameForViewer({ role: "member" }, names.accountNamesOf(account), "NAISI member");
      assert.equal(shown, "Sam");
      assert.ok(!/Okoro|Patel|\bO\.|\bP\./.test(shown));
    }
  });

  test("an account with no name the person goes by falls back to its display name, then to the caller's word", () => {
    const google = { displayName: "Priya Shah", profile: { fullName: "Priya Shah" } };
    assert.equal(names.nameForViewer({ role: "member" }, names.accountNamesOf(google), "NAISI member"), "Priya Shah");
    // A full name alone is never what a member sees.
    const fullOnly = { profile: { fullName: "Priya Shah" } };
    assert.equal(names.nameForViewer({ role: "member" }, names.accountNamesOf(fullOnly), "NAISI member"), "NAISI member");
    assert.equal(names.nameForViewer({ role: "admin" }, names.accountNamesOf(fullOnly), "NAISI member"), "Priya Shah");
    assert.equal(names.nameForViewer({ role: "admin" }, names.accountNamesOf({}), "NAISI member"), "NAISI member");
  });
});

// ===========================================================================
// 2. The parts
// ===========================================================================

describe("a staff screen's name, in its parts", () => {
  const staff = (account) => names.staffNameWords(names.staffNameOf(names.accountNamesOf(account), "NAISI member"));

  test("the full name, then the name people go by when it adds something", () => {
    assert.equal(staff({ profile: { fullName: "Priya Shah", preferredName: "Pri" } }), "Priya Shah (Pri)");
    assert.equal(staff({ profile: { fullName: "Sam Okoro", preferredName: "Sam" } }), "Sam Okoro");
    assert.equal(staff({ profile: { fullName: "Sam Patel", preferredName: "Sammy" } }), "Sam Patel (Sammy)");
    assert.equal(staff({ profile: { fullName: "Mary Jane Watson", preferredName: "Mary Jane" } }), "Mary Jane Watson");
    assert.equal(staff({ profile: { fullName: "sam okoro", preferredName: "Sam" } }), "sam okoro");
    assert.equal(staff({ profile: { fullName: "Priya Shah", preferredName: "Priya Shah" } }), "Priya Shah");
  });

  test("before anybody was asked, an account made with Google is named by Google's name", () => {
    assert.equal(staff({ displayName: "Priya Shah", profile: { preferredName: "Pri" } }), "Priya Shah (Pri)");
    // A full name given wins over Google's.
    assert.equal(staff({ displayName: "P Shah", profile: { preferredName: "Pri", fullName: "Priya Shah" } }), "Priya Shah (Pri)");
    // An account made with an email address has no display name: the name it goes by.
    assert.equal(staff({ displayName: null, profile: { preferredName: "Pri" } }), "Pri");
  });

  test("what an account holds is read as text, trimmed, and nothing else", () => {
    assert.deepEqual(names.accountNamesOf({ displayName: "  Priya   Shah ", profile: { preferredName: " Pri ", fullName: 5 } }), {
      full: "Priya Shah",
      goBy: "Pri",
    });
    assert.deepEqual(names.accountNamesOf({ profile: "Pri" }), { full: null, goBy: null });
    assert.deepEqual(names.accountNamesOf(null), { full: null, goBy: null });
    assert.deepEqual(names.accountNamesOf({ profile: { fullName: "   ", preferredName: "" } }), { full: null, goBy: null });
    assert.equal(names.goByNameOf(PRIYA), "Pri");
  });

  test("a guest who gave one word is marked, and two words are not", () => {
    assert.deepEqual(names.guestStaffName("Sam", "No name given"), { name: "Sam", goBy: null, apart: null, note: "Guest: first name only" });
    assert.deepEqual(names.guestStaffName("  Sam   Okoro ", "No name given"), { name: "Sam Okoro", goBy: null, apart: null, note: null });
    assert.deepEqual(names.guestStaffName("   ", "No name given"), { name: "No name given", goBy: null, apart: null, note: null });
    assert.equal(names.staffNameWords(names.guestStaffName("Sam", "x")), "Sam · Guest: first name only");
  });

  test("full names are compared without case or extra spaces", () => {
    const shared = names.sharedFullNames([
      { key: "a", full: "Sam Okoro" },
      { key: "b", full: "sam  okoro" },
      { key: "c", full: "Sam Patel" },
      { key: "d", full: null },
      { key: "e", full: null },
    ]);
    assert.deepEqual([...shared].sort(), ["a", "b"]);
    // One person listed twice is not two people.
    assert.deepEqual([...names.sharedFullNames([{ key: "a", full: "Sam Okoro" }, { key: "a", full: "Sam Okoro" }])], []);
  });
});

// ===========================================================================
// 3. The loader: two people with one full name, on one screen
// ===========================================================================

describe("a staff screen's loader tells two people with one full name apart", () => {
  const told = new Date("2026-10-20T12:00:00Z");
  const world = () =>
    makeDb({
      "users/sam1": { email: "sam1@example.com", displayName: null, profile: { fullName: "Sam Okoro", preferredName: "Sam" } },
      "users/sam2": { email: "sam2@example.com", displayName: "Sam Okoro", profile: { preferredName: "Sammy" } },
      "users/priya": { email: "priya@example.com", ...PRIYA },
      "users/nameless": { email: "nobody@example.com", profile: {} },
      "courseRuns/run1": { courseId: "c1", courseTitle: "AGI Strategy", label: "Autumn 2026", status: "running", archived: false },
      "courseRuns/old": { courseId: "c0", courseTitle: "Last Year", label: "Spring 2026", status: "completed", archived: false },
      "courseGroups/g1": { runId: "run1", courseId: "c1", name: "Tuesday group" },
      "courseGroups/g2": { runId: "run1", courseId: "c1", name: "Thursday group" },
      // Told their group: Publish has emailed them.
      "courseEnrolments/run1__sam1": { runId: "run1", courseId: "c1", uid: "sam1", groupId: "g1", status: "active", role: "learner", allocatedEmailAt: told },
      // Placed and not told yet: the group is the board's working copy.
      "courseEnrolments/run1__sam2": { runId: "run1", courseId: "c1", uid: "sam2", groupId: "g2", status: "active", role: "learner", allocatedEmailAt: null },
      // A finished programme says nothing about where somebody is now.
      "courseEnrolments/old__sam2": { runId: "old", courseId: "c0", uid: "sam2", groupId: null, status: "active", role: "learner" },
    });
  const UIDS = ["sam1", "sam2", "priya", "nameless", "gone"];
  const plain = (map) => Object.fromEntries([...map].map(([uid, name]) => [uid, names.staffNameWords(name)]));

  test("an admin: the programme and group, and the email", async () => {
    const shown = plain(await staffNamesFor(world(), UIDS, { role: "admin" }));
    assert.deepEqual(shown, {
      sam1: "Sam Okoro · AGI Strategy, Tuesday group · sam1@example.com",
      // An admin is shown a placement Publish has not told yet, as on the board.
      sam2: "Sam Okoro (Sammy) · AGI Strategy, Thursday group · sam2@example.com",
      priya: "Priya Shah (Pri)",
    });
  });

  test("a committee member: the programme and group once Publish has told it, and no email", async () => {
    const shown = plain(await staffNamesFor(world(), UIDS, { role: "committee", suRecognised: true }));
    assert.deepEqual(shown, {
      sam1: "Sam Okoro · AGI Strategy, Tuesday group",
      sam2: "Sam Okoro (Sammy) · AGI Strategy",
      priya: "Priya Shah (Pri)",
    });
  });

  test("a screen that shows every email already does not add one", async () => {
    const shown = plain(await staffNamesFor(world(), UIDS, { role: "admin" }, { emailShown: true }));
    assert.equal(shown.sam1, "Sam Okoro · AGI Strategy, Tuesday group");
  });

  test("anybody else: the name people go by, whatever the screen asked", async () => {
    for (const viewer of [{ role: "member" }, { role: "pending" }, null]) {
      const shown = plain(await staffNamesFor(world(), UIDS, viewer));
      assert.deepEqual(shown, { sam1: "Sam", sam2: "Sammy", priya: "Pri" });
    }
  });

  test("nobody sharing a full name reads no seat at all", async () => {
    const db = world();
    const before = db.stats.reads;
    await staffNamesFor(db, ["priya", "sam1"], { role: "admin" });
    // The two accounts, and nothing else.
    assert.equal(db.stats.reads - before, 2);
  });
});

// ===========================================================================
// 4. The shared helpers
// ===========================================================================

describe("the shared helpers put the name people go by first", () => {
  const ACCOUNTS = [
    ["an account made with Google", { displayName: "Priya Shah", profile: { preferredName: "Pri" } }, "Pri", "Pri"],
    ["an account with a full name", { displayName: null, profile: { fullName: "Priya Shah", preferredName: "Pri" } }, "Pri", "Pri"],
    ["an account made with an email address", { displayName: null, profile: { preferredName: "Priya" } }, "Priya", "Priya"],
    ["no preferred name", { displayName: "Priya Shah", profile: { preferredName: "" } }, "Priya Shah", "Priya Shah"],
    ["no name at all", { displayName: "", profile: {} }, null, "NAISI member"],
  ];

  test("accountNameOf, which names every route's session and every page's account", () => {
    for (const [label, account, expected] of ACCOUNTS) assert.equal(accountNameOf(account), expected, label);
  });

  test("fullNameOfUser, which course screens and facilitators read", () => {
    for (const [label, account, , expected] of ACCOUNTS) assert.equal(fullNameOfUser(account), expected, label);
    // Never the full name, and never an address.
    assert.equal(fullNameOfUser({ email: "priya@example.com", profile: { fullName: "Priya Shah" } }), "NAISI member");
    assert.equal(firstNameOfUser(PRIYA), "Pri");
  });
});

// ===========================================================================
// 5. The certificate
// ===========================================================================

describe("a certificate prints what it printed before", () => {
  /**
   * What a certificate printed until the full names change: the body of
   * `fullNameOfUser` as it stood, copied here so the rule's output is held to
   * it and not to itself.
   */
  const before = (data) => {
    const profile = data.profile ?? {};
    const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
    const preferred = typeof profile.preferredName === "string" ? profile.preferredName.trim() : "";
    return display || preferred || "NAISI member";
  };

  test("the account's display name, then the name they go by, then NAISI member, and never the full name they gave", () => {
    const accounts = [
      { displayName: "Priya Shah", profile: { preferredName: "Pri", fullName: "Priya Kaur Shah" } },
      { displayName: "  Priya Shah  ", profile: { preferredName: "Pri" } },
      { displayName: null, profile: { preferredName: "Pri", fullName: "Priya Shah" } },
      { displayName: "", profile: { preferredName: "" } },
      { displayName: 7, profile: { preferredName: "Pri" } },
      { profile: "Pri" },
      {},
      { email: "priya@example.com" },
    ];
    for (const account of accounts) assert.equal(certificateNameOf(account), before(account), JSON.stringify(account));
    assert.equal(certificateNameOf(accounts[0]), "Priya Shah");
    assert.equal(certificateNameOf(accounts[2]), "Pri");
    assert.equal(certificateNameOf(accounts[7]), "NAISI member");
  });
});
