/**
 * FACILITATOR MATERIAL REACHES NO MEMBER AND NO WEEK.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The class
 *
 * A course's facilitator guide (session plans, week notes with their answer
 * keys, printables) is for the course's facilitators, its programme's lead
 * and admins (`src/lib/courses/facilitatorGuide/access.ts`). It leaks in two
 * ways nobody would see from one file:
 *
 *  1. A PAGE OR ROUTE THAT READS IT WITHOUT THE GATE. A new page under
 *     `/learn` imports the store, or a helper that wraps it, and draws a week
 *     plan for whoever opens the page. Nothing about the page looks wrong.
 *  2. A WEEK THAT CARRIES IT. Anyone signed in can read a week's document
 *     (`firestore.rules`, `isSignedIn()` on the run's weeks). A writer of
 *     weeks that copies a guide document in, or a week loader that accepts a
 *     session plan pasted in the wrong box, publishes the answer keys to
 *     every account.
 *
 * ## What this guard walks
 *
 *  1. Every file under `src` that names the guide's collection is the stored
 *     shape or the store. Nothing else touches it.
 *  2. Every page and route whose imports reach the store is listed below with
 *     the gate it calls, and calls it before it reads; the reader proof is
 *     minted in the gate's file and nowhere else; and no file in the browser
 *     reaches the store or the gate at all.
 *  3. Every file that writes a week reaches nothing of the guide but the one
 *     module that refuses it (`recognise.ts`), the week document's shape has
 *     no field for it, and the week loader refuses it before it can save.
 *  4. `firestore.rules` shuts the collection to every browser.
 *
 * Each list is checked in both directions, with a reason per entry, and the
 * scanner is shown to see what it claims to.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveImport, walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

/** Each file under `src`: its path, its code with comments gone and strings kept, and whether it runs in the browser. */
const FILES = new Map(
  [...walkSource(SRC)].map((file) => {
    const raw = readFileSync(file, "utf8");
    return [inSrc(file), { file, code: stripSource(raw, { keepStrings: true }), client: /^\s*["']use client["']/.test(raw) }];
  }),
);

/** The files a file pulls values from, under `src`. A type-only import brings nothing that runs. */
function importsOf(path) {
  const { file, code } = FILES.get(path);
  const out = [];
  const statement = /(?:^|\n)[ \t]*((?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
  for (const match of code.matchAll(statement)) {
    if (/^(?:import|export)\s+type\b/.test(match[1])) continue;
    const target = resolveImport(file, match[2], SRC);
    if (target) out.push(inSrc(target));
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const target = resolveImport(file, match[1], SRC);
    if (target) out.push(inSrc(target));
  }
  return out;
}

/** Every file `path` reaches through its value imports, itself included. */
function reach(path) {
  const seen = new Set([path]);
  const queue = [path];
  while (queue.length > 0) {
    for (const next of importsOf(queue.shift())) {
      if (FILES.has(next) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

const STORE = "lib/courses/facilitatorGuide/store.ts";
const ACCESS = "lib/courses/facilitatorGuide/access.ts";
const RECORD = "lib/firestore/courseFacilitatorGuide.ts";
const RECOGNISE = "lib/courses/facilitatorGuide/recognise.ts";

const isEntry = (path) => path.startsWith("app/") && /\/(page|route|layout)\.tsx?$/.test(path);

// ---------------------------------------------------------------------------
// 1. One place touches the collection
// ---------------------------------------------------------------------------

/** The files that name the collection, and why. */
const NAMES_THE_COLLECTION = {
  [RECORD]: "defines it: the collection's name, the document id, the stored shape and its normaliser, and nothing that reads or writes",
  [STORE]: "every read and write of it, each behind the reader or writer proof only the gate mints",
};

describe("1. one place touches the facilitator guide's collection", () => {
  test("the scan is reading: it sees the tree and the store", () => {
    assert.ok(FILES.size > 400, `only ${FILES.size} files were read`);
    assert.ok(FILES.get(STORE).code.includes("COURSE_FACILITATOR_GUIDE_COLLECTION"));
  });

  test("only the stored shape and the store name it", () => {
    const naming = [...FILES]
      .filter(([, { code }]) => code.includes('"courseFacilitatorGuide"') || code.includes("COURSE_FACILITATOR_GUIDE_COLLECTION"))
      .map(([path]) => path)
      .sort();
    assert.deepEqual(naming, Object.keys(NAMES_THE_COLLECTION).sort(), "a file names the facilitator guide's collection and is not the store: read and write it through src/lib/courses/facilitatorGuide/store.ts, behind the gate");
    for (const [path, why] of Object.entries(NAMES_THE_COLLECTION)) assert.ok(why.length > 40, `${path} needs its reason`);
  });
});

// ---------------------------------------------------------------------------
// 2. Every reader asks the gate first
// ---------------------------------------------------------------------------

/**
 * Every page, route and module that reaches the store, the gate it calls,
 * and why its readers may read what it reads. `gate` is the call the file
 * must make before its first read of the store; null for the course's
 * destroy, which reads addresses and a count and nothing a document says.
 */
const READERS = {
  "app/(app)/learn/facilitator-guide/[courseId]/page.tsx": {
    gate: "facilitatorGuideReader(",
    why: "the course page: the titles of every week and document loaded, for the gate's three; the one calm answer for everybody else",
  },
  "app/(app)/learn/facilitator-guide/[courseId]/[doc]/page.tsx": {
    gate: "facilitatorGuideReader(",
    why: "a week's or a document's page: the documents themselves, for the gate's three; the one calm answer for everybody else",
  },
  "app/(app)/admin/courses/[courseId]/facilitator-guide/page.tsx": {
    gate: "facilitatorGuideReader(",
    why: "the admin's loader page, behind requireAdminPage, which lists what is loaded where by its titles",
  },
  "app/api/courses/[courseId]/facilitator-guide/route.ts": {
    gate: "facilitatorGuideReader(",
    why: "the titles of a course's guide for a facilitator's Home, for the gate's three; one 403 for everybody else",
  },
  "app/api/courses/[courseId]/facilitator-guide/[slot]/route.ts": {
    gate: "facilitatorGuideWriter(",
    why: "the loader: copy, read and save one document, for admins and the lead of a programme naming a live run of the course, never in a view-as session",
  },
  "app/api/courses/[courseId]/facilitator-guide/printables/pdf/route.ts": {
    gate: "facilitatorGuideReader(",
    why: "a course's printables as an A4 PDF, one session's or the whole document's, drawn on request for the gate's three; the one calm sentence and not a byte of a PDF for everybody else",
  },
  "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/page.tsx": {
    gate: "facilitatorGuideReader(",
    why: "a week's page on a programme's Weeks tab, for its lead and admins: the titles loaded in the week's session plan and notes, for the guide box, read only behind facilitatorGuideWriter too",
  },
  "app/(app)/learn/[runId]/group/[groupId]/page.tsx": {
    gate: "facilitatorGuideReader(",
    why: "a facilitator's group page: which weeks have something, by title, for the ticket's link; the page itself is its live facilitators' and admins'",
  },
  "lib/courses/allocationPublish.ts": {
    gate: "facilitatorGuideReaderForGroup(",
    why: "Publish's plan: which weeks of the course's guide have something, by title, asked through the facilitators' door for each group it tells, so their email says week 1's guide is on their group page only while that page shows it; nothing a document says leaves the plan",
  },
  "lib/firestore/courseDeletion.ts": {
    gate: null,
    why: "the course's destroy, an admin's typed confirmation: it counts the course's documents and deletes them by address, reading nothing they say",
  },
};

/**
 * Pages and routes that reach the store only through a listed module that
 * reads nothing a document says (the course's destroy), and do not import the
 * store themselves. Each names that module.
 */
const THROUGH = {
  "app/api/courses/[courseId]/destroy/route.ts": {
    via: "lib/firestore/courseDeletion.ts",
    why: "destroys a course, which deletes its facilitator guide by address in the engine's final batch",
  },
  "app/api/courses/[courseId]/destroy-manifest/route.ts": {
    via: "lib/firestore/courseDeletion.ts",
    why: "counts what a course's destroy would take, the guide's documents among them, as a number",
  },
  "app/api/courses/runs/[runId]/destroy/route.ts": {
    via: "lib/firestore/courseDeletion.ts",
    why: "destroys a run through the same engine, whose run cascade never touches a course's guide",
  },
  "app/api/courses/runs/[runId]/destroy-manifest/route.ts": {
    via: "lib/firestore/courseDeletion.ts",
    why: "counts what a run's destroy would take, through the same engine, and no course's guide is in it",
  },
  "app/api/courses/runs/[runId]/allocation/route.ts": {
    via: "lib/courses/allocationPublish.ts",
    why: "the allocation board's account of what Publish would send, read through Publish's own plan: counts and names of people, never a word of an email or of the guide",
  },
  "app/api/courses/runs/[runId]/allocation/publish/route.ts": {
    via: "lib/courses/allocationPublish.ts",
    why: "Publish itself, which sends each facilitator the email its plan wrote, promising week 1's guide only while their group page shows it",
  },
  "app/api/courses/runs/[runId]/allocation/publish/preview/route.ts": {
    via: "lib/courses/allocationPublish.ts",
    why: "Publish's own page showing the two emails as each person will get them: the plan's first facilitators' email, saying of week 1's guide what a press would",
  },
  "app/api/courses/runs/[runId]/allocation/publish/test/route.ts": {
    via: "lib/courses/allocationPublish.ts",
    why: "Send a test to me: the plan's first facilitators' email, to the presser's own address, saying of week 1's guide what the press would",
  },
  "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/times/page.tsx": {
    via: "lib/courses/allocationPublish.ts",
    why: "the Groups tab's times, which take only the address of the facilitators' told markers from Publish's module (through groupTimes/told.ts) and never ask its plan",
  },
  "app/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/time/route.ts": {
    via: "lib/courses/allocationPublish.ts",
    why: "a group's time, changed from the Groups tab, which takes only the address of the facilitators' told markers from Publish's module and never asks its plan",
  },
  "app/api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement/route.ts": {
    via: "lib/courses/allocationPublish.ts",
    why: "an admin's proposed arrangement into groups, which reads the run's groups the way the Groups tab's times do, taking only the address of the facilitators' told markers from Publish's module and never asking its plan",
  },
  "app/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/route.ts": {
    via: "lib/courses/allocationPublish.ts",
    why: "the Groups tab's own route, which takes only the address of the facilitators' told markers from Publish's module and never asks its plan",
  },
};

/** The store's reads that hand a document's words or titles back. */
const READS = /\b(?:readGuideIndex|readGuidePage|readGuideSlot|saveGuideSlot)\(/;

/** What `path` reaches when `skip` is taken out of the tree. */
function reachWithout(path, skip) {
  const seen = new Set([path]);
  const queue = [path];
  while (queue.length > 0) {
    for (const next of importsOf(queue.shift())) {
      if (next === skip || !FILES.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

describe("2. every page and route that reaches the guide asks the gate first", () => {
  test("everything that reaches the store is listed, and everything listed reaches it", () => {
    const reaching = [...FILES.keys()]
      .filter((path) => path !== STORE && (isEntry(path) || importsOf(path).includes(STORE)) && reach(path).has(STORE))
      .sort();
    assert.deepEqual(
      reaching,
      [...Object.keys(READERS), ...Object.keys(THROUGH)].sort(),
      "these reach the facilitator guide's store and are not listed, or are listed and no longer reach it. A page or " +
        "route that reads the guide asks facilitatorGuideReader (or facilitatorGuideWriter, for loading) before it reads, " +
        "and is listed here with why its readers may see what it shows.",
    );
  });

  test("each one calls its gate, before the first read", () => {
    for (const [path, { gate, why }] of Object.entries(READERS)) {
      assert.ok(why.length > 60, `${path} needs its reason written down`);
      const code = FILES.get(path).code;
      if (gate === null) {
        assert.doesNotMatch(code, READS, `${path} is listed as reading no document, and reads one`);
        assert.match(code, /\bcourseGuideRefs\(|\bcountCourseGuide\(/, `${path} no longer reaches the store`);
        continue;
      }
      const gateAt = code.indexOf(gate);
      const readAt = code.search(READS);
      assert.ok(gateAt >= 0, `${path} does not call ${gate}`);
      assert.ok(readAt < 0 || gateAt < readAt, `${path} reads the guide before it asks ${gate}`);
    }
  });

  test("what reaches it through the destroy engine reaches it no other way, and reads nothing", () => {
    for (const [path, { via, why }] of Object.entries(THROUGH)) {
      assert.ok(why.length > 60, `${path} needs its reason written down`);
      assert.ok(Object.hasOwn(READERS, via), `${path} names ${via}, which is not listed as a reader`);
      assert.equal(reachWithout(path, via).has(STORE), false, `${path} reaches the store some other way than through ${via}`);
      assert.doesNotMatch(FILES.get(path).code, READS, `${path} reads the guide itself`);
    }
  });

  test("the proof of the gate is minted in its own file and nowhere else", () => {
    const minting = [...FILES]
      .filter(([, { code }]) => /\bas\s+Guide(?:Reader|Writer)\b/.test(code))
      .map(([path]) => path);
    assert.deepEqual(minting, [ACCESS]);
    for (const read of ["readGuideIndex", "readGuidePage"]) {
      assert.match(FILES.get(STORE).code, new RegExp(`export async function ${read}\\(db: Firestore, reader: GuideReader`), read);
    }
    for (const write of ["readGuideSlot", "saveGuideSlot"]) {
      assert.match(FILES.get(STORE).code, new RegExp(`export async function ${write}\\(db: Firestore, writer: GuideWriter`), write);
    }
  });

  test("nothing in the browser reaches the store or the gate", () => {
    const offenders = [...FILES]
      .filter(([path, { client }]) => client && (reach(path).has(STORE) || reach(path).has(ACCESS)))
      .map(([path]) => path);
    assert.deepEqual(offenders, []);
    // The scan sees a client file reach what it imports: the paste card reaches the model.
    assert.ok(reach("features/courses/facilitatorGuide/FacilitatorGuideLoader.tsx").has("lib/courses/facilitatorGuide/model.ts"));
  });

  test("the gate admits the three, through the bars that stand", () => {
    const code = FILES.get(ACCESS).code;
    assert.match(code, /if \(user\.role === "admin"\) return mintReader\(courseId, course\.title, "admin"\);/);
    assert.match(code, /isNamedWithStanding\(user, "courseGroups\.facilitatorUids", group\.facilitatorUids\)/);
    assert.match(code, /if \(group\.archived \|\|/);
    assert.match(code, /if \(await programmeLedBy\(db, user, doc\.id\)\) return true;/);
    // The loader's gate admits an admin on an id that is one, and the lead the
    // reader admits (the Weeks tab's guide box, board pr-weeks), on a course
    // that is there and not being destroyed; nobody else.
    assert.match(code, /if \(!isAddressableId\(courseId\)\) return null;\s*if \(user\.role === "admin"\) return \{ courseId \} as GuideWriter;/);
    assert.match(code, /if \(!\(await liveCourse\(db, courseId\)\)\) return null;\s*if \(await leadsOnCourse\(db, user, courseId\)\) return \{ courseId \} as GuideWriter;\s*return null;/);
  });
});

// ---------------------------------------------------------------------------
// 3. No week carries it
// ---------------------------------------------------------------------------

/** The guide's modules a writer of weeks must never reach: everything of it but the refusal. */
const GUIDE_MODULES = [...FILES.keys()].filter(
  (path) => (path.startsWith("lib/courses/facilitatorGuide/") || path.startsWith("features/courses/facilitatorGuide/") || path === RECORD) && path !== RECOGNISE,
);

/** A file that writes a week's document: a run's, a course's, a template's or a group's copy. */
function writesWeeks(code) {
  const namesWeeks = /\.collection\(\s*["']weeks["']\s*\)|["']weeks["']\s*,\s*\w+\s*\)|\/weeks\/\$\{/.test(code);
  const writes = /\.(?:set|update|create)\(|\bsetDoc\(|\bupdateDoc\(|\bwriteBatch\(|\.batch\(\)/.test(code);
  return namesWeeks && writes;
}

/**
 * Writers of weeks that may reach the guide, and why that carries nothing of
 * it into a week.
 */
const DELETES_BOTH = {
  "lib/firestore/courseDeletion.ts":
    "the destroy engine deletes a run's weeks and, with a course, the course's guide: it writes nothing of either into the other, and reads nothing a guide document says",
  "app/api/courses/runs/[runId]/allocation/route.ts":
    "the allocation board's read, which writes no week (the scan reads a map's set beside its read of each group's forked weeks as a write) and reaches the guide only through Publish's plan, which reads which weeks of the guide are loaded and nothing they say",
};

describe("3. no week ever carries facilitator material", () => {
  const writers = [...FILES].filter(([, { code }]) => writesWeeks(code)).map(([path]) => path);

  test("the scan finds the writers of weeks", () => {
    for (const path of [
      "app/api/courses/runs/[runId]/weeks/[weekId]/blocks/route.ts",
      "features/courses/courseMutations.ts",
      "app/api/courses/runs/[runId]/clone-weeks/route.ts",
    ]) {
      assert.ok(writers.includes(path), `the scan no longer sees ${path} write a week`);
    }
    assert.ok(GUIDE_MODULES.includes(STORE) && GUIDE_MODULES.includes(RECORD) && !GUIDE_MODULES.includes(RECOGNISE));
  });

  test("no writer of weeks reaches the guide, beyond the module that refuses it", () => {
    const offenders = [];
    for (const path of writers) {
      if (Object.hasOwn(DELETES_BOTH, path)) continue;
      for (const reached of reach(path)) if (GUIDE_MODULES.includes(reached)) offenders.push(`${path} reaches ${reached}`);
    }
    for (const [path, why] of Object.entries(DELETES_BOTH)) {
      assert.ok(writers.includes(path), `${path} is listed and no longer writes a week`);
      assert.ok(why.length > 60, `${path} needs its reason written down`);
      assert.doesNotMatch(FILES.get(path).code, READS, `${path} reads a guide document`);
    }
    assert.deepEqual(offenders, [], "a file that writes a week's document reaches the facilitator guide: anyone signed in can read a week");
    // The week loader does reach the refusal, which is how it refuses.
    assert.ok(reach("app/api/courses/runs/[runId]/weeks/[weekId]/blocks/route.ts").has(RECOGNISE));
  });

  test("a week's document has no field for it", () => {
    const courses = FILES.get("lib/firestore/courses.ts").code;
    const type = /export type CourseWeekDoc = \{([\s\S]*?)\n\};/.exec(courses);
    assert.ok(type, "CourseWeekDoc is no longer a type literal");
    const fields = [...type[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1]);
    assert.ok(fields.includes("blocks") && fields.includes("published"), "the scan no longer reads the week's fields");
    assert.deepEqual(fields.filter((field) => /facilitat|sessionPlan|weekNotes|answerKey|printable|guide$/i.test(field)), []);
  });

  test("the week loader refuses it before anything can be saved", () => {
    const paste = FILES.get("lib/courses/weekBlocks/paste.ts").code;
    assert.match(paste, /const material = facilitatorMaterialIn\(input\.markdown\);\s*if \(material\) problems\.unshift\(material\);/);
    const route = FILES.get("app/api/courses/runs/[runId]/weeks/[weekId]/blocks/route.ts").code;
    assert.match(route, /if \(read\.problems\.length > 0\) return badRequest\(read\.problems\[0\], answer\);/);
    // Every write the route makes (the save onto a week's page, and the first save that makes the page) comes after the refusal.
    const refusal = route.indexOf("read.problems.length > 0");
    const writes = [...route.matchAll(/\.(?:update|create|set)\(/g)].map((match) => match.index);
    assert.ok(refusal > 0 && writes.length >= 2, "the scan no longer sees the week loader's refusal and its writes");
    for (const at of writes) assert.ok(refusal < at, "the week loader writes before it refuses");
  });
});

// ---------------------------------------------------------------------------
// 4. The rules
// ---------------------------------------------------------------------------

describe("4. firestore.rules shuts the collection to every browser", () => {
  test("a block of its own, refusing every read and write", () => {
    const rules = readFileSync(join(REPO_ROOT, "firestore.rules"), "utf8");
    assert.match(rules, /match \/courseFacilitatorGuide\/\{docId\} \{\s*allow read, write: if false;\s*\}/);
  });
});

// ---------------------------------------------------------------------------
// The scanner's own reading, on synthetic code
// ---------------------------------------------------------------------------

test("the scanner reads what it claims to", () => {
  assert.equal(writesWeeks('db.collection("courseRuns").doc(r).collection("weeks").doc(w).update({ blocks })'), true);
  assert.equal(writesWeeks('await setDoc(doc(db, "courseRuns", runId, "weeks", weekId), data)'), true);
  assert.equal(writesWeeks('db.collection("courseRuns").doc(r).collection("weeks").get()'), false);
  assert.equal(writesWeeks('db.collection("courses").doc(c).update({ title })'), false);
  assert.match('return { courseId } as GuideWriter;', /\bas\s+Guide(?:Reader|Writer)\b/);
  assert.equal(READS.test("const index = await readGuideIndex(db, reader);"), true);
  assert.equal(READS.test("courseGuideRefs(db, courseId)"), false);
});
