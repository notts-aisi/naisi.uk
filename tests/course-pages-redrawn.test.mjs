/**
 * THE COURSES LIST AND A COURSE'S OWN PAGE, REDRAWN IN THE NEWER PAGES
 * (run via `npm test`; no emulator, no credentials).
 *
 *   /admin/courses              the Courses list
 *   /admin/courses/[courseId]   a course's own page
 *
 * ## What this guards
 *
 *  1. THE WORDS: the sentences the pages say, a run's stage in Course run's
 *     words for all six stored statuses, the numbers through the house
 *     format, no dashes, and nothing about a course's collaborators (nobody
 *     can be one).
 *  2. THE RUNS CARD AS EVERY KIND OF READER: what `readRunProgrammes` hands
 *     the page for a run a programme names, as an admin, the programme's
 *     lead, a reviewer, another programme's lead, a course drafter or
 *     approver named on nothing, a lead who no longer stands; a run no
 *     programme names, an archived run, a run two programmes name, a read
 *     that fails. Nothing of the form but a name and an address leaves the
 *     server.
 *  3. WHAT EACH ROW SHOWS: Open the programme only with an address, the older
 *     run page only for a run no programme names, words alone otherwise, and
 *     archived runs folded, never dropped.
 *  4. EVERY CARD READS AND WRITES AS BEFORE: the same client reads, the same
 *     client writes under the same rules, the same routes behind the cards,
 *     and the same who-may (the crest an admin's, the guide an admin's, New
 *     course for whoever the create rule admits). No run is made here.
 *  5. THE PAGES: the same gate, asked again on the course's page before its
 *     server read; the view-as closure is the admin area's, unchanged.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { session } from "./lib/applicationsSmallTerm.mjs";
import { AGI, CAST, COURSE, ROUND, RUN, TAIS, makeWorld, namedSeed, seedWorld } from "./lib/handoverWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(REPO_ROOT, ...parts), "utf8");

const made = makeWorld("__coursePages");
const { world, reset, lib } = made;
const W = await lib("courses", "coursePage", "words.ts");
const L = await lib("courses", "coursePage", "runProgrammes.ts");

const EDITOR = read("src", "features", "courses", "CourseEditor.tsx");
const LIST = read("src", "features", "courses", "CoursesList.tsx");
const STRIP = read("src", "features", "courses", "CourseSectionStrip.tsx");
const WORDS = read("src", "lib", "courses", "coursePage", "words.ts");
const LOADER = read("src", "lib", "courses", "coursePage", "runProgrammes.ts");
const COURSE_PAGE = read("src", "app", "(app)", "admin", "courses", "[courseId]", "page.tsx");
const LIST_PAGE = read("src", "app", "(app)", "admin", "courses", "page.tsx");
const RULES = read("firestore.rules");

const NO_PERMISSIONS = session("x", "member", false, "x").permissions;
const withPerms = (who, perms, over = {}) => ({ ...who, permissions: { ...NO_PERMISSIONS, ...perms }, ...over });

/** Every kind of reader the courses tree admits, with what each is to AGI Strategy. */
const READERS = {
  admin: CAST.zach,
  // AGI Strategy's lead, holding draftCourse; appointing a lead sets the admissions flag.
  lead: withPerms(CAST.claudia, { draftCourse: true }, { admissionsReviewer: true }),
  // The same lead, with SU recognition taken away: named, and no longer standing.
  leadNoLongerStanding: withPerms(CAST.claudia, { draftCourse: true }, { admissionsReviewer: true, suRecognised: false }),
  // AGI Strategy's reviewer, holding approveCourse.
  reviewer: withPerms(CAST.lloyd, { approveCourse: true }, { admissionsReviewer: true }),
  // The lead of the other two programmes, holding draftCourse.
  otherLead: withPerms(CAST.tess, { draftCourse: true }, { admissionsReviewer: true }),
  // A course approver named on nothing.
  approver: withPerms(CAST.yusuf, { approveCourse: true }),
  // A member holding draftCourse, named on nothing.
  drafter: withPerms(CAST.amara, { draftCourse: true }),
};

const overview = (programmeId) =>
  `/admin/admissions/forms/${encodeURIComponent(ROUND)}/programmes/${encodeURIComponent(programmeId)}/overview`;

const runsFor = (reader, courseId = COURSE.agi) => L.readRunProgrammes(world.db, reader, courseId);

beforeEach(() => {
  // AGI Strategy names the AGI course's autumn run; its spring run is named by nobody.
  reset(namedSeed());
});

// ---------------------------------------------------------------------------
// 1. The words
// ---------------------------------------------------------------------------

describe("1. the words", () => {
  test("the pages' own sentences, word for word", () => {
    assert.equal(
      W.COURSES_INTRO,
      "A course outlives its terms: what it teaches, its public page, crest, rubric and guide. Each term runs it on a programme.",
    );
    assert.equal(W.PUBLIC_PAGE_TITLE, "Public page");
    assert.equal(W.EDIT_PUBLIC_PAGE, "Edit the public page");
    assert.equal(W.PUBLIC_PAGE_NOTE, "The pitch, the essentials, week by week, how the term goes, questions people ask and artwork.");
    assert.equal(W.RUNS_TITLE, "Runs");
    assert.equal(W.OPEN_THE_PROGRAMME, "Open the programme");
    assert.equal(W.WHERE_A_RUN_IS_MADE, "A run is made, changed and closed on its programme’s Settings, under Course run.");
    assert.equal(W.OPEN_THE_RUN, "Open the run");
    assert.deepEqual(Object.values(W.COURSE_COLUMNS), ["Course", "Track", "Status", "Level", "Weekly hours", "Runs"]);
    assert.deepEqual(
      W.COURSE_SECTIONS.map((section) => section.label),
      ["Details", "Public page", "Runs", "Crest", "Rubric", "Routes and deadlines", "Sealed predictions", "Facilitator guide", "Publishing", "Careful"],
    );
  });

  test("a run's stage is said as Course run says it, for all six stored statuses", () => {
    assert.deepEqual(
      ["draft", "applications-open", "applications-closed", "running", "completed", "cancelled"].map(W.runStageLabel),
      ["Draft", "Running", "Running", "Running", "Completed", "Cancelled"],
    );
    assert.equal(W.listRunWords({ id: "r", label: "Autumn 2026", status: "applications-open" }), "Autumn 2026, running");
    assert.equal(W.listRunWords({ id: "r", label: "  ", status: "draft" }), "r, draft");
    assert.equal(W.namedOnWords("running", "AGI Strategy, Autumn 2026"), "Running · named on AGI Strategy, Autumn 2026");
    assert.equal(W.namedByNoneWords("completed"), "Completed · no programme names it");
    assert.equal(W.programmeNameWords("AGI Strategy", "Autumn 2026"), "AGI Strategy, Autumn 2026");
    assert.equal(W.programmeNameWords("AGI Strategy", " "), "AGI Strategy");
  });

  test("numbers go through the house format", () => {
    assert.equal(W.upToHoursWords(5), "Up to 5");
    assert.equal(W.hoursAWeekWords(5), "up to 5 hours a week");
    assert.equal(W.hoursAWeekWords(1), "up to 1 hour a week");
    assert.equal(W.archivedCoursesWords(0), "Archived courses (0)");
    assert.equal(W.archivedRunsWords(1200), "Archived runs (1,200)");
    assert.match(WORDS, /new Intl\.NumberFormat\("en-GB"\)/);
    for (const source of [WORDS, EDITOR, LIST, STRIP]) assert.doesNotMatch(source, /toLocaleString\(/);
  });

  test("no dashes in the new words, and nobody is called the course's collaborator", () => {
    assert.doesNotMatch(WORDS, /[–—]/);
    for (const source of [WORDS, EDITOR, LIST, STRIP, LOADER, COURSE_PAGE, LIST_PAGE]) {
      assert.doesNotMatch(source, /collaborator/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The Runs card as every kind of reader
// ---------------------------------------------------------------------------

describe("2. what the server hands the Runs card", () => {
  test("an admin: the run AGI Strategy names, with its Overview; the run nobody names is absent", async () => {
    assert.deepEqual(await runsFor(READERS.admin), {
      [RUN.agi]: { name: "AGI Strategy, Autumn 2026", href: overview(AGI) },
    });
  });

  test("the programme's lead: its Overview too", async () => {
    assert.deepEqual(await runsFor(READERS.lead), {
      [RUN.agi]: { name: "AGI Strategy, Autumn 2026", href: overview(AGI) },
    });
  });

  for (const [kind, what] of [
    ["leadNoLongerStanding", "a lead who no longer meets the bar"],
    ["reviewer", "the programme's reviewer"],
    ["otherLead", "another programme's lead"],
    ["approver", "a course approver named on nothing"],
    ["drafter", "a course drafter named on nothing"],
  ]) {
    test(`${what}: the programme's name, and no address`, async () => {
      assert.deepEqual(await runsFor(READERS[kind]), {
        [RUN.agi]: { name: "AGI Strategy, Autumn 2026", href: null },
      });
    });
  }

  test("a lead the admissions pages would turn away is offered no address either", async () => {
    const unflagged = { ...READERS.lead, admissionsReviewer: false };
    assert.deepEqual(await runsFor(unflagged), { [RUN.agi]: { name: "AGI Strategy, Autumn 2026", href: null } });
  });

  test("another course's runs: its own programme, and nothing of this course's", async () => {
    reset(seedWorld());
    const seed = namedSeed();
    seed[`admissionRounds/${ROUND}`].programmes[TAIS].runId = RUN.tais;
    reset(seed);
    assert.deepEqual(await runsFor(READERS.admin, COURSE.tais), {
      [RUN.tais]: { name: "Technical AI Safety, Autumn 2026", href: overview(TAIS) },
    });
    assert.deepEqual(Object.keys(await runsFor(READERS.admin)), [RUN.agi]);
  });

  test("an archived run a programme names is still named", async () => {
    const seed = namedSeed();
    seed[`courseRuns/${RUN.agi}`].archived = true;
    seed[`courseRuns/${RUN.agi}`].status = "completed";
    reset(seed);
    assert.deepEqual(await runsFor(READERS.admin), {
      [RUN.agi]: { name: "AGI Strategy, Autumn 2026", href: overview(AGI) },
    });
  });

  test("a run no programme names is absent, so its row links to its older page", async () => {
    reset(seedWorld());
    assert.deepEqual(await runsFor(READERS.admin), {});
  });

  test("a run two programmes name is named by nobody, as readNamingProgramme answers", async () => {
    const seed = namedSeed();
    seed[`admissionRounds/${ROUND}`].programmes[TAIS].runId = RUN.agi;
    reset(seed);
    assert.deepEqual(await runsFor(READERS.admin), {});
  });

  test("a read that fails is null, and the card then says only each run's stage", async () => {
    const broken = { collection: () => { throw new Error("down"); } };
    assert.equal(await L.readRunProgrammes(broken, READERS.admin, COURSE.agi), null);
  });

  test("an id that names no document reads nothing", async () => {
    assert.deepEqual(await runsFor(READERS.admin, "a/b"), {});
  });

  test("nothing of the form but a name and an address leaves the server", async () => {
    const said = JSON.stringify(await runsFor(READERS.admin));
    for (const uid of ["claudia", "lloyd", "tess", "zach"]) assert.ok(!said.includes(uid), `${uid} is in the answer`);
    for (const row of Object.values(await runsFor(READERS.admin))) assert.deepEqual(Object.keys(row).sort(), ["href", "name"]);
  });

  test("the address is decided by the Overview's own two questions, in one place", () => {
    assert.match(LOADER, /import "server-only";/);
    assert.match(LOADER, /opensProgrammeGroups\(roleOnProgramme\(reader, form, naming\.programmeId\)\)/);
    assert.match(
      LOADER,
      /canAuthorAdmissionRound\(reader\) \|\|\s*\(reader\.admissionsReviewer === true && holdsStanding\(reader, "admissionRounds\.reviewerUids"\)\)/,
    );
    assert.match(LOADER, /const naming = namingProgrammeIn\(forms, run\.id\);/);
    assert.match(LOADER, /listForms\(db\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. What each row shows
// ---------------------------------------------------------------------------

describe("3. a run's row on a course's page", () => {
  const OLDER = { kind: "older-run" };
  const rowsFor = async (reader) => {
    const programmes = await runsFor(reader);
    return [RUN.agi, RUN.agiSpring].map((id) => W.runRowView({ id, status: world.db.read(`courseRuns/${id}`).status }, programmes));
  };

  test("an admin and the programme's lead: Open the programme on the run it names, the older run page on the one it does not", async () => {
    for (const reader of [READERS.admin, READERS.lead]) {
      assert.deepEqual(await rowsFor(reader), [
        { line: "Running · named on AGI Strategy, Autumn 2026", opens: { kind: "programme", href: overview(AGI) } },
        { line: "Draft · no programme names it", opens: OLDER },
      ]);
    }
  });

  for (const kind of ["leadNoLongerStanding", "reviewer", "otherLead", "approver", "drafter"]) {
    test(`${kind}: the run a programme names leads to its older page, so nobody loses the way in`, async () => {
      assert.deepEqual(await rowsFor(READERS[kind]), [
        { line: "Running · named on AGI Strategy, Autumn 2026", opens: OLDER },
        { line: "Draft · no programme names it", opens: OLDER },
      ]);
    });
  }

  test("an archived run a programme names: the same row, in the fold", async () => {
    const seed = namedSeed();
    seed[`courseRuns/${RUN.agi}`].archived = true;
    seed[`courseRuns/${RUN.agi}`].status = "completed";
    reset(seed);
    assert.deepEqual((await rowsFor(READERS.admin))[0], {
      line: "Completed · named on AGI Strategy, Autumn 2026",
      opens: { kind: "programme", href: overview(AGI) },
    });
    assert.deepEqual((await rowsFor(READERS.approver))[0], { line: "Completed · named on AGI Strategy, Autumn 2026", opens: OLDER });
  });

  test("when the server could not say: the stage alone, and the older run page", () => {
    assert.deepEqual(W.runRowView({ id: RUN.agi, status: "applications-open" }, null), { line: "Running", opens: OLDER });
  });

  test("a run id that is a name every object carries is no run's programme", () => {
    assert.deepEqual(W.runRowView({ id: "constructor", status: "draft" }, {}), { line: "Draft · no programme names it", opens: OLDER });
  });

  test("the row draws exactly what runRowView says, and builds the older run page's address in one place", () => {
    assert.match(EDITOR, /const view = runRowView\(run, programmes\);/);
    assert.match(
      EDITOR,
      /\{view\.opens\.kind === "programme" \? \(\s*<Link href=\{view\.opens\.href\} className=\{page\.action\}>\s*\{OPEN_THE_PROGRAMME\}\s*<\/Link>\s*\) : \(\s*<Link\s+href=\{`\/admin\/courses\/\$\{encodeURIComponent\(courseId\)\}\/runs\/\$\{encodeURIComponent\(run\.id\)\}`\}\s+className=\{page\.action\}\s*>\s*\{OPEN_THE_RUN\}\s*<\/Link>\s*\)\}/,
    );
    assert.equal((EDITOR.match(/\/runs\//g) ?? []).length, 1, "a course's page has one way to an older run page");
  });

  test("no run is made, and none is opened, from the list or the course's page", () => {
    assert.doesNotMatch(EDITOR, /createRun|New run|Create run|Show archived|Refresh/);
    assert.doesNotMatch(LIST, /\/runs\//);
    assert.match(EDITOR, /\{WHERE_A_RUN_IS_MADE\}/);
  });

  test("the list names each course's live runs, earliest first, in Course run's words", () => {
    assert.match(LIST, /if \(run\.archived\) continue;/);
    assert.match(LIST, /list\.sort\(\(a, b\) => a\.startDate\.localeCompare\(b\.startDate\)\)/);
    assert.match(LIST, /runs\.map\(listRunWords\)\.join\(LIST_RUNS_JOIN\)/);
    assert.match(LIST, /c\.status !== "archived"/);
    assert.match(LIST, /\{archivedCoursesWords\(archivedCourses\.length\)\}/);
  });
});

// ---------------------------------------------------------------------------
// 4. Every card reads and writes as before
// ---------------------------------------------------------------------------

describe("4. each card's reads and writes", () => {
  test("the course and its runs are read client-direct by the same hooks", () => {
    assert.match(EDITOR, /const \{ items: courses, loading, error, reload \} = useCourses\(\);/);
    assert.match(EDITOR, /const runs = useCourseRuns\(courseId\);/);
    assert.match(LIST, /const \{ items: courses, loading, error \} = useCourses\(\);/);
    assert.match(LIST, /await getDocs\(collection\(db, "courseRuns"\)\)/);
  });

  test("details, credit and introduction: one client write, with the same fields", () => {
    assert.match(EDITOR, /import \{ publishCourse, saveCourseCrest, updateCourse \} from "\.\/courseMutations";/);
    assert.match(
      EDITOR,
      /await updateCourse\(courseId, \{\s*title,\s*tagline,\s*track: meta\.track,\s*level: meta\.level,\s*estimatedWeeklyHours: hours,\s*dayBeforeDueTime,\s*credit,\s*summaryBlocks: meta\.summaryBlocks,\s*\}\);/,
    );
    assert.equal((EDITOR.match(/updateCourse\(/g) ?? []).length, 1);
  });

  test("the crest through its route, and an admin's alone to change", () => {
    assert.match(EDITOR, /await saveCourseCrest\(courseId, next\);/);
    assert.match(EDITOR, /if \(!isAdmin\) return;/);
    assert.match(EDITOR, /disabled=\{saving \|\| !isAdmin\}/);
    assert.match(EDITOR, /"Only an admin can change the crest\."/);
  });

  test("publishing through its route, behind the same question", () => {
    assert.match(EDITOR, /await publishCourse\(courseId, target\);/);
    assert.match(EDITOR, /<Button onClick=\{\(\) => setConfirmingPublish\(true\)\} disabled=\{saving\}>/);
  });

  test("the rubric, routes, predictions and danger zone cards are the same cards, handed the same things", () => {
    assert.match(EDITOR, /<CourseRubricCard key=\{`rubric-\$\{course\.id\}`\} courseId=\{course\.id\} stored=\{course\.rubric\} isAdmin=\{isAdmin\} \/>/);
    assert.match(EDITOR, /<CourseRoutesCard key=\{`routes-\$\{course\.id\}`\} courseId=\{course\.id\} stored=\{course\.routes\} \/>/);
    assert.match(EDITOR, /<CoursePredictionsCard key=\{`predictions-\$\{course\.id\}`\} courseId=\{course\.id\} stored=\{course\.predictionCard\} \/>/);
    assert.match(EDITOR, /<CourseDangerZone course=\{course\} runAction=\{runAction\} onArchived=\{reload\} \/>/);
  });

  test("the facilitator guide's section and its strip entry are an admin's alone", () => {
    assert.match(EDITOR, /\{isAdmin && \(\s*<section id="guide"/);
    assert.match(EDITOR, /COURSE_SECTIONS\.filter\(\(section\) => section\.id !== "guide" \|\| isAdmin\)/);
  });

  test("the public page card opens today's editor at its own address", () => {
    assert.match(EDITOR, /<Link href=\{`\/admin\/courses\/\$\{encodeURIComponent\(courseId\)\}\/page`\} className=\{page\.action\}>\s*\{EDIT_PUBLIC_PAGE\}/);
  });

  test("New course writes as it did, offered to whoever the create rule admits", () => {
    assert.match(LIST, /newId = await createCourse\(\{/);
    assert.match(LIST, /const mayMakeCourse = role === "admin" \|\| permissions\.draftCourse === true;/);
    assert.match(RULES, /match \/courses\/\{courseId\} \{[\s\S]*?allow create: if canDraftCourse\(\)/);
    assert.match(RULES, /function canDraftCourse\(\)\s*\{ return hasPerm\('draftCourse'\);\s*\}/);
  });

  test("the strip names every card on the page, in the cards' own order", () => {
    const onPage = [...EDITOR.matchAll(/<section id="([a-z-]+)"/g)].map((match) => match[1]);
    assert.deepEqual(onPage, W.COURSE_SECTIONS.map((section) => section.id));
  });

  test("Publishing's hint says where a run leaves draft now", () => {
    assert.match(EDITOR, /A run leaves draft on its programme’s Settings, under Course run, or on its own page when no programme names it\./);
    assert.doesNotMatch(EDITOR, /applications-open \(or later\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. The pages
// ---------------------------------------------------------------------------

describe("5. the pages", () => {
  test("a course's page asks the tree's gate again before its server read", () => {
    assert.match(COURSE_PAGE, /const \[\{ courseId \}, user\] = await Promise\.all\(\[params, requireCourseAuthorPage\(\)\]\);/);
    assert.match(COURSE_PAGE, /await readRunProgrammes\(db, user, courseId\)/);
    const layout = read("src", "app", "(app)", "admin", "courses", "layout.tsx");
    assert.match(layout, /await requireCourseAuthorPage\(\);/);
  });

  test("the list reads nothing on the server", () => {
    assert.match(LIST_PAGE, /return <CoursesList \/>;/);
    assert.doesNotMatch(LIST_PAGE, /getAdminDb|await /);
  });

  test("the view-as closure is the admin area's, over both pages", () => {
    const layout = read("src", "app", "(app)", "admin", "layout.tsx");
    assert.match(layout, /if \(viewingAs\) \{/);
  });
});
