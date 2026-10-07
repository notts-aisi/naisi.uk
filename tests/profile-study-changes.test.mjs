/**
 * A member's own change to their degree or graduation is noted, and the note
 * is read in one place.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * A member can correct `profile.subject` and `profile.expectedGraduation` on
 * their own profile. When they change either from one answer to another, the
 * same write adds an entry to `studyChanges` on their document saying what
 * the answer was, and the admin's page for that person shows the entries.
 * `firestore.rules` refuses the change without the entry.
 *
 * So there are several pieces, and each can drift from the others by itself:
 *
 *  1. THE WRITE the form builds (`src/features/profile/studyChange.ts`). Held
 *     here as a table: for each thing a member can do on the page, exactly
 *     what is written. The rules suite
 *     (`scripts/rules-tests/tests/users-profile-self-edit.test.mjs`) runs the
 *     same function and sends what it returns, which is what proves the rule
 *     accepts it; this file is what says the table has not moved.
 *  2. THE TWO THINGS THE RULE AND THE FORM SHARE: the cap, and the pattern
 *     an entry's key is held to. Read out of `firestore.rules` and compared.
 *  3. THE SHAPE (`normalizeUser`), including a document from before any of
 *     this, which has no such field, and THE WORDS the admin's page makes of
 *     it, for one change and for several.
 *  4. WHO READS IT. Every file under `src` that names the field is listed
 *     below with what it does with it, both ways, and the one component that
 *     draws it is held to the admin-only tree.
 *  5. WHAT THE MEMBER IS TOLD when a save is refused, at the cap or by the
 *     rule: a sentence they can act on, never the database's own.
 *  6. WHAT A DEGREE IS. The rule decides whether a save changed somebody's
 *     degree by reading two fields one way: the newer `subject` where it is
 *     text with something in it, otherwise the older `course`. A page that
 *     read them another way could show a degree the rule never saw change.
 *     So one function, `degreeOf` in the form's module, is the only reading
 *     in `src`. Held here four ways: the function against one table of
 *     stored profiles (`tests/lib/storedDegrees.mjs`, which the rules suite
 *     runs through the rule itself); the rule's own lines; every file that
 *     reads a property called `course`, listed with what it is a property
 *     of; and every file that calls the function or reads `subject` straight
 *     off a profile, listed with what it does. Each list is checked both
 *     ways.
 *
 * ## Mutation check (each was run against these 52 tests; restore bit-exact afterwards)
 *
 *  1. In `studyWrite`, return before the entry is added -> 11 go red, every
 *     row of the table that ends in an entry. Drop `input.role !==
 *     "pending" &&` -> the waiting account. Make the cap test `>` -> the cap.
 *     Drop `graduationBefore !== "" &&` -> 3, the first answers.
 *  2. In `studyWrite`, compare the degree untrimmed (`subject !==
 *     storedSubject`) -> "spaces at either end are not a change".
 *  3. In `degreeOf`, drop `|| answer(profile?.course)` -> the older account's
 *     first degree, and the table.
 *  4. In `firestore.rules`, change `before.size() < 20` to `< 21` -> "the cap
 *     is one number"; change the key pattern's `{1,40}` to `{1,41}` -> "a key
 *     is held to one pattern".
 *  5. In `normalizeUser`, read no changes at all -> 3 of the shape tests;
 *     sort oldest first -> 2; keep an unreadable part -> 1; hand back an empty
 *     list for a document with none -> 2.
 *  6. In `studyChangeWords`, use the several-changes sentence for one change
 *     -> 3 go red; format the day in the process's zone -> "the day is
 *     London's".
 *  7. Read `member.studyChanges` in `src/features/admin/useMembers.ts` ->
 *     "every file that names the field is written down" goes red, naming the
 *     file. Import `StudyChangeNotes` into a profile component -> "one
 *     component draws it".
 *  8. In the form, drop the cap's early return, or show the error as the
 *     database worded it -> the two tests under "a refused save".
 *  9. In `degreeOf`, fall back with `??` in place of `||` -> the table, and
 *     "every answer is text". In `studyWrite`, read the degree before by hand
 *     (`answer(stored.subject) || answer(stored.course)`) -> "the older field
 *     of a profile is read in one function".
 * 10. In src/features/admin/MemberItem.tsx, read `user.profile?.subject ??
 *     user.profile?.course` by hand -> three go red, each naming the file:
 *     the list of `course` readers, the list of files that call the function
 *     and the list of files that read `subject` off a profile. Seed the
 *     admin's box from `user.profile?.subject` in MemberEditForm.tsx -> "the
 *     admin's box is filled from it both times".
 * 11. In `firestore.rules`, make the rule's `degreeOf` read `course` first,
 *     or delete either of the two clauses that hold the fields to text ->
 *     "the rule reads it the same way" and "the rule holds the three fields
 *     to text".
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { STORED_DEGREES } from "./lib/storedDegrees.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

// The words are London's, and this proves it by running somewhere else.
process.env.TZ = "America/Los_Angeles";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const posix = (file) => relative(REPO_ROOT, file).split("\\").join("/");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");

const { loadTs } = createLoader();
const { studyWrite, degreeOf, newStudyChangeId, STUDY_CHANGE_ID, STUDY_CHANGES_FULL } = await loadTs(
  "features/profile/studyChange.ts",
);
const { FIELD_LIMITS, normalizeUser } = await loadTs("lib/firestore/users.ts");
const { studyChangeWords, graduationWords } = await loadTs("features/admin/studyChangeWords.ts");

// ---------------------------------------------------------------------------
// 1. The write
// ---------------------------------------------------------------------------

/** Stands for the SDK's server-time marker. The function must pass it through untouched. */
const SERVER_TIME = { marker: "the server's time" };

/**
 * A member with both answers, and both boxes as the form fills them. Pass
 * `stored` to stand for another document: `undefined` there means a document
 * with no profile, which is not the same as leaving it out.
 */
function save(overrides = {}) {
  const { stored: storedOverride, ...rest } = overrides;
  const stored =
    "stored" in overrides
      ? storedOverride
      : { subject: "Mathematics", expectedGraduation: "2027-06" };
  return studyWrite({
    role: "member",
    stored,
    subject: stored?.subject ?? "",
    expectedGraduation: stored?.expectedGraduation ?? "",
    noted: 0,
    entryId: "entry1",
    serverTime: SERVER_TIME,
    ...rest,
  });
}

const written = (patch) => ({ ok: true, patch, noted: Object.keys(patch).some((k) => k.startsWith("studyChanges.")) });

describe("what the profile's save writes about the degree and the graduation", () => {
  test("nothing, when neither was changed", () => {
    assert.deepEqual(save(), written({}));
  });

  test("a changed degree, and one entry holding what it said", () => {
    assert.deepEqual(
      save({ subject: "Physics" }),
      written({
        "profile.subject": "Physics",
        "studyChanges.entry1": { at: SERVER_TIME, subject: "Mathematics" },
      }),
    );
  });

  test("a changed graduation, and one entry holding what it said", () => {
    assert.deepEqual(
      save({ expectedGraduation: "2027-12" }),
      written({
        "profile.expectedGraduation": "2027-12",
        "studyChanges.entry1": { at: SERVER_TIME, expectedGraduation: "2027-06" },
      }),
    );
  });

  test("both changed in one save is one entry holding both", () => {
    assert.deepEqual(
      save({ subject: "Physics", expectedGraduation: "2028-06" }),
      written({
        "profile.subject": "Physics",
        "profile.expectedGraduation": "2028-06",
        "studyChanges.entry1": {
          at: SERVER_TIME,
          subject: "Mathematics",
          expectedGraduation: "2027-06",
        },
      }),
    );
  });

  test("a first answer in an empty field is written with no entry", () => {
    assert.deepEqual(
      save({ stored: { subject: "Mathematics" }, expectedGraduation: "2028-06" }),
      written({ "profile.expectedGraduation": "2028-06" }),
    );
    assert.deepEqual(
      save({ stored: { expectedGraduation: "2027-06" }, subject: "Physics" }),
      written({ "profile.subject": "Physics" }),
    );
    // No profile at all, and a profile whose fields are not text.
    for (const stored of [null, undefined, {}, { subject: "", expectedGraduation: "" }, { subject: null, expectedGraduation: 2027 }]) {
      assert.deepEqual(
        save({ stored, subject: "Physics", expectedGraduation: "2028-06" }),
        written({ "profile.subject": "Physics", "profile.expectedGraduation": "2028-06" }),
        `stored as ${JSON.stringify(stored)}`,
      );
    }
  });

  test("a first answer beside a real change is noted for the change alone", () => {
    assert.deepEqual(
      save({ stored: { subject: "Mathematics" }, subject: "Physics", expectedGraduation: "2028-06" }),
      written({
        "profile.subject": "Physics",
        "profile.expectedGraduation": "2028-06",
        "studyChanges.entry1": { at: SERVER_TIME, subject: "Mathematics" },
      }),
    );
  });

  test("spaces at either end are not a change", () => {
    // A phone's keyboard leaves a space after a word, and registration keeps
    // it. Saving the profile for some other reason must not read as the
    // member changing their degree.
    assert.deepEqual(save({ stored: { subject: "Mathematics " }, subject: "Mathematics " }), written({}));
    assert.deepEqual(save({ stored: { subject: "Mathematics " }, subject: "Mathematics" }), written({}));
    assert.deepEqual(save({ subject: "  Mathematics  " }), written({}));
  });

  test("an entry holds the stored answer byte for byte, and the typed one trimmed", () => {
    // The rule compares the entry with the document, so it is the document's
    // own text that goes in, spaces and all.
    assert.deepEqual(
      save({ stored: { subject: "Mathematics " }, subject: "  Physics " }),
      written({
        "profile.subject": "Physics",
        "studyChanges.entry1": { at: SERVER_TIME, subject: "Mathematics " },
      }),
    );
  });

  test("an account that is not asked for a graduation never writes one", () => {
    assert.deepEqual(save({ expectedGraduation: null }), written({}));
    assert.deepEqual(
      save({ expectedGraduation: null, subject: "Robotics" }),
      written({
        "profile.subject": "Robotics",
        "studyChanges.entry1": { at: SERVER_TIME, subject: "Mathematics" },
      }),
    );
  });

  test("an older account's first degree is noted with what its older field said", () => {
    const older = { course: "Maths", expectedGraduation: "2027-06" };
    assert.deepEqual(
      save({ stored: older, subject: "Physics" }),
      written({
        "profile.subject": "Physics",
        "studyChanges.entry1": { at: SERVER_TIME, subject: "Maths" },
      }),
    );
    // The same words typed again fill the newer field and change nothing an
    // admin could read.
    assert.deepEqual(save({ stored: older, subject: "Maths" }), written({ "profile.subject": "Maths" }));
    // The box left empty writes nothing.
    assert.deepEqual(save({ stored: older, subject: "" }), written({}));
    // Once there is a subject, the older field is not read.
    assert.deepEqual(
      save({ stored: { ...older, subject: "Mathematics" }, subject: "Physics" }),
      written({
        "profile.subject": "Physics",
        "studyChanges.entry1": { at: SERVER_TIME, subject: "Mathematics" },
      }),
    );
  });

  test("emptying an answer is a change away from it", () => {
    // The form refuses to empty either field before it calls this. If that
    // check ever went, the write would still carry its entry, which is what
    // the rule asks of it.
    assert.deepEqual(
      save({ subject: "" }),
      written({
        "profile.subject": "",
        "studyChanges.entry1": { at: SERVER_TIME, subject: "Mathematics" },
      }),
    );
    assert.deepEqual(
      save({ expectedGraduation: "" }),
      written({
        "profile.expectedGraduation": "",
        "studyChanges.entry1": { at: SERVER_TIME, expectedGraduation: "2027-06" },
      }),
    );
  });

  test("an account still waiting to be approved writes its fields and no entry", () => {
    assert.deepEqual(
      save({ role: "pending", subject: "Physics", expectedGraduation: "2028-06" }),
      written({ "profile.subject": "Physics", "profile.expectedGraduation": "2028-06" }),
    );
    // Every other role is noted, an account that was turned down included.
    for (const role of ["member", "committee", "admin", "rejected", ""]) {
      assert.equal(save({ role, subject: "Physics" }).noted, true, role);
    }
  });

  test("at the cap a change is refused, and everything that needs no entry still saves", () => {
    const full = FIELD_LIMITS.maxStudyChanges;
    assert.deepEqual(save({ noted: full, subject: "Physics" }), { ok: false, reason: "full" });
    assert.deepEqual(save({ noted: full + 3, expectedGraduation: "2028-06" }), { ok: false, reason: "full" });
    assert.equal(save({ noted: full - 1, subject: "Physics" }).ok, true);
    assert.deepEqual(save({ noted: full }), written({}));
    assert.deepEqual(
      save({ noted: full, stored: { subject: "Mathematics" }, expectedGraduation: "2028-06" }),
      written({ "profile.expectedGraduation": "2028-06" }),
    );
  });

  test("the entry carries the marker it was handed and nothing else of the caller's", () => {
    const result = save({ subject: "Physics", entryId: "Zx9" });
    assert.equal(result.patch["studyChanges.Zx9"].at, SERVER_TIME, "the very object, not a copy");
    assert.deepEqual(Object.keys(result.patch["studyChanges.Zx9"]).sort(), ["at", "subject"]);
  });

  test("a key that is not letters and digits is refused before anything is built", () => {
    for (const entryId of ["", "with.dot", "with space", "bad-key!", "k".repeat(41)]) {
      assert.throws(() => save({ subject: "Physics", entryId }), /letters and digits/, entryId);
    }
  });
});

describe("the key the browser makes up", () => {
  test("is twenty letters and digits, and not the same twice", () => {
    const ids = new Set();
    for (let i = 0; i < 200; i += 1) {
      const id = newStudyChangeId();
      assert.match(id, /^[A-Za-z0-9]{20}$/);
      assert.match(id, STUDY_CHANGE_ID);
      ids.add(id);
    }
    assert.equal(ids.size, 200);
  });
});

// ---------------------------------------------------------------------------
// 2. What the rule and the form share
// ---------------------------------------------------------------------------

describe("the rule and the form agree on the cap and on a key", () => {
  const rules = read("firestore.rules");
  // The users block alone, so a number in some other rule cannot satisfy this.
  const start = rules.indexOf("match /users/{uid} {");
  const end = rules.indexOf("// === collaborators ===");
  const users = rules.slice(start, end);

  test("the users block was found, and holds the record's helpers", () => {
    assert.ok(start !== -1 && end > start, "the users block has moved in firestore.rules");
    for (const helper of ["function studyChangeIsNoted()", "function studyChangesHold()", "&& studyChangesHold()))"]) {
      assert.ok(users.includes(helper), `the users block no longer carries \`${helper}\``);
    }
  });

  test("the cap is one number", () => {
    assert.equal(FIELD_LIMITS.maxStudyChanges, 20);
    const caps = [...users.matchAll(/before\.size\(\) < (\d+)/g)].map((m) => Number(m[1]));
    assert.deepEqual(
      caps,
      [FIELD_LIMITS.maxStudyChanges],
      "firestore.rules and FIELD_LIMITS.maxStudyChanges disagree about how many entries one " +
        "account keeps. The form reads the constant to refuse before it tries, and the rule " +
        "is what refuses.",
    );
    assert.ok(
      STUDY_CHANGES_FULL.includes(` ${FIELD_LIMITS.maxStudyChanges} times`),
      "what the member is told at the cap names another number",
    );
  });

  test("a key is held to one pattern", () => {
    const patterns = [...users.matchAll(/\.matches\('([^']+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(
      patterns,
      [STUDY_CHANGE_ID.source],
      "the rule and src/features/profile/studyChange.ts hold an entry's key to different patterns, " +
        "so the form can mint a key the rule refuses",
    );
  });

  test("what the member is told at the cap says who can help, in plain words", () => {
    assert.match(STUDY_CHANGES_FULL, /ai-safety@uonsu\.com/);
    assert.doesNotMatch(STUDY_CHANGES_FULL, /permission|rule|database|document|firestore/i);
  });
});

// ---------------------------------------------------------------------------
// 3. The shape
// ---------------------------------------------------------------------------

/** What the SDK hands back for a stored time. */
const stamp = (iso) => ({ toDate: () => new Date(iso) });

describe("normalizeUser reads the record", () => {
  test("a document with no such field has no changes, and no empty list either", () => {
    const user = normalizeUser("u1", { role: "member", profile: { subject: "Mathematics" } });
    assert.equal("studyChanges" in user, false);
  });

  test("anything that is not a map reads as no changes", () => {
    for (const studyChanges of [null, [], "x", 3, [{ at: stamp("2026-10-01T09:00:00Z"), subject: "Maths" }]]) {
      const user = normalizeUser("u1", { role: "member", studyChanges });
      assert.equal("studyChanges" in user, false, JSON.stringify(studyChanges));
    }
    assert.equal("studyChanges" in normalizeUser("u1", { role: "member", studyChanges: {} }), false);
  });

  test("every key is one entry, newest first", () => {
    const user = normalizeUser("u1", {
      role: "member",
      studyChanges: {
        bbb: { at: stamp("2026-09-25T09:00:00Z"), subject: "Maths" },
        aaa: { at: stamp("2026-10-06T18:30:00Z"), expectedGraduation: "2027-06" },
        ccc: { at: stamp("2026-10-01T12:00:00Z"), subject: "Mathematics", expectedGraduation: "2026-06" },
      },
    });
    assert.deepEqual(
      user.studyChanges.map((change) => change.id),
      ["aaa", "ccc", "bbb"],
    );
    assert.deepEqual(user.studyChanges[1], {
      id: "ccc",
      at: new Date("2026-10-01T12:00:00Z"),
      subject: "Mathematics",
      expectedGraduation: "2026-06",
    });
    assert.equal("subject" in user.studyChanges[0], false, "a field the save did not change is left off");
  });

  test("an entry the server has not timed yet comes first, and keeps its place in the count", () => {
    // Between a save and the server's answer the SDK reads the time as null.
    // The form counts entries to know whether there is room for another, so
    // the entry must still be one.
    const user = normalizeUser("u1", {
      role: "member",
      studyChanges: {
        old: { at: stamp("2026-09-25T09:00:00Z"), subject: "Maths" },
        fresh: { at: null, subject: "Mathematics" },
      },
    });
    assert.deepEqual(
      user.studyChanges.map((change) => [change.id, change.at]),
      [
        ["fresh", null],
        ["old", new Date("2026-09-25T09:00:00Z")],
      ],
    );
  });

  test("a part that cannot be read is left off the entry, and the entry is kept", () => {
    const user = normalizeUser("u1", {
      role: "member",
      studyChanges: {
        odd1: "not an entry",
        odd2: { at: "yesterday", subject: 7, expectedGraduation: "" },
        good: { at: stamp("2026-10-01T12:00:00Z"), subject: "Maths" },
      },
    });
    assert.equal(user.studyChanges.length, 3, "the rule counts keys, so this does too");
    assert.deepEqual(
      user.studyChanges.find((change) => change.id === "odd2"),
      { id: "odd2", at: null },
    );
  });

  test("two entries at one instant keep the same order on every read", () => {
    const at = stamp("2026-10-01T12:00:00Z");
    const one = normalizeUser("u1", { studyChanges: { b: { at, subject: "B" }, a: { at, subject: "A" } } });
    const two = normalizeUser("u1", { studyChanges: { a: { at, subject: "A" }, b: { at, subject: "B" } } });
    assert.deepEqual(one.studyChanges, two.studyChanges);
  });
});

// ---------------------------------------------------------------------------
// The words on the admin's page
// ---------------------------------------------------------------------------

describe("what the admin's page says", () => {
  const at = (iso) => new Date(iso);

  test("nothing, for somebody who has changed neither", () => {
    assert.equal(studyChangeWords({ changes: undefined, firstName: "Ada", status: "undergraduate" }), null);
    assert.equal(studyChangeWords({ changes: [], firstName: "Ada", status: "undergraduate" }), null);
    // An entry that names neither field says nothing an admin can read.
    assert.equal(
      studyChangeWords({ changes: [{ id: "x", at: at("2026-10-01T12:00:00Z") }], firstName: "Ada", status: undefined }),
      null,
    );
  });

  test("one change", () => {
    assert.deepEqual(
      studyChangeWords({
        changes: [{ id: "a", at: at("2026-10-06T18:30:00Z"), subject: "Mathematics" }],
        firstName: "Ada",
        status: "undergraduate",
      }),
      {
        lead: "Ada has changed their degree on their own profile once. This is what it said before.",
        rows: [
          {
            id: "a",
            when: "6 Oct 2026",
            dateTime: "2026-10-06T18:30:00.000Z",
            facts: [{ label: "Degree name was", value: "Mathematics" }],
          },
        ],
      },
    );
  });

  test("several changes, newest first, each with what it said before", () => {
    const words = studyChangeWords({
      changes: [
        { id: "c", at: at("2026-10-06T18:30:00Z"), subject: "Mathematics", expectedGraduation: "2027-06" },
        { id: "b", at: at("2026-10-01T12:00:00Z"), expectedGraduation: "2026-06" },
        { id: "a", at: at("2025-11-20T09:00:00Z"), subject: "Maths" },
      ],
      firstName: "Ada",
      status: "masters",
    });
    assert.equal(
      words.lead,
      "Ada has changed their degree or expected graduation on their own profile 3 times. " +
        "This is what it said before each change, newest first.",
    );
    assert.deepEqual(
      words.rows.map((row) => [row.when, row.facts.map((fact) => `${fact.label} ${fact.value}`)]),
      [
        ["6 Oct 2026", ["Degree name was Mathematics", "Expected graduation was June 2027"]],
        ["1 Oct 2026", ["Expected graduation was June 2026"]],
        ["20 Nov 2025", ["Degree name was Maths"]],
      ],
    );
  });

  test("the sentence names only what was changed", () => {
    const only = (change) =>
      studyChangeWords({ changes: [{ id: "a", at: at("2026-10-06T18:30:00Z"), ...change }], firstName: "Sam", status: "phd" }).lead;
    assert.equal(
      only({ expectedGraduation: "2027-06" }),
      "Sam has changed their expected graduation on their own profile once. This is what it said before.",
    );
    assert.equal(
      only({ subject: "Physics", expectedGraduation: "2027-06" }),
      "Sam has changed their degree or expected graduation on their own profile once. This is what it said before.",
    );
  });

  test("the degree is called what the profile card calls it for that person", () => {
    const words = (status) =>
      studyChangeWords({
        changes: [{ id: "a", at: at("2026-10-06T18:30:00Z"), subject: "Robotics" }],
        firstName: "Sam",
        status,
      });
    assert.match(words("employee").lead, /^Sam has changed their area of work on their own profile once\./);
    assert.equal(words("employee").rows[0].facts[0].label, "Area of work was");
    assert.equal(words("other").rows[0].facts[0].label, "Area of study or work was");
    assert.equal(words(undefined).rows[0].facts[0].label, "Degree name was");
  });

  test("the day is London's", () => {
    // 23:30 UTC on 30 June is half past midnight on 1 July in London.
    const [row] = studyChangeWords({
      changes: [{ id: "a", at: at("2026-06-30T23:30:00Z"), subject: "Maths" }],
      firstName: "Ada",
      status: "undergraduate",
    }).rows;
    assert.equal(row.when, "1 Jul 2026");
    assert.notEqual(at("2026-06-30T23:30:00Z").getDate(), 1, "the suite really is running outside London");
  });

  test("an entry with no time, a blank answer and a graduation in another shape are still shown", () => {
    const words = studyChangeWords({
      changes: [
        { id: "a", at: null, subject: "   " },
        { id: "b", at: at("2026-10-01T12:00:00Z"), expectedGraduation: "2nd year" },
      ],
      firstName: "Ada",
      status: "undergraduate",
    });
    assert.deepEqual(words.rows[0], {
      id: "a",
      when: "",
      dateTime: null,
      facts: [{ label: "Degree name was", value: "(blank)" }],
    });
    assert.equal(words.rows[1].facts[0].value, "2nd year");
  });

  test("a stored month reads as a month and a year", () => {
    assert.equal(graduationWords("2027-06"), "June 2027");
    assert.equal(graduationWords("2028-12"), "December 2028");
    assert.equal(graduationWords("2028-13"), "2028-13");
    assert.equal(graduationWords(""), "");
  });
});

// ---------------------------------------------------------------------------
// 4. Who reads it
// ---------------------------------------------------------------------------

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

/**
 * Every file under `src` whose CODE names the stored field, with what it does
 * with it. Both ways: a file that names it and is not here fails, and an
 * entry for a file that no longer names it fails.
 *
 * The list is short on purpose. The entries sit on the member's own document,
 * which other code reads for a name or a role, and none of that code may
 * start handing the entries on. A new reader is added here with who it serves.
 */
const NAMES_THE_FIELD = new Map([
  [
    "src/lib/firestore/users.ts",
    "the shape: the type, and the normaliser that turns the stored map into a list",
  ],
  [
    "src/features/profile/studyChange.ts",
    "builds the member's own write, which adds one entry under the field",
  ],
  [
    "src/features/profile/ProfileForm.tsx",
    "counts the member's own entries so the save can refuse at the cap before it tries; it draws none of them",
  ],
  [
    "src/features/admin/MemberItem.tsx",
    "the admin's page for one person, which hands the list to the one component that draws it",
  ],
]);

/** The file a local import specifier names, or null for a package. */
function resolveImport(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file under `src` that imports `target`, by any name. */
function importersOf(target) {
  const wanted = join(REPO_ROOT, target);
  const found = [];
  for (const file of walk(SRC)) {
    const source = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      if (resolveImport(specifier, file) === wanted) {
        found.push(posix(file));
        break;
      }
    }
  }
  return found.sort();
}

describe("who reads the record", () => {
  const naming = [];
  for (const file of walk(SRC)) {
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    if (/\bstudyChanges\b/.test(code)) naming.push(posix(file));
  }

  test("the walk reads the tree, so the check below is not vacuous", () => {
    assert.ok(naming.includes("src/lib/firestore/users.ts"));
  });

  test("every file that names the field is written down, with what it does with it", () => {
    const unlisted = naming.filter((file) => !NAMES_THE_FIELD.has(file));
    assert.deepEqual(
      unlisted,
      [],
      "these files read or write `studyChanges` and are not in NAMES_THE_FIELD. The entries are " +
        "what a member's degree and graduation said before they changed them, shown to admins on " +
        "one page. A new reader has to be added to the list with who it serves, and has to be " +
        "somewhere only those people reach.",
    );
    const stale = [...NAMES_THE_FIELD.keys()].filter((file) => !naming.includes(file));
    assert.deepEqual(stale, [], "these entries name a file that no longer names the field");
    for (const [file, why] of NAMES_THE_FIELD) {
      assert.ok(why.trim().length > 20, `${file} needs a reason a reader can check`);
    }
  });

  test("one component draws it, and only the admin's page for one person mounts that component", () => {
    assert.deepEqual(importersOf("src/features/admin/studyChangeWords.ts"), [
      "src/features/admin/StudyChangeNotes.tsx",
    ]);
    assert.deepEqual(importersOf("src/features/admin/StudyChangeNotes.tsx"), [
      "src/features/admin/MemberItem.tsx",
    ]);
    assert.deepEqual(importersOf("src/features/admin/MemberItem.tsx"), [
      "src/features/admin/MemberPage.tsx",
    ]);
    // `(admin-only)` is the tree whose layout admits admins and nobody else;
    // tests/no-admin-gating.test.mjs holds that layout to its gate.
    assert.deepEqual(importersOf("src/features/admin/MemberPage.tsx"), [
      "src/app/(app)/admin/(admin-only)/members/[uid]/page.tsx",
    ]);
  });

  test("the member's own page draws none of it", () => {
    const form = stripSource(read("src/features/profile/ProfileForm.tsx"), { keepStrings: true });
    const uses = [...form.matchAll(/\bstudyChanges\b[^\n]*/g)].map((m) => m[0].trim());
    assert.deepEqual(
      uses,
      ["studyChanges?.length ?? 0,"],
      "the profile form reads how many entries there are and nothing else of them",
    );
  });
});

// ---------------------------------------------------------------------------
// 6. What a degree is
// ---------------------------------------------------------------------------

const DEGREE_MODULE = "src/features/profile/studyChange.ts";

/**
 * Every read of a property called `name` in one file: `x.name`, `x?.name`,
 * `x["name"]`, and `{ name }` taken out of something. Each comes with what it
 * was read off, as written, and the function of the file it is in.
 *
 * Read with the compiler's parser, so a variable called `course` is not a
 * read of a property called `course`, and neither is a word in a comment.
 */
function propertyReads(file, name) {
  const text = readFileSync(file, "utf8");
  if (!text.includes(name)) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const within = (node) => {
    for (let up = node.parent; up; up = up.parent) {
      if (ts.isFunctionDeclaration(up) && up.name) return up.name.text;
      if ((ts.isArrowFunction(up) || ts.isFunctionExpression(up)) && ts.isVariableDeclaration(up.parent)) {
        return up.parent.name.getText(source);
      }
    }
    return null;
  };
  const reads = [];
  const visit = (node) => {
    let off = null;
    if (ts.isPropertyAccessExpression(node) && node.name.text === name) {
      off = node.expression;
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === name
    ) {
      off = node.expression;
    } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      const key = node.propertyName ?? node.name;
      // Taken out of a value (`= context`), or out of a parameter, which is
      // read as the whole parameter with its type.
      if (ts.isIdentifier(key) && key.text === name) off = node.parent.parent.initializer ?? node.parent.parent;
    }
    if (off) reads.push({ off: off.getText(source).replace(/\s+/g, " "), within: within(node) });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return reads;
}

/** `file -> its reads of a property called name`, for every file under `src` that has one. */
function filesReading(name, only = () => true) {
  const found = new Map();
  for (const file of walk(SRC)) {
    const reads = propertyReads(file, name).filter(only);
    if (reads.length > 0) found.set(posix(file), reads);
  }
  return found;
}

/** Read off something called a profile, which is how every such read in the tree is written. */
const offAProfile = (read) => /profile/i.test(read.off);

/**
 * EVERY FILE UNDER `src` THAT READS A PROPERTY CALLED `course`, with what it
 * is a property of. Both ways: a file that reads one and is not here fails,
 * and an entry for a file that reads none fails.
 *
 * The older field of a profile is called `course`, and so is the course a
 * public page is about. Every reader is listed so that the first kind stays
 * at one: a second reader of a profile's `course` is a second opinion about
 * what somebody's degree is.
 */
const READS_A_PROPERTY_CALLED_COURSE = new Map([
  [DEGREE_MODULE, { of: "a profile", why: "`degreeOf`, the one reading of what somebody's degree is" }],
  ["src/app/(public)/courses/page.tsx", { of: "a course", why: "the public list of courses: the course each entry is about" }],
  ["src/app/(public)/courses/[courseId]/page.tsx", { of: "a course", why: "one course's public page" }],
  ["src/app/(public)/courses/[courseId]/apply/page.tsx", { of: "a course", why: "the page that leads to one course's sign-up" }],
  ["src/app/(public)/courses/[courseId]/weeks/[week]/page.tsx", { of: "a course", why: "one week of a course's public curriculum" }],
  ["src/features/courses/fetchCourses.ts", { of: "a course", why: "the server lookups those public pages are built from" }],
  ["src/features/courses/CourseDangerZone.tsx", { of: "a course", why: "the course an admin is archiving or destroying, handed in as a prop" }],
  ["src/features/courses/useDestroy.ts", { of: "a course", why: "a destroy's manifest, which names the course it is for" }],
]);

/**
 * EVERY FILE THAT CALLS `degreeOf`, with what it does with the degree. A page
 * that shows somebody's degree, searches by it or fills a box with it is
 * here, and reads neither field itself.
 */
const READS_THE_DEGREE = new Map([
  ["src/features/admin/MemberItem.tsx", "shows it under the person's name, on the admin's page for one person"],
  ["src/features/admin/MemberEditForm.tsx", "fills the box an admin edits it in, when the form opens and when it is put back"],
  ["src/features/admin/ApprovalCard.tsx", "shows it on a join request"],
  ["src/app/(app)/admin/(admin-only)/members/page.tsx", "searches the admin's list of people by it"],
  ["src/app/(app)/dashboard/homeData.ts", "answers yes or no for Home: has this member said what they study"],
]);

/**
 * EVERY FILE THAT READS `subject` STRAIGHT OFF A PROFILE, with why it does
 * not go through the function. Each takes the newer field alone, on purpose,
 * and none of them reads the older one.
 */
const READS_THE_NEWER_FIELD_ALONE = new Map([
  [DEGREE_MODULE, "`degreeOf` itself"],
  [
    "src/features/profile/ProfileForm.tsx",
    "the member's own box is the newer field alone. An older account types its degree there afresh, and the " +
      "save notes that first degree with what the older field said (the table of writes above)",
  ],
  [
    "src/lib/applications/applicant/account.ts",
    "fills an application's About you step from the newer field alone, held to text and to its limit. What " +
      "is confirmed there is saved on the application and never on the profile",
  ],
  [
    "src/lib/firestore/applicationEmails.ts",
    "the field of study a join request's emails name is the newer field alone",
  ],
]);

describe("one function says what somebody's degree is", () => {
  test("the table: each stored profile holds the degree written beside it", () => {
    assert.ok(STORED_DEGREES.length >= 20, "the table has lost rows");
    for (const row of STORED_DEGREES) {
      assert.equal(degreeOf(row.stored), row.degree, `${JSON.stringify(row.stored)}: ${row.why}`);
    }
    // Nobody's profile, and an account with none.
    assert.equal(degreeOf(null), "");
    assert.equal(degreeOf(undefined), "");
  });

  test("every answer is text, whatever is stored", () => {
    for (const row of STORED_DEGREES) {
      assert.equal(typeof degreeOf(row.stored), "string", JSON.stringify(row.stored));
    }
    // What a page does with it: trims it, searches it, joins it to a line.
    for (const stored of [{ subject: ["Medicine"] }, { subject: 7, course: { name: "Maths" } }, { course: true }]) {
      assert.equal(degreeOf(stored).trim().toLowerCase(), "");
    }
  });

  test("the table tries each thing a field can hold in place of an answer, beside an older field that has one", () => {
    // A row is only worth having where the two readings could part: the
    // newer field holds something, it is not an answer, and the older one is.
    const kindOf = (value) => (value === null ? "null" : Array.isArray(value) ? "list" : typeof value);
    const tried = STORED_DEGREES.filter((row) => "subject" in row.stored && row.degree === "Maths").map((row) =>
      row.stored.subject === "" ? "empty text" : kindOf(row.stored.subject),
    );
    assert.deepEqual(tried.sort(), ["boolean", "empty text", "list", "null", "number", "object"]);
  });

  test("the write reads the degree through it, before and after", () => {
    const code = stripSource(read(DEGREE_MODULE), { keepStrings: true });
    assert.match(code, /const degreeBefore = degreeOf\(stored\);/);
    assert.match(code, /degreeOf\(\{ \.\.\.stored, subject \}\)/);
  });

  describe("the rule in firestore.rules", () => {
    const rules = read("firestore.rules");
    const users = rules
      .slice(rules.indexOf("match /users/{uid} {"), rules.indexOf("// === collaborators ==="))
      // Comments out, and every run of spaces to one, so the lines can be read as written.
      .replace(/\/\/.*$/gm, "")
      .replace(/\s+/g, " ");

    test("reads it the same way: the newer field where it is an answer, otherwise the older one", () => {
      for (const line of [
        "function studyField(data, field) { return data.get(['profile', field], ''); }",
        "function isAnswer(value) { return value is string && value.size() > 0; }",
        "function degreeOf(data) { return isAnswer(studyField(data, 'subject')) ? studyField(data, 'subject') : studyField(data, 'course'); }",
      ]) {
        assert.ok(
          users.includes(line),
          `the users block of firestore.rules does not carry \`${line}\`. The rule and \`degreeOf\` in ` +
            `${DEGREE_MODULE} have to read a degree the same way: change both, and the table in ` +
            "tests/lib/storedDegrees.mjs, together. The rules suite runs that table through the rule.",
        );
      }
    });

    test("holds the three fields to text, on a new account and on an account's own save", () => {
      const three = (helper) =>
        `${helper}('subject') && ${helper}('course') && ${helper}('expectedGraduation');`;
      for (const line of [
        "function isTextOrNothing(value) { return value == null || value is string; }",
        `function newStudyAnswersAreText() { return ${three("newStudyAnswerIsText")} }`,
        `function studyAnswersAreTextOrKept() { return ${three("studyAnswerIsTextOrKept")} }`,
      ]) {
        assert.ok(users.includes(line), `the users block of firestore.rules does not carry \`${line}\``);
      }
      // Each is asked where it has to be: once in the create rule, and once
      // in the account's own update, before the clause that reads the degree.
      const create = users.slice(users.indexOf("allow create:"), users.indexOf("function isTextOrNothing"));
      assert.equal(create.split("&& newStudyAnswersAreText()").length - 1, 1, "the create rule asks it once");
      const update = users.slice(users.indexOf("allow update:"));
      const asked = update.indexOf("&& studyAnswersAreTextOrKept()");
      assert.ok(
        asked !== -1 && asked < update.indexOf("&& studyChangesHold()))"),
        "an account's own update has to hold the three fields to text, and before it reads the degree: " +
          "the degree is read one way only while those fields are text",
      );
    });
  });

  describe("who reads it", () => {
    const course = filesReading("course");
    const calling = [];
    for (const file of walk(SRC)) {
      if (posix(file) === DEGREE_MODULE) continue;
      if (/\bdegreeOf\s*\(/.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) {
        calling.push(posix(file));
      }
    }
    const newer = filesReading("subject", offAProfile);

    test("the walks read the tree, so the lists below are not empty by accident", () => {
      assert.ok(course.size >= 5 && newer.size >= 2 && calling.length >= 3);
      assert.ok(course.has(DEGREE_MODULE) && newer.has(DEGREE_MODULE));
    });

    test("every file that reads a property called `course` is listed, with what it is a property of", () => {
      assert.deepEqual(
        [...course.keys()].filter((file) => !READS_A_PROPERTY_CALLED_COURSE.has(file)),
        [],
        "these files read a property called `course` and are not in READS_A_PROPERTY_CALLED_COURSE. If it is " +
          "a profile's older field, call `degreeOf` in its place: it is the one reading of what somebody's " +
          "degree is, and the rule in firestore.rules reads it the same way. If it is a course, list the file.",
      );
      assert.deepEqual(
        [...READS_A_PROPERTY_CALLED_COURSE.keys()].filter((file) => !course.has(file)),
        [],
        "these entries name a file that reads no property called `course`",
      );
      for (const [file, entry] of READS_A_PROPERTY_CALLED_COURSE) {
        assert.ok(["a profile", "a course"].includes(entry.of), `${file}: ${entry.of}`);
        assert.ok(entry.why.trim().length > 20, `${file} needs a reason a reader can check`);
      }
    });

    test("the older field of a profile is read in one function", () => {
      const profiles = [...READS_A_PROPERTY_CALLED_COURSE].filter(([, entry]) => entry.of === "a profile");
      assert.deepEqual(profiles.map(([file]) => file), [DEGREE_MODULE]);
      assert.deepEqual(
        (course.get(DEGREE_MODULE) ?? []).map((one) => `${one.off}.course in ${one.within}`),
        ["profile.course in degreeOf"],
        "a profile's `course` is read once, inside `degreeOf`. Anything else that needs the degree calls it.",
      );
      // And no file listed for a course reads one off a profile.
      for (const [file, entry] of READS_A_PROPERTY_CALLED_COURSE) {
        if (entry.of !== "a course") continue;
        assert.deepEqual(
          (course.get(file) ?? []).filter(offAProfile).map((one) => one.off),
          [],
          `${file} is listed as reading a course's \`course\`, and reads one off a profile`,
        );
      }
    });

    test("every file that calls the function is listed, with what it does with the degree", () => {
      assert.deepEqual(
        calling.sort(),
        [...READS_THE_DEGREE.keys()].sort(),
        "the files that call `degreeOf` are not the ones in READS_THE_DEGREE. A page that shows somebody's " +
          "degree, searches by it or fills a box with it is listed with what it does.",
      );
      for (const [file, why] of READS_THE_DEGREE) {
        assert.ok(why.trim().length > 20, `${file} needs a reason a reader can check`);
      }
    });

    test("every file that reads `subject` straight off a profile is listed, with why it may", () => {
      assert.deepEqual(
        [...newer.keys()].sort(),
        [...READS_THE_NEWER_FIELD_ALONE.keys()].sort(),
        "the files that read `subject` straight off a profile are not the ones in " +
          "READS_THE_NEWER_FIELD_ALONE. Something that shows or seeds somebody's degree calls `degreeOf`. A " +
          "file that wants the newer field alone is listed with why.",
      );
      for (const [file, why] of READS_THE_NEWER_FIELD_ALONE) {
        assert.ok(why.trim().length > 10, `${file} needs a reason a reader can check`);
      }
      // A page that calls the function reads neither field by hand.
      assert.deepEqual([...READS_THE_DEGREE.keys()].filter((file) => newer.has(file) || course.has(file)), []);
      // In the function's own module the newer field is read off a profile
      // in the function, and nowhere else.
      assert.deepEqual(
        newer.get(DEGREE_MODULE).map((one) => `${one.off}.subject in ${one.within}`),
        ["profile.subject in degreeOf"],
      );
    });

    test("the admin's box is filled from it both times: when the form opens, and when it is put back", () => {
      const form = stripSource(read("src/features/admin/MemberEditForm.tsx"), { keepStrings: true });
      assert.match(form, /useState\(degreeOf\(user\.profile\)\)/);
      assert.match(form, /setSubject\(degreeOf\(user\.profile\)\)/);
      assert.equal([...form.matchAll(/\bdegreeOf\(/g)].length, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// What the member is told when a save is refused
// ---------------------------------------------------------------------------

describe("a refused save is said in plain words", () => {
  const form = stripSource(read("src/features/profile/ProfileForm.tsx"), { keepStrings: true });

  test("the cap is said before anything is sent", () => {
    const save = form.slice(form.indexOf("async function onSave("));
    const refused = save.indexOf("setError(STUDY_CHANGES_FULL)");
    const sent = save.indexOf("await updateDoc(");
    assert.ok(refused !== -1 && sent > refused, "the form must stop at the cap before it writes");
  });

  test("a refusal by the rules is not shown as the database worded it", () => {
    assert.match(
      form,
      /isRefusal\(err\) \? SAVE_REFUSED :/,
      "a save the rules refuse has to reach the member as SAVE_REFUSED",
    );
    const message = /const SAVE_REFUSED =\s*"([^"]+)"/.exec(form)?.[1] ?? "";
    assert.match(message, /did not save/);
    assert.match(message, /Reload the page and try again/);
    assert.match(message, /ai-safety@uonsu\.com/);
    assert.doesNotMatch(message, /permission|insufficient|rule|database|firestore/i);
    assert.match(form, /\.code === "permission-denied"/);
  });
});
