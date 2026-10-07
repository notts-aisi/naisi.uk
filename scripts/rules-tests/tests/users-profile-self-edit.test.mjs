/**
 * Rules tests for the profile page's own save, as the member who presses it.
 *
 * ## What this file holds together
 *
 * The profile page saves client-direct. Beside the preferred name, the
 * university email and the notification maps, its save writes the member's own
 * degree (`profile.subject`) and the month they expect to finish
 * (`profile.expectedGraduation`), each only when the member changed it.
 *
 * A change from one answer to another is NOTED: the same write adds one entry
 * to `studyChanges` on the member's document saying what the answer was, and
 * the users self-update rule refuses the change without it. The admin's page
 * for that person shows the entries. So there are two layers that have to
 * agree, the write the form builds and the rule that judges it, and this file
 * is where they meet:
 *
 *  - THE WRITES THAT MUST SAVE ARE NOT COPIED HERE. They are built by the
 *    form's own function, `studyWrite` in src/features/profile/studyChange.ts,
 *    loaded and run by this file, and sent as it returns them. A copy would
 *    go on passing after the form changed.
 *  - THE WRITES THAT MUST BE REFUSED are written by hand, because no code in
 *    the site builds them: they are what somebody sends from a console.
 *
 * ## Two more things the same rule is held to here
 *
 *  - THE DEGREE AND THE GRADUATION ARE STORED AS TEXT, OR NOT AT ALL. In what
 *    an account writes to its own document, `profile.subject`, the older
 *    `profile.course` and `profile.expectedGraduation` are each text, absent
 *    or null. Anything else is refused, on a create and on an update. A value
 *    that is already stored and that the write leaves exactly as it was is
 *    not the write's, so a document carrying one still saves everything else.
 *  - THE RULE AND THE PAGES READ THE DEGREE ONE WAY. `degreeOf` in the form's
 *    module is what every page that shows a degree calls, and the rule has a
 *    `degreeOf` of its own. `tests/lib/storedDegrees.mjs` is one table of
 *    stored profiles with the degree each holds. This file runs every row
 *    through the function, then through the rule: it stores the row, changes
 *    the degree as a member, and the rule has to accept the change with an
 *    entry holding exactly the row's answer and with no other, or with no
 *    entry at all where the row says there was no answer.
 *
 * It also still holds what it held before the entries existed. The save
 * depends on the rule pinning named FIELDS and keeping `keys().hasOnly()` off
 * `profile` (`users-push-preferences.test.mjs` explains that at length), and
 * the same save may not carry an admin-set field or be aimed at somebody else.
 *
 * THE TEST THAT MATTERS MOST is the plainest one: an account made before any
 * of this, which has no `studyChanges` field at all, saves everything it
 * could save before. A profile that cannot be saved is worse than a missing
 * entry.
 *
 * EVERY CASE BUT THE LAST GROUP RUNS AS A MEMBER. The admin branch of the
 * self-update rule is resource-independent, so testing this as an admin would
 * pass whatever the member-facing half of the rule said. The last group is
 * the control the other way: an admin's edit is not held to the entry.
 *
 * ## Running the form's function from here
 *
 * `tests/lib/tsLoader.mjs` is the unit suite's TypeScript loader, and it uses
 * the root package's `typescript`. This suite is a separate package, so that
 * is a dependency on the root's `node_modules` being installed, which CI's
 * rules job does (`npm ci` in both places) and which any checkout that can
 * run the site already has. The function is given the server-time marker
 * from THIS package's copy of the SDK, since a marker from another copy is
 * not one the client under test recognises.
 *
 * ## Mutation check (each was run against these 60 tests; restore bit-exact afterwards)
 *
 *  1. Delete `&& studyChangesHold()` from the users self-update rule -> 14
 *     go red: all six in "a change that skips or bends the record is
 *     refused", all five in "the record cannot be removed, rewritten or
 *     padded", the cap, the account that was turned down and the record that
 *     is not a map. Every save stays green, which is the point: with the
 *     line gone nothing is refused and nothing is noticed but by these.
 *  2. In `studyEntryIsTrue`, replace `entry.at == request.time` with
 *     `entry.at is timestamp` -> "a time that is not the server's own".
 *  3. In `studyChangeIsNoted`, delete `&& moved.changedKeys().size() == 0`
 *     -> "an earlier entry rewritten"; delete the `removedKeys` line -> "an
 *     earlier entry removed"; make `addedKeys().size() == 1` a `>= 1` -> "two
 *     entries for one change"; make the cap `< 21` -> the cap test.
 *  4. In `studyChangesOf`, replace `data.get('studyChanges', {})` with
 *     `data.studyChanges` -> 10 go red, every one a save on a document with
 *     no map, which is every account made before this rule.
 *  5. In `studyChangesHold`, delete `resource.data.role != 'pending' &&` ->
 *     the registration sent a second time, and the waiting account's entry.
 *  6. In `degreeOf`, return `studyField(data, 'subject')` alone -> the older
 *     account's first degree: the form sends an entry the rule no longer
 *     expects.
 *  7. In `isAnswer`, drop `value is string &&` -> the account whose answers
 *     are not text; return `true` -> 4 go red, each one a first answer.
 *  8. In src/features/profile/studyChange.ts, return before the entry is
 *     added -> 9 go red, every test that sends a change the form built. Put
 *     a client time in the entry in place of the marker -> 8. That is the
 *     form drifting from the rule, caught here because this file sends what
 *     the form builds.
 *  9. Add `&& request.resource.data.profile.keys().hasOnly(['preferredName',
 *     'universityEmail', 'notifications', 'newsletter'])` to the self-update
 *     rule -> 15 go red. Delete `request.resource.data.role ==
 *     resource.data.role` -> the role test.
 * 10. Delete `&& studyAnswersAreTextOrKept()` from the self-update rule -> 5
 *     go red: the degree, the older field and the graduation that are not
 *     text, the stored value swapped for another, and the registration sent
 *     a second time. Every save stays green.
 * 11. Delete `&& newStudyAnswersAreText()` from the create rule -> "a new
 *     account cannot arrive with a degree or a graduation that is not text".
 * 12. In `isTextOrNothing`, drop `value == null ||` -> 3 go red: "text,
 *     empty text and nothing are all still stored", and the two creates that
 *     registration makes with no older field. In `studyAnswerIsTextOrKept`,
 *     drop the half that compares with what is stored -> 6: the two accounts
 *     whose stored answers are not text, and the four rows of the table
 *     whose older field is not text.
 * 13. In the rule's `degreeOf`, test `subject` for being present where it
 *     tests for an answer (`'subject' in data.get('profile', {})`) -> 7: the
 *     six rows of the table whose `subject` is there, holds no answer and
 *     sits beside an older field that does, and the stored value that is not
 *     text. Read `course` first -> 12. In
 *     src/features/profile/studyChange.ts, make `degreeOf` fall back with
 *     `??` -> 10 here, and the table in the unit file; make it read
 *     `subject` alone -> 9.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { STORED_DEGREES } from "../../../tests/lib/storedDegrees.mjs";
import { createLoader } from "../../../tests/lib/tsLoader.mjs";
import {
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
  // Unique per file: a shared project id lets one file's clearFirestore()
  // wipe another's fixtures mid-test (see harness.mjs).
  await getTestEnv("users-profile-self-edit");
});
after(cleanup);
afterEach(clearData);

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FORM = readFileSync(join(REPO_ROOT, "src", "features", "profile", "ProfileForm.tsx"), "utf8");

// The form's own function and the cap it reads, run from source.
const { loadTs } = createLoader();
const { studyWrite, newStudyChangeId, degreeOf } = await loadTs("features/profile/studyChange.ts");
const { FIELD_LIMITS } = await loadTs("lib/firestore/users.ts");

const UNI_EMAIL = "ada@nottingham.ac.uk";

/** The marker the client under test turns into the server's time. */
const serverTime = () => firebase.firestore.FieldValue.serverTimestamp();

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

/** An entry as the server stores one: a real time, and what the field said. */
function entry(when, before) {
  return { at: new Date(when), ...before };
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

/**
 * THE FORM'S SAVE for a document, given what is in its two boxes when the
 * member presses the button. A box nobody touched holds the stored answer,
 * which is how the form fills it.
 *
 * Returns the whole write and the part `studyWrite` built, so a case can
 * check it is the shape it says it is before it trusts the rule's answer.
 */
function formSave(document, typed = {}) {
  const profile = document.profile ?? {};
  const built = studyWrite({
    role: document.role,
    stored: profile,
    subject: typed.subject ?? profile.subject ?? "",
    expectedGraduation:
      typed.expectedGraduation === undefined
        ? (profile.expectedGraduation ?? "")
        : typed.expectedGraduation,
    noted: Object.keys(document.studyChanges ?? {}).length,
    entryId: newStudyChangeId(),
    serverTime: serverTime(),
  });
  assert.equal(built.ok, true, "the form refused to build this save");
  return { write: { ...alwaysSent(), ...built.patch }, study: built.patch };
}

/** The keys of the entries a built save adds. */
const entriesIn = (patch) => Object.keys(patch).filter((key) => key.startsWith("studyChanges."));

/** The document as it is stored, read with the rules off. */
async function storedNow(uid) {
  let data;
  await seed(async (db) => {
    data = (await db.collection("users").doc(uid).get()).data();
  });
  return data;
}

const own = async (uid) => (await asUser(uid)).collection("users").doc(uid);

describe("every save the profile form makes still saves", () => {
  it("an account from before the record existed saves with neither field touched", async () => {
    // The plainest case and the one that must never break: no `studyChanges`
    // field, nothing about the degree or the graduation in the write.
    await seedUser("plain1", stored());
    const { write, study } = formSave(stored());
    assert.deepEqual(study, {}, "a save that changes neither field writes nothing about them");
    await assertSucceeds((await own("plain1")).update(write));
    assert.equal(
      "studyChanges" in (await storedNow("plain1")),
      false,
      "a save that changed nothing created the map",
    );
  });

  it("a change to the degree saves with its entry, in the document's own words", async () => {
    await seedUser("change1", stored());
    const { write, study } = formSave(stored(), { subject: "Mathematics and Computer Science" });
    assert.equal(study["profile.subject"], "Mathematics and Computer Science");
    assert.equal(entriesIn(study).length, 1, "the form adds one entry beside the change");
    await assertSucceeds((await own("change1")).update(write));

    const after = await storedNow("change1");
    assert.equal(after.profile.subject, "Mathematics and Computer Science");
    assert.equal(after.profile.expectedGraduation, "2027-06", "the graduation was not touched");
    const entries = Object.values(after.studyChanges);
    assert.equal(entries.length, 1);
    assert.deepEqual(Object.keys(entries[0]).sort(), ["at", "subject"]);
    assert.equal(entries[0].subject, "Mathematics", "the entry holds what the degree said before");
    const age = Math.abs(Date.now() - entries[0].at.toDate().getTime());
    assert.ok(age < 60_000, `the entry's time is the server's, a moment ago (it is ${age}ms off)`);
  });

  it("a change to the graduation alone saves with an entry that names only the graduation", async () => {
    await seedUser("change2", stored());
    const { write, study } = formSave(stored(), { expectedGraduation: "2027-12" });
    assert.equal(entriesIn(study).length, 1);
    await assertSucceeds((await own("change2")).update(write));
    const [only] = Object.values((await storedNow("change2")).studyChanges);
    assert.deepEqual(Object.keys(only).sort(), ["at", "expectedGraduation"]);
    assert.equal(only.expectedGraduation, "2027-06");
  });

  it("a change to both in one save is one entry holding both", async () => {
    await seedUser("change3", stored());
    const { write, study } = formSave(stored(), {
      subject: "Philosophy",
      expectedGraduation: "2028-06",
    });
    assert.equal(entriesIn(study).length, 1);
    await assertSucceeds((await own("change3")).update(write));
    const entries = Object.values((await storedNow("change3")).studyChanges);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].subject, "Mathematics");
    assert.equal(entries[0].expectedGraduation, "2027-06");
  });

  it("a second change adds a second entry and leaves the first as it was", async () => {
    const first = { ...stored(), studyChanges: { first1: entry("2026-09-25T09:00:00Z", { subject: "Maths" }) } };
    await seedUser("change4", first);
    const { write, study } = formSave(first, { subject: "Physics" });
    assert.equal(entriesIn(study).length, 1);
    await assertSucceeds((await own("change4")).update(write));
    const changes = (await storedNow("change4")).studyChanges;
    assert.equal(Object.keys(changes).length, 2);
    assert.equal(changes.first1.subject, "Maths");
    assert.equal(changes.first1.at.toDate().toISOString(), "2026-09-25T09:00:00.000Z");
  });

  it("a first answer in an empty field saves with no entry", async () => {
    // An older account answered a year of study and has no graduation field,
    // so its first correction ADDS a key to `profile`. Filling an empty field
    // is not a change, and the size cap, which counts keys, has room for it.
    const older = stored();
    delete older.profile.expectedGraduation;
    older.profile.year = "2nd year";
    await seedUser("first1", older);
    const { write, study } = formSave(older, { expectedGraduation: "2028-06" });
    assert.equal(study["profile.expectedGraduation"], "2028-06");
    assert.equal(entriesIn(study).length, 0, "the form adds no entry for a first answer");
    await assertSucceeds((await own("first1")).update(write));
    assert.equal("studyChanges" in (await storedNow("first1")), false);
  });

  it("a first answer beside a real change is noted for the change alone", async () => {
    const older = stored();
    delete older.profile.expectedGraduation;
    await seedUser("first2", older);
    const { write } = formSave(older, { subject: "Philosophy", expectedGraduation: "2028-06" });
    await assertSucceeds((await own("first2")).update(write));
    const [only] = Object.values((await storedNow("first2")).studyChanges);
    assert.deepEqual(Object.keys(only).sort(), ["at", "subject"]);
  });

  it("an older account's first degree is noted with what its older field said", async () => {
    // Before the site asked for a degree under `subject` it kept one under
    // `course`, and the admin's page still reads that when there is no
    // subject. So the first degree typed over it replaces something an admin
    // could read, and is noted like any other change.
    const older = stored();
    delete older.profile.subject;
    older.profile.course = "Maths";
    await seedUser("older1", older);
    const { write, study } = formSave(older, { subject: "Physics" });
    assert.equal(entriesIn(study).length, 1);
    await assertSucceeds((await own("older1")).update(write));
    const [only] = Object.values((await storedNow("older1")).studyChanges);
    assert.equal(only.subject, "Maths");

    // The same words typed again are not a change, and carry no entry.
    await seedUser("older2", older);
    const same = formSave(older, { subject: "Maths" });
    assert.equal(entriesIn(same.study).length, 0);
    await assertSucceeds((await own("older2")).update(same.write));
    // And a save that leaves the degree box empty writes nothing about it.
    await seedUser("older3", older);
    const untouched = formSave(older);
    assert.deepEqual(untouched.study, {});
    await assertSucceeds((await own("older3")).update(untouched.write));
  });

  it("an account whose answers are stored as something that is not text still saves", async () => {
    // A hand edit, or a writer from long ago: nothing where the degree should
    // be, a number for the graduation. Neither is an answer, so the account
    // saves as any other does and the first real answer is a first answer.
    const odd = stored();
    odd.profile.subject = null;
    odd.profile.expectedGraduation = 2027;
    await seedUser("odd2", odd);
    const untouched = formSave(odd);
    assert.deepEqual(untouched.study, {});
    await assertSucceeds((await own("odd2")).update(untouched.write));
    const filled = formSave(odd, { subject: "Physics", expectedGraduation: "2028-06" });
    assert.equal(entriesIn(filled.study).length, 0);
    await assertSucceeds((await own("odd2")).update(filled.write));
  });

  it("a record that is not a map stops a change and nothing else", async () => {
    // Only a hand edit could leave this. Everything else on the profile still
    // saves; a change to the degree waits for an admin to mend the field,
    // since there is nowhere true to put its entry.
    const damaged = { ...stored(), studyChanges: ["not a map"] };
    await seedUser("odd3", damaged);
    const doc = await own("odd3");
    await assertSucceeds(doc.update(alwaysSent()));
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.new1": { at: serverTime(), subject: "Mathematics" },
      }),
    );
  });

  it("a notification switched on the same page saves beside a record that has entries", async () => {
    // The push column's own write: one leaf, nothing else. It must not have
    // to restate the map to pass.
    await seedUser("push1", {
      ...stored(),
      studyChanges: { first1: entry("2026-09-25T09:00:00Z", { subject: "Maths" }) },
    });
    await assertSucceeds(
      (await own("push1")).update({
        "profile.notifications.push": { newsletter: true, events: false, courses: true, tasks: true },
      }),
    );
  });

  it("a registration sent a second time may restate the degree, with no entry", async () => {
    // `completeRegistration` writes the whole document with one unmerged set.
    // Sent again by somebody still waiting to be approved, that is an update
    // which rewrites `profile.subject`. It is their join request, not a
    // member's change, and it cannot carry an entry.
    await seedUser("retry2", {
      role: "pending",
      policyVersion: "v1",
      policyAgreedAt: new Date("2026-10-01T09:00:00Z"),
      profile: { preferredName: "R", subject: "Maths", expectedGraduation: "2027-06" },
    });
    await assertSucceeds(
      (await own("retry2")).set({
        email: "retry2@example.com",
        displayName: "R",
        photoURL: null,
        role: "pending",
        showOnMembers: false,
        profile: { preferredName: "R", subject: "Mathematics", expectedGraduation: "2028-06" },
        policyVersion: "v1",
        policyAgreedAt: serverTime(),
        createdAt: serverTime(),
      }),
    );
    // The form agrees: for an account still waiting it builds no entry.
    const waiting = { role: "pending", profile: { subject: "Maths", expectedGraduation: "2027-06" } };
    assert.equal(entriesIn(formSave(waiting, { subject: "Mathematics" }).study).length, 0);
  });
});

describe("a change that skips or bends the record is refused", () => {
  it("a change with no entry", async () => {
    // What the form sent before the record existed, and what anybody sends
    // who would rather the change were not seen.
    await seedUser("skip1", stored());
    const doc = await own("skip1");
    await assertFails(doc.update({ ...alwaysSent(), "profile.subject": "Philosophy" }));
    await assertFails(doc.update({ ...alwaysSent(), "profile.expectedGraduation": "2027-12" }));
    await assertFails(
      doc.update({
        ...alwaysSent(),
        "profile.subject": "Philosophy",
        "profile.expectedGraduation": "2028-06",
      }),
    );
    // Emptying an answer is a change away from it too, or two saves (empty
    // it, then fill it) would be a way to change it unseen.
    await assertFails(doc.update({ "profile.subject": "" }));
    await assertFails(doc.update({ "profile.expectedGraduation": firebase.firestore.FieldValue.delete() }));
  });

  it("an entry whose before is not what the document says", async () => {
    await seedUser("bend1", stored());
    const doc = await own("bend1");
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.fake1": { at: serverTime(), subject: "Philosophy" },
      }),
    );
    await assertFails(
      doc.update({
        "profile.expectedGraduation": "2028-06",
        "studyChanges.fake2": { at: serverTime(), expectedGraduation: "2028-06" },
      }),
    );
    // Both changed, and one of the two is misremembered.
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "profile.expectedGraduation": "2028-06",
        "studyChanges.fake3": { at: serverTime(), subject: "Mathematics", expectedGraduation: "2026-06" },
      }),
    );
  });

  it("an entry that leaves out a field that changed, or names one that did not", async () => {
    await seedUser("bend2", stored());
    const doc = await own("bend2");
    // Both changed, one named.
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "profile.expectedGraduation": "2028-06",
        "studyChanges.part1": { at: serverTime(), subject: "Mathematics" },
      }),
    );
    // One changed, both named.
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.more1": { at: serverTime(), subject: "Mathematics", expectedGraduation: "2027-06" },
      }),
    );
    // One changed, the other one named.
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.swap1": { at: serverTime(), expectedGraduation: "2027-06" },
      }),
    );
    // The same three the other way about: the graduation is what changed.
    await assertFails(
      doc.update({
        "profile.expectedGraduation": "2028-06",
        "studyChanges.more2": { at: serverTime(), subject: "Mathematics", expectedGraduation: "2027-06" },
      }),
    );
    await assertFails(
      doc.update({
        "profile.expectedGraduation": "2028-06",
        "studyChanges.swap2": { at: serverTime(), subject: "Mathematics" },
      }),
    );
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "profile.expectedGraduation": "2028-06",
        "studyChanges.part2": { at: serverTime(), expectedGraduation: "2027-06" },
      }),
    );
  });

  it("a time that is not the server's own", async () => {
    await seedUser("time1", stored());
    const doc = await own("time1");
    const change = (at) => ({
      "profile.subject": "Philosophy",
      "studyChanges.when1": { at, subject: "Mathematics" },
    });
    // Far from now, in either direction.
    await assertFails(doc.update(change(new Date("2020-01-01T00:00:00Z"))));
    await assertFails(doc.update(change(new Date("2030-01-01T00:00:00Z"))));
    // A few seconds either side of now: close, and still not the server's.
    // (Never this machine's `new Date()` itself. Against a local emulator it
    // lands on the server's own millisecond about once in three hundred
    // writes, and a time that equals the server's is rightly accepted.)
    await assertFails(doc.update(change(new Date(Date.now() - 5_000))));
    await assertFails(doc.update(change(new Date(Date.now() + 5_000))));
    // No time, and a time that is not one.
    await assertFails(
      doc.update({ "profile.subject": "Philosophy", "studyChanges.when1": { subject: "Mathematics" } }),
    );
    await assertFails(doc.update(change("2026-10-07")));
  });

  it("two entries for one change", async () => {
    await seedUser("two1", stored());
    await assertFails(
      (await own("two1")).update({
        "profile.subject": "Philosophy",
        "studyChanges.one1": { at: serverTime(), subject: "Mathematics" },
        "studyChanges.two2": { at: serverTime(), subject: "Mathematics" },
      }),
    );
  });

  it("an entry that carries anything else, or is not an entry, or has a key that is not letters and digits", async () => {
    await seedUser("odd1", stored());
    const doc = await own("odd1");
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.extra1": { at: serverTime(), subject: "Mathematics", note: "by request" },
      }),
    );
    await assertFails(
      doc.update({ "profile.subject": "Philosophy", "studyChanges.text1": "Mathematics" }),
    );
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.not-a-key!": { at: serverTime(), subject: "Mathematics" },
      }),
    );
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        [`studyChanges.${"k".repeat(41)}`]: { at: serverTime(), subject: "Mathematics" },
      }),
    );
  });
});

describe("the record cannot be removed, rewritten or padded", () => {
  /** A member with two changes behind them. */
  function withHistory() {
    return {
      ...stored(),
      studyChanges: {
        first1: entry("2026-09-25T09:00:00Z", { subject: "Maths" }),
        second2: entry("2026-10-01T15:30:00Z", { expectedGraduation: "2026-06" }),
      },
    };
  }

  it("an earlier entry removed", async () => {
    await seedUser("keep1", withHistory());
    const doc = await own("keep1");
    const gone = firebase.firestore.FieldValue.delete();
    // One entry, by itself and beside a save about something else.
    await assertFails(doc.update({ "studyChanges.first1": gone }));
    await assertFails(doc.update({ ...alwaysSent(), "studyChanges.first1": gone }));
    // Beside a true new entry, so the count comes out where it started.
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.first1": gone,
        "studyChanges.new1": { at: serverTime(), subject: "Mathematics" },
      }),
    );
    // The whole map, and the map replaced by something that is not one.
    await assertFails(doc.update({ studyChanges: gone }));
    await assertFails(doc.update({ studyChanges: {} }));
    await assertFails(doc.update({ studyChanges: [] }));
    assert.equal(Object.keys((await storedNow("keep1")).studyChanges).length, 2);
  });

  it("an earlier entry rewritten", async () => {
    await seedUser("keep2", withHistory());
    const doc = await own("keep2");
    await assertFails(doc.update({ "studyChanges.first1.subject": "Mathematics" }));
    // Beside a true new entry.
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.first1.subject": "Physics",
        "studyChanges.new1": { at: serverTime(), subject: "Mathematics" },
      }),
    );
    // Its time moved, to the server's own or to any other.
    await assertFails(doc.update({ "studyChanges.first1.at": serverTime() }));
    await assertFails(doc.update({ "studyChanges.first1.at": new Date("2020-01-01T00:00:00Z") }));
    // Rewritten whole, under its own key, as if it were the new one.
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.first1": { at: serverTime(), subject: "Mathematics" },
      }),
    );
  });

  it("an entry added when nothing changed", async () => {
    await seedUser("pad1", stored());
    const doc = await own("pad1");
    await assertFails(
      doc.update({ "studyChanges.pad1": { at: serverTime(), subject: "Mathematics" } }),
    );
    await assertFails(
      doc.update({ ...alwaysSent(), "studyChanges.pad1": { at: serverTime(), subject: "Mathematics" } }),
    );
    // A first answer is not a change either, so it may not bring one.
    const older = stored();
    delete older.profile.expectedGraduation;
    await seedUser("pad2", older);
    await assertFails(
      (await own("pad2")).update({
        "profile.expectedGraduation": "2028-06",
        "studyChanges.pad2": { at: serverTime(), expectedGraduation: "2027-06" },
      }),
    );
    // And the degree restated as it already is.
    await assertFails(
      doc.update({
        "profile.subject": "Mathematics",
        "studyChanges.pad3": { at: serverTime(), subject: "Mathematics" },
      }),
    );
  });

  it("the whole document set again without it", async () => {
    // An unmerged set replaces the document. From an approved member it must
    // not be a way to drop the map.
    const member = { ...withHistory(), email: "keep3@example.com" };
    await seedUser("keep3", member);
    await assertFails(
      (await own("keep3")).set({
        uid: "keep3",
        email: "keep3@example.com",
        displayName: "keep3",
        role: "member",
        createdAt: new Date(),
        profile: stored().profile,
      }),
    );
  });

  it("a new account cannot arrive with a record already written", async () => {
    // The first write of a document is judged by the create rule, which is
    // where the record would otherwise be made up whole.
    const fresh = () => ({
      email: "new1@example.com",
      displayName: "N",
      photoURL: null,
      role: "pending",
      showOnMembers: false,
      profile: { preferredName: "N", subject: "Mathematics" },
      policyVersion: "v1",
      policyAgreedAt: serverTime(),
      createdAt: serverTime(),
    });
    const doc = await own("new1");
    await assertFails(
      doc.set({
        ...fresh(),
        studyChanges: { made1: { at: new Date("2020-01-01T00:00:00Z"), subject: "Medicine" } },
      }),
    );
    await assertFails(doc.set({ ...fresh(), studyChanges: {} }));
    // The same create without it is the registration form's own, and saves.
    await assertSucceeds(doc.set(fresh()));
  });

  it("an account waiting to be approved cannot add an entry at all", async () => {
    // It is not held to the entry, and so has no write that may bring one.
    await seedUser("wait1", { ...stored(), role: "pending" });
    const doc = await own("wait1");
    await assertFails(
      doc.update({
        "profile.subject": "Philosophy",
        "studyChanges.wait1": { at: serverTime(), subject: "Mathematics" },
      }),
    );
    await assertFails(
      doc.update({ "studyChanges.wait1": { at: new Date("2020-01-01T00:00:00Z"), subject: "Medicine" } }),
    );
  });
});

describe("the cap, and who is held", () => {
  /** A document holding as many entries as it may. */
  function full() {
    const studyChanges = {};
    for (let i = 0; i < FIELD_LIMITS.maxStudyChanges; i += 1) {
      studyChanges[`kept${i}`] = entry(`2026-09-${String(i + 1).padStart(2, "0")}T09:00:00Z`, {
        subject: `Degree ${i}`,
      });
    }
    return { ...stored(), studyChanges };
  }

  it("holds one more change than the cap out, and lets everything else save", async () => {
    assert.equal(FIELD_LIMITS.maxStudyChanges, 20, "the rule's number, restated where it is tested");
    await seedUser("full1", full());
    const doc = await own("full1");
    // A true entry, built by hand because the form refuses to build one here.
    await assertFails(
      doc.update({
        ...alwaysSent(),
        "profile.subject": "Philosophy",
        "studyChanges.over1": { at: serverTime(), subject: "Mathematics" },
      }),
    );
    await assertFails(doc.update({ ...alwaysSent(), "profile.subject": "Philosophy" }));
    // The form says so before it tries.
    const refused = studyWrite({
      role: "member",
      stored: full().profile,
      subject: "Philosophy",
      expectedGraduation: "2027-06",
      noted: FIELD_LIMITS.maxStudyChanges,
      entryId: newStudyChangeId(),
      serverTime: serverTime(),
    });
    assert.deepEqual(refused, { ok: false, reason: "full" });
    // A save about anything else is untouched by the cap.
    const { write, study } = formSave(full());
    assert.deepEqual(study, {});
    await assertSucceeds(doc.update(write));
  });

  it("the last entry under the cap still saves", async () => {
    const nearly = full();
    delete nearly.studyChanges.kept0;
    await seedUser("full2", nearly);
    const { write, study } = formSave(nearly, { subject: "Philosophy" });
    assert.equal(entriesIn(study).length, 1);
    await assertSucceeds((await own("full2")).update(write));
    assert.equal(
      Object.keys((await storedNow("full2")).studyChanges).length,
      FIELD_LIMITS.maxStudyChanges,
    );
  });

  it("holds an account that was turned down as it holds a member", async () => {
    await seedUser("down1", { ...stored(), role: "rejected" });
    await assertFails((await own("down1")).update({ "profile.subject": "Philosophy" }));
  });

  it("cannot carry a role change, or any other admin-set field, along with a true entry", async () => {
    await seedUser("edit4", { ...stored(), email: "edit4@example.com", policyVersion: "v5" });
    const doc = await own("edit4");
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
      const { write } = formSave(stored(), { subject: "Philosophy" });
      await assertFails(doc.update({ ...write, [field]: value }));
    }
    // The same save with nothing carried, so the refusals above are about
    // the field and not about the entry.
    await assertSucceeds(doc.update(formSave(stored(), { subject: "Philosophy" }).write));
  });

  it("cannot be aimed at somebody else's document, entry or no entry", async () => {
    await seedUser("edit5", stored());
    await seedUser("other", stored());
    const theirs = (await asUser("edit5")).collection("users").doc("other");
    await assertFails(
      theirs.update({ "profile.subject": "Philosophy", "profile.expectedGraduation": "2028-06" }),
    );
    await assertFails(theirs.update(formSave(stored(), { subject: "Philosophy" }).write));
    await assertFails(
      theirs.update({ "studyChanges.theirs1": { at: serverTime(), subject: "Mathematics" } }),
    );
    assert.equal("studyChanges" in (await storedNow("other")), false);
  });
});

describe("the degree and the graduation are stored as text, or not at all", () => {
  /** A list, a number, a yes or no and a map: what a console can send and no form does. */
  const NOT_TEXT = [["Medicine"], 7, true, { name: "Medicine" }];

  it("a degree that is not text is refused, beside an older field left as it was", async () => {
    // The older field holds the same words as the newer one. Read through
    // either field the degree looks unchanged, so no entry is owed, and the
    // field's own type is all that is judged.
    const both = stored();
    both.profile.course = "Mathematics";
    await seedUser("text1", both);
    const doc = await own("text1");
    for (const value of NOT_TEXT) {
      await assertFails(doc.update({ "profile.subject": value }));
      await assertFails(doc.update({ ...alwaysSent(), "profile.subject": value }));
    }
    // The same on an account with no older field, which the save writes too.
    await seedUser("text2", stored());
    const plain = await own("text2");
    for (const value of NOT_TEXT) {
      await assertFails(plain.update({ "profile.subject": value, "profile.course": "Mathematics" }));
      // And beside an entry that says truly what the degree was, so that the
      // entry is not what the write is refused for.
      await assertFails(
        plain.update({
          "profile.subject": value,
          "studyChanges.true1": { at: serverTime(), subject: "Mathematics" },
        }),
      );
    }
    for (const uid of ["text1", "text2"]) {
      const after = await storedNow(uid);
      assert.equal(after.profile.subject, "Mathematics", uid);
      assert.equal("studyChanges" in after, false, uid);
    }
  });

  it("an older field that is not text is refused", async () => {
    // The newer field holds the degree, so nothing about the degree moves
    // and no entry is owed.
    await seedUser("text3", stored());
    const doc = await own("text3");
    for (const value of NOT_TEXT) {
      await assertFails(doc.update({ "profile.course": value }));
      await assertFails(doc.update({ ...alwaysSent(), "profile.course": value }));
    }
    assert.equal("course" in (await storedNow("text3")).profile, false);
  });

  it("a graduation that is not text is refused", async () => {
    // On an account with no graduation yet, where a first answer owes no entry.
    const none = stored();
    delete none.profile.expectedGraduation;
    await seedUser("text4", none);
    const first = await own("text4");
    for (const value of [2028, ["2028-06"], true, { month: "2028-06" }, new Date("2028-06-01T00:00:00Z")]) {
      await assertFails(first.update({ "profile.expectedGraduation": value }));
      await assertFails(first.update({ ...alwaysSent(), "profile.expectedGraduation": value }));
    }
    assert.equal("expectedGraduation" in (await storedNow("text4")).profile, false);
    // And in place of an answer, beside the entry such a change owes.
    await seedUser("text5", stored());
    const changed = await own("text5");
    for (const value of [2028, ["2028-06"]]) {
      await assertFails(
        changed.update({
          "profile.expectedGraduation": value,
          "studyChanges.true1": { at: serverTime(), expectedGraduation: "2027-06" },
        }),
      );
    }
    assert.equal((await storedNow("text5")).profile.expectedGraduation, "2027-06");
  });

  it("text, empty text and nothing are all still stored", async () => {
    // What a form sends, and the two ways of holding nothing. Each is tried
    // on a field whose change owes no entry: the older field of an account
    // whose newer field holds the degree, and the graduation of an account
    // that has given none.
    const both = stored();
    both.profile.course = "Maths";
    delete both.profile.expectedGraduation;
    await seedUser("text6", both);
    const doc = await own("text6");
    const gone = firebase.firestore.FieldValue.delete();
    for (const field of ["profile.course", "profile.expectedGraduation"]) {
      await assertSucceeds(doc.update({ [field]: "" }));
      await assertSucceeds(doc.update({ [field]: null }));
      await assertSucceeds(doc.update({ [field]: gone }));
    }
    await assertSucceeds(doc.update({ "profile.course": "Mathematics (BSc)" }));
    await assertSucceeds(doc.update({ "profile.expectedGraduation": "2028-06" }));
    const after = await storedNow("text6");
    assert.deepEqual(
      [after.profile.subject, after.profile.course, after.profile.expectedGraduation],
      ["Mathematics", "Mathematics (BSc)", "2028-06"],
    );
    assert.equal("studyChanges" in after, false, "none of those was a change away from an answer");
  });

  it("a stored value that is not text is left where it is, and cannot be swapped for another", async () => {
    // Only a hand edit could leave one. The account still saves everything
    // else, and its degree is the older field's, to this rule and to every
    // page.
    const odd = stored();
    odd.profile.subject = ["Medicine"];
    odd.profile.course = "Maths";
    odd.profile.expectedGraduation = 2027;
    await seedUser("kept1", odd);
    const doc = await own("kept1");
    await assertSucceeds(doc.update(alwaysSent()));
    await assertSucceeds(
      doc.update({
        "profile.notifications.push": { newsletter: true, events: false, courses: true, tasks: true },
      }),
    );
    // Another value that is not text is a new value.
    await assertFails(doc.update({ "profile.subject": ["Law"] }));
    await assertFails(doc.update({ "profile.subject": 7 }));
    await assertFails(doc.update({ "profile.expectedGraduation": 2028 }));
    await assertFails(doc.update({ "profile.course": ["Maths"] }));
    assert.deepEqual((await storedNow("kept1")).profile.subject, ["Medicine"]);
    // Text takes its place, as the form sends it. The degree was the older
    // field's, so the change is noted with what that said.
    const { write, study } = formSave(odd, { subject: "Physics", expectedGraduation: "2028-06" });
    assert.equal(entriesIn(study).length, 1);
    await assertSucceeds(doc.update(write));
    const after = await storedNow("kept1");
    assert.deepEqual([after.profile.subject, after.profile.expectedGraduation], ["Physics", "2028-06"]);
    assert.deepEqual(
      Object.values(after.studyChanges).map((change) => Object.keys(change).sort().join(",") + ":" + change.subject),
      ["at,subject:Maths"],
    );
  });

  /** A whole document as registration writes one, for the account `uid`. */
  const registration = (uid, profile) => ({
    email: `${uid}@example.com`,
    displayName: "N",
    photoURL: null,
    role: "pending",
    showOnMembers: false,
    profile: { preferredName: "N", ...profile },
    policyVersion: "v1",
    policyAgreedAt: serverTime(),
    createdAt: serverTime(),
  });

  it("a new account cannot arrive with a degree or a graduation that is not text", async () => {
    const doc = await own("new2");
    await assertFails(doc.set(registration("new2", { subject: ["Medicine"], course: "Mathematics" })));
    await assertFails(doc.set(registration("new2", { subject: { name: "Medicine" } })));
    await assertFails(doc.set(registration("new2", { subject: "Mathematics", course: 7 })));
    await assertFails(doc.set(registration("new2", { subject: "Mathematics", expectedGraduation: 2027 })));
    assert.equal(await storedNow("new2"), undefined, "one of those creates went through");
    // What registration sends: a degree as text, and a graduation as text or
    // left out.
    await assertSucceeds(doc.set(registration("new2", { subject: "Mathematics", expectedGraduation: "2027-06" })));
    await assertSucceeds((await own("new3")).set(registration("new3", { subject: "Machine learning" })));
  });

  it("a registration sent a second time is held to text too", async () => {
    // An account still waiting to be approved is not held to the entry. It
    // is held to this: what it stores is what an admin reads on its request.
    await seedUser("retry3", {
      role: "pending",
      policyVersion: "v1",
      policyAgreedAt: new Date("2026-10-01T09:00:00Z"),
      profile: { preferredName: "N", subject: "Maths", expectedGraduation: "2027-06" },
    });
    const doc = await own("retry3");
    await assertFails(
      doc.set(registration("retry3", { subject: ["Medicine"], course: "Maths", expectedGraduation: "2027-06" })),
    );
    await assertFails(doc.set(registration("retry3", { subject: "Mathematics", expectedGraduation: 2028 })));
    await assertSucceeds(doc.set(registration("retry3", { subject: "Mathematics", expectedGraduation: "2028-06" })));
  });
});

describe("what a degree is, to the rule and to every page", () => {
  for (const [index, row] of STORED_DEGREES.entries()) {
    const reads = row.degree === "" ? "no degree" : JSON.stringify(row.degree);
    it(`${JSON.stringify(row.stored)} holds ${reads}: ${row.why}`, async () => {
      const uid = `degree${index}`;
      const document = stored();
      delete document.profile.subject;
      Object.assign(document.profile, row.stored);
      await seedUser(uid, document);
      const doc = await own(uid);

      // The function every page calls.
      assert.equal(degreeOf(document.profile), row.degree);

      // The rule. The member types a degree that is certainly another one.
      const typed = "Something Else Entirely";
      const bare = { ...alwaysSent(), "profile.subject": typed };
      const noting = (was) => ({ ...bare, "studyChanges.note1": { at: serverTime(), subject: was } });
      const { write, study } = formSave(document, { subject: typed });
      assert.equal(study["profile.subject"], typed);

      if (row.degree === "") {
        // No answer was there, so nothing changed. An entry is refused,
        // whatever it says, and the first answer saves without one.
        await assertFails(doc.update(noting("Mathematics")));
        await assertFails(doc.update(noting("")));
        assert.equal(entriesIn(study).length, 0, "the form adds no entry for a first answer");
        await assertSucceeds(doc.update(write));
        assert.equal("studyChanges" in (await storedNow(uid)), false);
      } else {
        // An answer was there. The change is refused with no entry, and with
        // an entry that says anything but that answer.
        await assertFails(doc.update(bare));
        await assertFails(doc.update(noting(`${row.degree} (not)`)));
        // The form's own save carries what the function read, and saves.
        const [key] = entriesIn(study);
        assert.equal(study[key]?.subject, row.degree, "the form's entry holds what the function read");
        await assertSucceeds(doc.update(write));
        const [only] = Object.values((await storedNow(uid)).studyChanges);
        assert.equal(only.subject, row.degree);
      }
    });
  }
});

describe("an admin's edit is not the member's change", () => {
  it("corrects somebody's degree and graduation with no entry, and leaves their record alone", async () => {
    // The admin's page for one person saves every profile field it shows, by
    // dotted path, as an admin. It is not held to the entry.
    await seedUser("admin1", { role: "admin" });
    await seedUser("subject1", {
      ...stored(),
      studyChanges: { first1: entry("2026-09-25T09:00:00Z", { subject: "Maths" }) },
    });
    const db = await asUser("admin1");
    await assertSucceeds(
      db.collection("users").doc("subject1").update({
        "profile.preferredName": "Ada",
        "profile.universityEmail": UNI_EMAIL,
        "profile.status": "masters",
        "profile.statusOther": "",
        "profile.subject": "Statistics",
        "profile.expectedGraduation": "2028-09",
        "profile.motivation": "To learn.",
        "profile.interests": "",
      }),
    );
    const after = await storedNow("subject1");
    assert.equal(after.profile.subject, "Statistics");
    assert.deepEqual(Object.keys(after.studyChanges), ["first1"]);
  });
});

describe("the form still sends what these cases stand for", () => {
  it("builds the two fields and the entry in one place, and sends them in the member's own save", () => {
    // Checked against the source so the cases above cannot outlive the write
    // they describe. The form hands its two boxes to `studyWrite`, with the
    // SDK's server-time marker, and spreads what comes back into the one
    // update it makes.
    for (const literal of [
      "const study = studyWrite({",
      "serverTime: serverTimestamp(),",
      "...study.patch,",
      'await updateDoc(doc(db, "users", user.uid), patch)',
    ]) {
      assert.ok(
        FORM.includes(literal),
        `src/features/profile/ProfileForm.tsx no longer contains \`${literal}\`. The cases in this ` +
          "file send what `studyWrite` builds because the form does. Read the form's save again " +
          "and change the cases to send what it sends now.",
      );
    }
    // Nothing in the form writes either field by itself, so there is no
    // second writer for these cases to miss. (A path is a string, so these
    // look for the string's opening and not for the bare words.)
    for (const path of [
      '"profile.subject"',
      '"profile.expectedGraduation"',
      '"studyChanges',
      "`studyChanges",
    ]) {
      assert.ok(
        !FORM.includes(path),
        `src/features/profile/ProfileForm.tsx writes ${path} itself. Every write of the degree, ` +
          "the graduation and the entry belongs in src/features/profile/studyChange.ts, where " +
          "this file can run it.",
      );
    }
  });
});
