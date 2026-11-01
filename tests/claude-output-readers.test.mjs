/**
 * WHAT CLAUDE RETURNS ABOUT A WEEK'S WORK IS AN ADMIN'S, AND STAYS WITH THE
 * RUN (privacy v15, "AI-assisted review": "What comes back is seen by admins
 * only ... kept with what it was about ... and deleted with it. Nothing of it
 * is filed on your profile"; and, under ratings, the tools' grades "are never
 * shown to you, are never a mark, and are never kept on your record").
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * THE TREE. Claude's week reviews (`courseWeekReviews`: draft grades, what
 * people found hard, who might need a hand) are written and read on the
 * server alone, by the review's own page and route after a door that admits
 * an admin, and by the two deletions. So this walks every file under `src`,
 * in both directions:
 *
 *  1. every file that ADDRESSES the collection is listed with what it does;
 *  2. every file that reaches the review's code or its record is listed with
 *     why it may, so a new reader (a member's page, a lead's tab, a
 *     facilitator's ticket, the profile) fails here until somebody decides;
 *  3. the review's loaders are called by the admin-only page and route and
 *     nothing else, the screen is drawn by that page alone, and no browser
 *     file reaches a server part of it;
 *  4. the notes kept about a person never reach any of it, nor a weekly
 *     note's drafts (`courseNoteDrafts`, which the end-of-week notes will
 *     add to the list below when they are built), so a grade or a check-in
 *     can never find its way onto somebody's record.
 *
 * The rating page's own block for an admin, Claude's grade beside the
 * team's rating once the admin has saved theirs, is not built: when it is,
 * it joins `REACHERS` with its gate, and nothing else here changes.
 *
 * EXPLAINERS (`src/lib/courses/explainers/`) start from a theme: the admin's
 * form reads one theme through the review's own store, behind its door
 * (`themeForExplainer`), and nothing else does. What an explainer keeps, and
 * every reader of it (the tickets, the overview, "Week N is open", the
 * week's page and the Surveys tab), reaches none of the review: the topic is
 * the admin's words, and that is all that leaves.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function sourceFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}
const inSrc = (path) => relative(SRC, path).split(sep).join("/");
const withoutComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const files = sourceFiles().map((path) => [inSrc(path), readFileSync(path, "utf8")]);

/** Every file that addresses a stored review, and what it does with it. */
const ADDRESSERS = {
  "lib/firestore/courseWeekReviews.ts": "the record: its shape, its normaliser and what an account's deletion takes out of it",
  "lib/courses/weekReview/store.ts":
    "the review's page loader and its press, each behind the review's door, which admits an admin alone; the one writer",
  "lib/firestore/accountDeletion.ts": "deleting an account takes it out of every review that names it",
  "lib/firestore/courseDeletion.ts": "destroying the run counts the reviews and drains them",
};

/** The weekly notes' drafts, once the end-of-week notes are built: none yet. */
const NOTE_DRAFT_ADDRESSERS = {};

/**
 * Every file outside the review's own library that reaches its code or its
 * record, and why it may. The library itself is `lib/courses/weekReview/`.
 */
const REACHERS = {
  "lib/firestore/courseWeekReviews.ts": "the record, which the library and the deletions read",
  "lib/firestore/accountDeletion.ts": "deleting an account: the record's collection and what to take out of it",
  "lib/firestore/courseDeletion.ts": "destroying the run: the record's collection",
  "app/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review/route.ts":
    "Review with Claude: refuses everybody but an admin on the session before anything is read, then the review's door",
  "app/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review/follow-up/route.ts":
    "a follow-up task from the review: refuses everybody but an admin on the session, then the review's door; carries fixed words, never what Claude said",
  "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/page.tsx":
    "the review's page: the programme's lead is drawn a calm refusal before anything is read, and an admin's page is loaded behind the review's door",
  "features/courses/weekReview/WeekReviewScreen.tsx": "the review's screen, drawn by the review's page alone, from the view it is handed",
  "features/courses/weekReview/ReviewPress.tsx": "the press: the review's words, and the route",
  "features/courses/weekReview/FollowUpButton.tsx": "the follow-up press: the review's words, and the route",
  "lib/courses/explainers/schedule.ts":
    "scheduling an explainer, an admin's alone: the review's door, and one theme's title, groups and counts for the admin's form, read through the review's own store; the record it writes holds the admin's topic and nothing of the review",
  "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/explainer/page.tsx":
    "the explainer's form, under the review: the programme's lead is drawn the review's calm refusal before anything is read, and an admin's form is loaded behind the review's door",
};

/**
 * The explainers' readers: what draws a session's ticket, the overview,
 * "Week N is open", the week's page and the Surveys tab. None of them may
 * reach the review, so a facilitator, a member or a lead never meets what
 * Claude returned.
 */
const EXPLAINER_READERS = [
  "lib/firestore/courseExplainers.ts",
  "lib/courses/explainers/readers.ts",
  "lib/courses/explainers/model.ts",
  "lib/courses/explainers/words.ts",
  "lib/courses/explainers/task.ts",
  "features/courses/explainers/ExplainerList.tsx",
  "features/courses/explainers/CancelExplainer.tsx",
  "features/courses/explainers/ExplainerForm.tsx",
];

/** What reaches the review: its record by name or import, or its library by import. */
const REACHES = /COURSE_WEEK_REVIEWS_COLLECTION|["'`]courseWeekReviews["'`]|from\s+"@\/lib\/firestore\/courseWeekReviews"|from\s+"\.\/courseWeekReviews"|from\s+"@\/lib\/courses\/weekReview\/[^"]+"|from\s+"@\/features\/courses\/weekReview\/[^"]+"/;

describe("Claude's week reviews: read by admins, on the run, never on a record", () => {
  test("the walk reads the tree", () => {
    assert.ok(files.length > 500, `the walk found only ${files.length} files: it is not reading the tree`);
  });

  test("the files that address courseWeekReviews are the record, the review's store and the two deletions", () => {
    const addressing = files
      .filter(([, code]) => /COURSE_WEEK_REVIEWS_COLLECTION|["'`]courseWeekReviews["'`]/.test(withoutComments(code)))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(addressing, Object.keys(ADDRESSERS).sort());
    for (const [file, why] of Object.entries(ADDRESSERS)) assert.ok(why.length >= 30, `${file}: a reason too short to weigh`);
  });

  test("nothing addresses a weekly note's drafts that is not listed (none is built yet)", () => {
    const addressing = files
      .filter(([, code]) => /["'`]courseNoteDrafts["'`]|COURSE_NOTE_DRAFTS_COLLECTION/.test(withoutComments(code)))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(addressing, Object.keys(NOTE_DRAFT_ADDRESSERS).sort());
  });

  test("every file outside the review's library that reaches it is listed with why it may, and every entry still does", () => {
    const reaching = files
      .filter(([file]) => !file.startsWith("lib/courses/weekReview/"))
      .filter(([, code]) => REACHES.test(withoutComments(code)))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(
      reaching,
      Object.keys(REACHERS).sort(),
      "a file reaches Claude's week review and is not listed: what Claude returns is an admin's (privacy v15), so say why this one may, or reach it from an admin-only page",
    );
    for (const [file, why] of Object.entries(REACHERS)) assert.ok(why.length >= 30, `${file}: a reason too short to weigh`);
  });

  test("the loaders are called by the admin-only page and route alone, and the screen is drawn by that page alone", () => {
    const callers = (pattern) =>
      files
        .filter(([file]) => !file.startsWith("lib/courses/weekReview/"))
        .filter(([, code]) => pattern.test(withoutComments(code)))
        .map(([file]) => file)
        .sort();
    assert.deepEqual(callers(/\bloadWeekReview\s*\(/), [
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/page.tsx",
    ]);
    assert.deepEqual(callers(/\baskWeekReview\s*\(/), [
      "app/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review/route.ts",
    ]);
    assert.deepEqual(callers(/\baskFollowUp\s*\(/), [
      "app/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review/follow-up/route.ts",
    ]);
    assert.deepEqual(callers(/from\s+"@\/features\/courses\/weekReview\/WeekReviewScreen"/), [
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/page.tsx",
    ]);
    assert.deepEqual(callers(/\bthemeForExplainer\s*\(/), ["lib/courses/explainers/schedule.ts"]);
    // Its definition aside: the explainers' own module is outside the review's library.
    assert.deepEqual(callers(/(?<!function )\bloadExplainerForm\s*\(/), [
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/explainer/page.tsx",
    ]);
  });

  test("an explainer, and everything that reads one, reaches nothing of the review: only the admin's topic leaves it", () => {
    const REVIEW = /courseWeekReviews|COURSE_WEEK_REVIEWS_COLLECTION|from\s+"@\/lib\/courses\/weekReview\/|from\s+"@\/features\/courses\/weekReview\/|\bthemeForExplainer\b/;
    for (const file of EXPLAINER_READERS) {
      const found = files.find(([path]) => path === file);
      assert.ok(found, `${file} is gone: say where the explainers' readers live now`);
      assert.doesNotMatch(withoutComments(found[1]), REVIEW, `${file} reaches Claude's week review`);
    }
    // The record keeps the admin's topic and no part of a theme.
    const record = withoutComments(files.find(([path]) => path === "lib/firestore/courseExplainers.ts")[1]);
    const shape = /export type CourseExplainerDoc = \{([\s\S]*?)\n\};/.exec(record)?.[1] ?? "";
    assert.ok(shape.length > 100, "the explainer's shape is gone");
    assert.doesNotMatch(shape, /theme|checkIns|reports|answers|grade|detail|from:/i, "an explainer keeps part of the review it came from");
  });

  test("the page refuses the lead before it loads anything, and both routes refuse everybody but an admin first", () => {
    const page = withoutComments(
      readFileSync(join(SRC, "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/page.tsx"), "utf8"),
    );
    const refusal = page.indexOf('if (view.viewer !== "admin")');
    assert.ok(refusal !== -1 && refusal < page.indexOf("loadWeekReview("), "the review page loads the review before it refuses the lead");
    // The explainer's form shows a theme's title and counts: the same order.
    const form = withoutComments(
      readFileSync(join(SRC, "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/explainer/page.tsx"), "utf8"),
    );
    const turnedAway = form.indexOf('if (view.viewer !== "admin")');
    assert.ok(turnedAway !== -1 && turnedAway < form.indexOf("loadExplainerForm("), "the explainer's page loads a theme before it refuses the lead");
    for (const route of ["review/route.ts", "review/follow-up/route.ts"]) {
      const code = withoutComments(readFileSync(join(SRC, "app/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]", route), "utf8"));
      const refused = code.indexOf("if (!canRunTerm(user)) return NextResponse.json(");
      assert.ok(refused !== -1, `${route} lets somebody other than an admin through`);
      for (const later of ["ctx.params", "req.json()", "getAdminDb()"]) assert.ok(code.indexOf(later) > refused, `${route} reads ${later} before it refuses somebody other than an admin`);
      assert.ok(code.indexOf("assertNotImpersonating()") < refused, `${route} does not turn away a view-as session first`);
    }
  });

  test("no browser file reaches the review's server code or its record", () => {
    const SERVER = /from\s+"@\/lib\/courses\/weekReview\/(?:store|gather|door|claude|followUp)"|from\s+"@\/lib\/firestore\/courseWeekReviews"/;
    for (const [file, code] of files) {
      if (!/^\s*["']use client["'];?/.test(code)) continue;
      assert.doesNotMatch(code, SERVER, `${file} is a browser file and reaches the review's server code`);
    }
    for (const file of ["store.ts", "gather.ts", "door.ts", "claude.ts", "followUp.ts"]) {
      assert.match(readFileSync(join(SRC, "lib", "courses", "weekReview", file), "utf8"), /^import "server-only";/, `${file} is not server-only`);
    }
  });

  test("the notes kept about a person never reach a review, a grade or a weekly note's drafts, and no review reaches a note", () => {
    const NOTES = (file) =>
      file.startsWith("lib/memberNotes/") ||
      file.startsWith("app/api/admin/members/[uid]/notes/") ||
      file.startsWith("app/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes/") ||
      file.startsWith("features/admin/memberNotes/");
    const notes = files.filter(([file]) => NOTES(file));
    assert.ok(notes.length >= 5, `the walk found only ${notes.length} files of the notes kept about a person`);
    for (const [file, code] of notes) {
      assert.doesNotMatch(withoutComments(code), /courseWeekReviews|weekReview|WeekReview|courseNoteDrafts|reviewPool/, `${file} reaches Claude's week review`);
    }
    for (const [file, code] of files) {
      if (!file.startsWith("lib/courses/weekReview/") && !file.startsWith("features/courses/weekReview/")) continue;
      assert.doesNotMatch(withoutComments(code), /from\s+"@\/lib\/memberNotes|MEMBER_NOTES_COLLECTION|["'`]memberNotes["'`]/, `${file} reaches the notes kept about a person`);
    }
  });

  test("every read of a review is by its address or one array-contains on one field, so none needs a declared index", () => {
    for (const file of Object.keys(ADDRESSERS)) {
      const code = withoutComments(readFileSync(join(SRC, file), "utf8"));
      for (const [, clause] of code.matchAll(/\.collection\(COURSE_WEEK_REVIEWS_COLLECTION\)((?:\s*\.where\([^)]*\))+)/g)) {
        const wheres = [...clause.matchAll(/\.where\(([^)]*)\)/g)].map((m) => m[1]);
        assert.equal(wheres.length, 1, `${file} asks ${wheres.join(" and ")}`);
      }
      assert.doesNotMatch(code, /COURSE_WEEK_REVIEWS_COLLECTION\)[^;]*\.orderBy\(/, `${file} orders reviews`);
    }
  });
});
