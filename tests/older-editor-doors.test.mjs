/**
 * THE DOORS INTO THE OLDER COURSE EDITOR (run via `npm test`).
 *
 * The older course editor (`/admin/courses/**`) is being retired: its jobs
 * move, one step at a time, to each programme's own pages. A link from a
 * newer page into the older editor is a door that keeps people using it, so
 * every door whose new home exists has been repointed, and the rest are
 * written down here, each with the step that moves it.
 *
 * Walks every file under src/ and fails on a string that starts an address
 * with `/admin/courses` in a file outside the older editor's own tree that is
 * not on the list. So a new door fails here, and so does a door moved without
 * the list being told (each listed file must still hold one).
 *
 * Also holds the line at the top of every older page: every page under
 * `src/app/(app)/admin/courses` renders it, a run's pages through the run's
 * own layout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const OLDER_PAGES = join(SRC, "app", "(app)", "admin", "courses");

/**
 * The older editor's own components, whose links stay inside it. Each is
 * mounted only by a page under src/app/(app)/admin/courses.
 */
const OLDER_TREE = new Map([
  ["src/features/courses/AdminCourseList.tsx", "the older list of courses"],
  ["src/features/courses/CourseEditor.tsx", "the older course page"],
  ["src/features/courses/CoursePageEditor.tsx", "the older public page editor"],
  ["src/features/courses/CourseDangerZone.tsx", "the older course page's archive and destroy"],
  ["src/features/courses/RunEditor.tsx", "the older run page"],
  ["src/features/courses/RunDangerZone.tsx", "the older run page's archive and destroy"],
  ["src/features/courses/WeekEditor.tsx", "the older week page"],
  ["src/features/courses/RetrospectiveView.tsx", "the older run's retrospective"],
  ["src/features/courses/AllocationBoard.tsx", "the older run's allocation board"],
  ["src/lib/courses/facilitatorGuide/model.ts", "the older course page's link to its facilitator guide loader"],
]);

/** Doors left standing on purpose, each with why and the step that moves it. */
const LEFT_FOR_LATER = new Map([
  ["src/features/applications/pitches/ProgrammePitches.tsx", "Pitches' Open the run editor: pitching week moves to the Weeks tab in step 7"],
  ["src/features/applications/teams/ProgrammeTeams.tsx", "the Teams tab's Open the run editor: pitching week moves in step 7"],
  [
    "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/copy/page.tsx",
    "the copy page's Open the run's editor: templates move to the Weeks tab in step 7",
  ],
  ["src/lib/applications/handover/load.ts", "Course run's link to the run's own applications list: the gave-back row moves in step 6"],
  [
    "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup/page.tsx",
    "Certificates' Change it on the course: the newer course page comes in step 8",
  ],
  ["src/layout/appNav.ts", "the menu's Courses entry: the older tree goes in step 8"],
  [
    "src/features/courses/GroupWeekEditor.tsx",
    "a facilitator's week editor, for an admin, on a run no programme names: there is no Weeks page to send them to",
  ],
]);

/** A string, template or quote, that starts an address in the older editor. */
const DOOR = /["'`]\/admin\/courses(?=[/"'`?#]|$)/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

const rel = (path) => relative(REPO_ROOT, path).split(sep).join("/");

/** The lines of a file that are code, not comments. */
function codeLines(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""));
}

function doorsIn(path) {
  return codeLines(readFileSync(path, "utf8"))
    .map((line, i) => ({ line: i + 1, text: line }))
    .filter(({ text }) => DOOR.test(text));
}

const files = walk(SRC);

test("no file outside the older editor links into it, but the doors left for a later step", () => {
  const strays = [];
  for (const path of files) {
    const name = rel(path);
    if (path.startsWith(OLDER_PAGES + sep)) continue;
    if (OLDER_TREE.has(name) || LEFT_FOR_LATER.has(name)) continue;
    for (const { line, text } of doorsIn(path)) strays.push(`${name}:${line}: ${text.trim()}`);
  }
  assert.deepEqual(strays, [], `a new door into /admin/courses; repoint it, or list it with a reason:\n${strays.join("\n")}`);
});

test("every listed file is there and still holds a door, so the list never outlives one", () => {
  for (const [name, why] of [...OLDER_TREE, ...LEFT_FOR_LATER]) {
    assert.ok(why.trim().length > 0, `${name} needs a reason`);
    const path = join(REPO_ROOT, ...name.split("/"));
    assert.ok(files.includes(path), `${name} is listed but not in src`);
    assert.ok(doorsIn(path).length > 0, `${name} is listed but holds no door: take it off the list`);
  }
});

test("the doors this step repointed lead to each programme's own pages", () => {
  const read = (name) => readFileSync(join(REPO_ROOT, ...name.split("/")), "utf8");
  // The Overview's "Open week N", for the lead too.
  const overview = read("src/lib/courses/programmeOverview.ts");
  assert.match(overview, /href: `\$\{programmePath\}\/weeks\/\$\{weekDocId\(card\.weekNumber\)\}`/);
  assert.match(overview, /href: `\$\{place\.programmePath\}\/weeks\/\$\{weekDocId\(weekNumber\)\}`/);
  // Get ready's Set rooms: the Groups tab's Sessions view.
  assert.match(read("src/features/applications/overview/GetReady.tsx"), /sessions: "\/groups\/sessions"/);
  // Course run's way to People in groups.
  const handover = read("src/lib/applications/handover/load.ts");
  assert.match(handover, /const boardPathFor = \(roundId: string, programmeId: string\) =>\n\s+`\/admin\/admissions\/forms\/\$\{encodeURIComponent\(roundId\)\}\/programmes\/\$\{encodeURIComponent\(programmeId\)\}\/groups`/);
  assert.match(read("src/features/applications/editor/RunHandOver.tsx"), /Open People in groups/);
  // Times and a week's page lead nowhere older.
  assert.doesNotMatch(read("src/features/applications/times/TimesPicture.tsx"), /in the run editor/);
  assert.doesNotMatch(read("src/features/applications/weeks/WeekPageView.tsx"), /Open the run’s week editor/);
});

test("every page of the older editor opens with the line that says it is being retired", () => {
  const pages = walk(OLDER_PAGES).filter((path) => path.endsWith(`${sep}page.tsx`));
  assert.ok(pages.length > 0);
  const runLayout = join(OLDER_PAGES, "[courseId]", "runs", "[runId]", "layout.tsx");
  assert.match(readFileSync(runLayout, "utf8"), /<OlderEditorLine programme=\{programme\} \/>/);
  const runTree = join(OLDER_PAGES, "[courseId]", "runs", "[runId]") + sep;
  for (const path of pages) {
    if (path.startsWith(runTree)) continue;
    assert.match(readFileSync(path, "utf8"), /<OlderEditorLine programme=\{null\} \/>/, `${rel(path)} has no line at the top`);
  }
});
