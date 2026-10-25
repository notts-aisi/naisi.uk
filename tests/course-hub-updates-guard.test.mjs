/**
 * Updates (Q18) are read through one gate and written by one route, and a
 * message is never markup. Walked over the whole of `src`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The class this guards
 *
 * An update is to an audience: everyone on a run, one group, or its
 * facilitators. The failure that matters is an update reaching people it is
 * not to: another group's members, somebody Publish has not told, somebody
 * who left, a reviewer. `src/lib/courses/updates/readers.ts` decides who
 * reads which, and the suites execute it. What they cannot see is the NEXT
 * page or route that reads `courseUpdates` some other way, and shows an
 * update without asking. So:
 *
 *  1. EVERY FILE THAT ADDRESSES THE COLLECTION is listed with what it does:
 *     the one reader, the one writer, and the run destroy. A new file that
 *     reads or writes it fails here until somebody decides.
 *  2. EVERY CALLER OF THE READER hands it a reading worked out for the
 *     caller, by `updateReadingOf`, narrowed to one group's page at most.
 *  3. THE WRITER refuses view-as first, checks the body before it opens the
 *     database, asks the gate before it writes, and writes only after every
 *     refusal (the count, the caps) has had its say.
 *  4. A MESSAGE IS TEXT: nothing that draws an update hands it to the page as
 *     markup.
 *  5. THE COLLECTION HAS ITS RULES BLOCK, refusing every browser.
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
/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });
const FILES = [...walkSource(SRC)].map((file) => [inSrc(file), codeOf(file)]);
const read = (path) => FILES.find(([file]) => file === path)?.[1] ?? null;

/** Where the collection's name lives. Nothing else may spell it. */
const HOME = "lib/firestore/courseUpdates.ts";

/** A file ADDRESSES the collection when it hands the name, or its constant, to the database. */
const ADDRESSES =
  /\.collection\(\s*(?:COURSE_UPDATES_COLLECTION|["'`]courseUpdates["'`])\s*\)|\bbyRunId\(\s*COURSE_UPDATES_COLLECTION\s*\)|\bdrainQuery\(\s*\w+\s*,\s*COURSE_UPDATES_COLLECTION/;

const ADDRESSERS = {
  "lib/courses/updates/readers.ts": {
    does: "read",
    why: "the one reader: who reads which update, and the updates a reader is shown",
  },
  "app/api/courses/runs/[runId]/updates/route.ts": {
    does: "write",
    why: "the one writer: an update is posted here, behind the gate, and nowhere else",
  },
  "lib/firestore/courseDeletion.ts": {
    does: "destroy",
    why: "destroying a run counts its updates on the manifest and drains them",
  },
};

describe("1. every file that addresses courseUpdates is listed", () => {
  const addressing = FILES.filter(([, code]) => ADDRESSES.test(code)).map(([file]) => file).sort();

  test("the scan is reading: it finds the reader and the writer", () => {
    assert.ok(FILES.length > 400, `only ${FILES.length} files were read`);
    assert.ok(addressing.includes("lib/courses/updates/readers.ts"));
    assert.ok(addressing.includes("app/api/courses/runs/[runId]/updates/route.ts"));
  });

  test("they are the listed files, both ways", () => {
    assert.deepEqual(
      addressing,
      Object.keys(ADDRESSERS).sort(),
      "A file reads or writes courseUpdates and is not listed. Updates are read through " +
        "src/lib/courses/updates/readers.ts, which decides who reads which, and written by the updates route: " +
        "go through them, or list the file here with what it does and why.",
    );
  });

  test("the collection's name is spelled in one place", () => {
    const spelling = FILES.filter(([, code]) => /["'`]courseUpdates["'`]/.test(code)).map(([file]) => file);
    assert.deepEqual(spelling, [HOME]);
    assert.match(read(HOME), /export const COURSE_UPDATES_COLLECTION = "courseUpdates";/);
  });

  test("only the writer writes, and only the reader and the destroy read", () => {
    const route = read("app/api/courses/runs/[runId]/updates/route.ts");
    assert.match(route, /\.collection\(COURSE_UPDATES_COLLECTION\)\.doc\(\)/);
    for (const [file, entry] of Object.entries(ADDRESSERS)) {
      if (entry.does === "write") continue;
      const code = read(file);
      const writes = /\.collection\(COURSE_UPDATES_COLLECTION\)[^;]*\.(?:set|update|add|create)\(/;
      assert.doesNotMatch(code, writes, `${file} writes an update`);
    }
  });
});

describe("2. every caller of the reader hands it a reading worked out for the caller", () => {
  const callers = FILES.filter(([file, code]) => file !== "lib/courses/updates/readers.ts" && /\bloadUpdatesFor\(/.test(code));

  test("the scan finds the route and the pages", () => {
    const names = callers.map(([file]) => file).sort();
    assert.deepEqual(names, [
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/messages/page.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/page.tsx",
      "app/api/courses/runs/[runId]/updates/route.ts",
    ]);
  });

  for (const [file, code] of callers) {
    test(`${file}`, () => {
      // The reading is the caller's own: worked out by updateReadingOf from the session in hand.
      assert.match(code, /\bupdateReadingOf\(db, (?:actor|user|access\.user), /, "it does not ask who the caller is");
      for (const call of code.matchAll(/\bloadUpdatesFor\(([^)]*(?:\([^)]*\))?[^)]*)\)/g)) {
        const reading = call[1].split(",")[2]?.trim() ?? "";
        assert.match(
          reading,
          /^(?:reading|narrowToGroup\(reading)$/,
          `it hands the reader \`${reading}\` rather than the caller's own reading`,
        );
      }
    });
  }
});

describe("3. the writer's order", () => {
  const route = read("app/api/courses/runs/[runId]/updates/route.ts");
  const post = route.slice(route.indexOf("export async function POST("));
  const at = (needle) => {
    const index = post.indexOf(needle);
    assert.notEqual(index, -1, `the writer no longer contains \`${needle}\``);
    return index;
  };

  test("view-as is refused first, then the session, then the body, before the database is opened", () => {
    assert.match(post, /^export async function POST\([^)]*\) \{\s*const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/);
    assert.ok(at("await getCurrentUser()") < at("parseUpdatePost(raw)"));
    assert.ok(at("parseUpdatePost(raw)") < at("getAdminDb()"));
  });

  test("the gate is asked before anything is written, and every refusal before the update is", () => {
    const write = at("await ref.set(");
    for (const before of [
      "doesTrackLeadWork(await runStaffingOf(db, actor, run))",
      "updateEmailAudience(",
      "post.emailCount",
      "reserveNoticeSlots(",
      "reserveSendSlot(",
    ]) {
      assert.ok(at(before) < write, `\`${before}\` comes after the update is written`);
    }
    // The emails go after the update is written, and what they did is recorded after the last.
    assert.ok(write < at("dispatchSends("));
    assert.ok(at("dispatchSends(") < at("settled: true"));
  });

  test("a test posts nothing: it answers before the update is written", () => {
    const test = post.slice(post.indexOf("if (post.test) {"));
    assert.ok(test.indexOf("return NextResponse.json({ ok: true, test:") < test.indexOf("await ref.set("));
  });
});

describe("4. a message is text", () => {
  const DRAWERS = FILES.filter(
    ([file]) =>
      file.startsWith("features/courses/updates/") ||
      file.startsWith("lib/courses/updates/") ||
      file === "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/messages/page.tsx" ||
      file === "app/(app)/learn/[runId]/group/[groupId]/update/page.tsx" ||
      file === "app/api/courses/runs/[runId]/updates/route.ts",
  );

  test("the scan finds the files that draw updates", () => {
    assert.ok(DRAWERS.length >= 10, `only ${DRAWERS.length} files were read`);
  });

  for (const [file, code] of DRAWERS) {
    test(`${file} hands nothing to the page as markup`, () => {
      assert.doesNotMatch(code, /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b/);
    });
  }

  test("the email builds its markup from the message only through the staff email's escaping", () => {
    const route = read("app/api/courses/runs/[runId]/updates/route.ts");
    assert.match(route, /staffMessageBlocks\(post\.message, senderName, context\)/);
    assert.doesNotMatch(route, /type: "richText"/);
  });
});

describe("5. the collection has its rules block", () => {
  test("firestore.rules refuses every browser, admins included", () => {
    const rules = readFileSync(join(REPO_ROOT, "firestore.rules"), "utf8");
    const block = /match \/courseUpdates\/\{\w+\} \{([^}]*)\}/.exec(rules);
    assert.ok(
      block,
      "firestore.rules has no block for courseUpdates. The collection is written by one route and read only on the " +
        "server, so its block is `allow read, write: if false;` (see the build notes for the block and its rules test).",
    );
    assert.equal(block[1].trim(), "allow read, write: if false;");
  });
});
