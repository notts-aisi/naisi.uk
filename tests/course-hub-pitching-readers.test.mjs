/**
 * Every file in `src` that touches pitching week's picks says what it does
 * with them, and none of them hands them out.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * A pitch (`coursePitches`) carries who would join it (`wouldJoinUids`): the
 * picks. Nobody but a programme's lead and admins learns who picked what, and
 * they are told only how many; a person taking part is told which pitches
 * THEY picked and nothing else. The routes build every field they send, so
 * the class of failure is a new reader, or a new field on what travels, that
 * carries somebody else's pick to a page.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` that names the collection or the picks
 * field is listed in `READERS` with what it does, both directions. A new file
 * fails here until somebody decides what it does with the picks.
 *
 * THE WIRE. The shapes that travel to a page (`PitchRow`, `MyPitch`,
 * `PitchingView`, `StaffPitchRow`) carry no list of people, and no file under
 * `src/app` or `src/features` names the picks field: pages and routes are
 * handed what the loaders built, never a stored pitch.
 *
 * THE BROWSER. Nothing addresses the collection through the client SDK; the
 * rules refuse every browser, and this keeps the code from trying.
 *
 * What the readers then do is executed in
 * `tests/course-hub-pitching-{routes,lead,pages,deletion}.test.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

/** Code with comments gone and strings kept, so a collection named in a string is seen. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });

/** Names the collection: by its constant, or by its name in a string. */
const NAMES_COLLECTION = /\bPITCHES_COLLECTION\b|["'`]coursePitches["'`]/;
/** Names the picks. */
const NAMES_PICKS = /\bwouldJoinUids\b/;

/**
 * Every file that touches pitches or picks, and what it does with the picks.
 * `proof` is a literal the file must still contain for its reason to hold.
 */
const READERS = {
  "lib/courses/pitching/model.ts": {
    proof: ["export function normalizePitch("],
    why: "defines a pitch and reads a stored one; what it hands on is a normalised pitch, read only by the files below",
  },
  "lib/courses/pitching/load.ts": {
    proof: ["picked: !yours && pitch.wouldJoinUids.includes(user.uid)"],
    why: "a person's page: of all the picks it reads, it tells the person only whether THEY picked each pitch",
  },
  "lib/courses/pitching/write.ts": {
    proof: ["candidate.wouldJoinUids.includes(user.uid)"],
    why: "the two writers: a pick is added or taken off for the caller only, and counted for the caller's limit",
  },
  "lib/applications/handover/pitchesLoad.ts": {
    proof: ["wouldJoin: pitch.wouldJoinUids.filter((uid) => counts(uid, pitch.groupId)).length"],
    why: "the lead's and admins' list: each pitch's picks become a number, and nobody who picked is named",
  },
  "lib/firestore/accountDeletion.ts": {
    proof: ["FieldValue.arrayRemove(uid)"],
    why: "account deletion takes the person off every pitch and every list of who would join one",
  },
  "lib/firestore/courseDeletion.ts": {
    proof: ["drainQuery(db, PITCHES_COLLECTION, byRunId(PITCHES_COLLECTION), budget)"],
    why: "a run's destroy counts its pitches and deletes them whole",
  },
};

const files = [...walkSource(SRC)].filter((file) => /\.tsx?$/.test(file));
const touching = files.filter((file) => {
  const code = codeOf(file);
  return NAMES_COLLECTION.test(code) || NAMES_PICKS.test(code);
});

describe("the readers of pitches", () => {
  test("the scan sees the known readers", () => {
    assert.ok(touching.length >= 6, `only ${touching.length} files touch pitches`);
  });

  test("each one is listed, and every entry is a file that still touches pitches", () => {
    const found = touching.map(inSrc).sort();
    assert.deepEqual(
      found.filter((file) => !Object.hasOwn(READERS, file)),
      [],
      "These touch pitching week's pitches or picks and are not in READERS. Nobody but the lead and " +
        "admins learns who picked what, and they only as a number: decide what this file does with " +
        "the picks, and list it.",
    );
    assert.deepEqual(Object.keys(READERS).filter((file) => !found.includes(file)), []);
  });

  for (const [file, entry] of Object.entries(READERS)) {
    test(`${file} does what its entry says`, () => {
      assert.ok(entry.why.length >= 40, "a reason is missing or too short to be one");
      const code = readFileSync(join(SRC, ...file.split("/")), "utf8");
      for (const literal of entry.proof) {
        assert.ok(code.includes(literal), `its reason is about \`${literal}\`, which the file no longer contains`);
      }
    });
  }
});

describe("what travels", () => {
  test("no route, page or component names the picks: they are handed what the loaders built", () => {
    const leaking = files
      .map((file) => [inSrc(file), codeOf(file)])
      .filter(([file, code]) => (file.startsWith("app/") || file.startsWith("features/")) && NAMES_PICKS.test(code))
      .map(([file]) => file);
    assert.deepEqual(leaking, []);
  });

  test("the shapes sent to a page carry no list of people", () => {
    const model = readFileSync(join(SRC, "lib", "courses", "pitching", "model.ts"), "utf8");
    for (const shape of ["PitchRow", "MyPitch", "PitchingView", "StaffPitchRow"]) {
      const body = new RegExp(`export type ${shape} = \\{([\\s\\S]*?)\\n\\};`).exec(model);
      assert.ok(body, `${shape} is no longer a type literal`);
      assert.doesNotMatch(body[1], /Uids\b|wouldJoinUids|pitcherUids/, `${shape} carries a list of people`);
    }
  });

  test("nothing addresses the collection through the browser's database", () => {
    const clientSide = files
      .map((file) => [inSrc(file), readFileSync(file, "utf8")])
      .filter(([, source]) => /from\s+["']firebase\/firestore["']/.test(source))
      .filter(([, source]) => NAMES_COLLECTION.test(stripSource(source, { keepStrings: true })))
      .map(([file]) => file);
    assert.deepEqual(clientSide, []);
  });
});
