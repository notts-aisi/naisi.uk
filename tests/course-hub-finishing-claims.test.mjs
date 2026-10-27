/**
 * NOTHING TELLS SOMEBODY THEY FINISHED BUT THEIR RECORD (C43).
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * When a run's last week passed, every page told everybody on it "Course
 * complete", "Completed" or "finished", so somebody who did not finish was
 * told they had. The class of failure is a page deciding for itself that a
 * person finished, from the calendar or the run's status, instead of asking
 * the finished record. This guard walks the tree for it:
 *
 *  1. NO FILE UNDER `src/` SAYS "Course complete", "cohort has finished" or
 *     "You finished" in its code or its words, but the one module the
 *     record's words live in (`src/lib/courses/finishing/words.ts`).
 *     Comments are not read.
 *  2. THE MEMBER'S PAGES THAT SAY A RUN IS OVER (the run home, the hub's card,
 *     Home's line and its programmes list) write no word for it themselves:
 *     each takes it from that module, and from the record the payload
 *     carries (`finished`).
 *  3. THE TWO PAYLOADS those pages read (the run home's and the hub's) ask
 *     the one answer, `finishedForMember`, and nothing else decides it.
 *
 * Each list is held both ways: a surface named here that no longer exists
 * fails, as does a new file that says the words.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** The one module that may say a member finished. */
const WORDS = "src/lib/courses/finishing/words.ts";

/** Words that claim a person finished, or that a course is complete for everybody. */
const CLAIMS = [/Course complete/i, /cohort has finished/i, /\bYou finished\b/];

/** The member's pages that say a run is over, and the words they must take from the record's module. */
const SURFACES = {
  "src/features/courses/RunHome.tsx": { record: "overview.finished", words: ["youFinished(", "hasEnded("] },
  "src/features/courses/RunCard.tsx": { record: "entry.finished", words: ["endedWord("] },
  "src/features/courses/MyCoursesSummary.tsx": { record: "entry.finished", words: ["endedWord("] },
  "src/app/(app)/dashboard/HomeProgramme.tsx": { record: "entry.finished", words: ["endedPart("] },
};

/** The payloads those pages read, each asking the one answer. */
const PAYLOADS = ["src/app/api/courses/runs/[runId]/overview/route.ts", "src/app/api/courses/me/route.ts"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

const repoPath = (path) => relative(ROOT, path).split(sep).join("/");
const code = (file) => {
  const source = readFileSync(join(ROOT, file), "utf8");
  const stripped = stripSource(source, { keepStrings: true });
  assertReadable(source, stripped, file, assert);
  return stripped;
};

describe("C43: only the finished record says somebody finished", () => {
  test("1. nothing under src says a course is complete or that somebody finished, but the record's words", () => {
    const files = walk(SRC);
    assert.ok(files.length > 500, `the walk found only ${files.length} files: it is not reading the tree`);
    const hits = [];
    for (const path of files) {
      const file = repoPath(path);
      if (file === WORDS) continue;
      const text = code(file);
      for (const claim of CLAIMS) if (claim.test(text)) hits.push(`${file}: ${claim}`);
    }
    assert.deepEqual(hits, [], "a page decides for itself that somebody finished: ask the record (src/lib/courses/finishing/)");
    // And the words module does say them, so the walk above is looking at something.
    assert.match(code(WORDS), /You finished/);
  });

  test("2. the member's pages that say a run is over take the word from the record", () => {
    for (const [file, { record, words }] of Object.entries(SURFACES)) {
      const text = code(file);
      assert.ok(text.includes(record), `${file} no longer reads the record (${record})`);
      for (const call of words) assert.ok(text.includes(call), `${file} no longer takes its words from the record's module (${call})`);
      assert.match(text, /from "@\/lib\/courses\/finishing\/words"/, file);
      // No word of its own for a run that is over.
      for (const literal of ['"Completed"', '"Finished"', '"finished"', '"Course complete"']) {
        assert.ok(!text.includes(literal), `${file} writes ${literal} itself`);
      }
    }
  });

  test("3. the payloads those pages read ask the one answer", () => {
    for (const file of PAYLOADS) {
      const text = code(file);
      assert.match(text, /finishedForMember\(/, `${file} does not ask the finished record`);
      assert.match(text, /from "@\/lib\/courses\/finishing\/record"/, file);
    }
    // And the one answer is the record's: one definition, nowhere else.
    const defining = walk(SRC)
      .map(repoPath)
      .filter((file) => /export async function finishedForMember\(/.test(code(file)));
    assert.deepEqual(defining, ["src/lib/courses/finishing/record.ts"]);
  });
});
