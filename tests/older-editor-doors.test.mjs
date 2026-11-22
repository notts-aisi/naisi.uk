/**
 * THE DOORS INTO THE OLDER COURSE EDITOR (run via `npm test`).
 *
 * The older course editor (`/admin/courses/**`) is being retired: its jobs
 * move, one step at a time, to each programme's own pages. A link from a
 * newer page into the older editor is a door that keeps people using it, so
 * every door whose new home exists has been repointed, and the rest are
 * written down here, one entry per door, each with the step that removes it.
 *
 * Walks every file under src/. A DOOR is a string that starts an address
 * with `/admin/courses`, or a call of an exported helper whose body builds
 * one, in every file that imports that helper. Outside the older editor's
 * own files, every door must be claimed by an entry of `DOORS` (the file,
 * a piece of the line it is on, how many such doors, why, and the step), and
 * every entry must claim exactly the doors it says. So a new door fails here,
 * a second door in a file already listed fails here, a newer page importing
 * a helper that builds an older address fails here, and an entry for a door
 * that has gone fails here.
 *
 * The older editor's own components (`OLDER_TREE`) may link inside it, and
 * each is held to being imported only from the older pages or from another
 * of them, so a newer page cannot mount one to borrow its doors.
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
const OLDER_PAGES_DIR = join(SRC, "app", "(app)", "admin", "courses");
const OLDER_PAGES = "src/app/(app)/admin/courses/";

/** The older editor's own components, whose links stay inside it. */
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
]);

/**
 * Every door outside the older tree, one entry each. `line` is a piece of
 * the source line the door is on; `count` is how many doors on such lines
 * the entry claims (1 unless said).
 */
const DOORS = [
  {
    file: "src/features/applications/pitches/ProgrammePitches.tsx",
    line: "href={`/admin/courses/${encodeURIComponent(view.run.courseId)}/runs/",
    why: "Pitches' Open the run editor, where pitching week is ticked",
    step: "step 7, when pitching week moves to the Weeks tab",
  },
  {
    file: "src/features/applications/teams/ProgrammeTeams.tsx",
    line: "href={`/admin/courses/${encodeURIComponent(view.run.courseId)}/runs/",
    why: "the Teams tab's Open the run editor, for the run's pitching settings",
    step: "step 7, with pitching week",
  },
  {
    file: "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/copy/page.tsx",
    line: "<Link href={`/admin/courses/${encodeURIComponent(run.courseId)}/runs/",
    why: "the copy page's Open the run's editor, where a saved template is copied in",
    step: "step 7, when templates move to the Weeks tab",
  },
  {
    file: "src/lib/applications/handover/load.ts",
    line: "/applications`;",
    why: "Course run's link to the run's own applications list, for somebody who gave their place back and has no seat on the run (handed over, never placed): Course run's take-off needs a seat, so their row is changed there, as before",
    step: "step 8, when the older tree goes",
  },
  {
    file: "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup/page.tsx",
    line: "changeHref={opensCourses ? `/admin/courses/",
    why: "Certificates' Change it on the course",
    step: "step 8, when the newer course page comes",
  },
  {
    file: "src/layout/appNav.ts",
    line: '{ label: "Courses", href: "/admin/courses"',
    count: 3,
    why: "the menu's Courses entry, in both menus, and the match that lights it",
    step: "step 8, when the older tree goes",
  },
  {
    file: "src/features/courses/GroupWeekEditor.tsx",
    line: "href={`/admin/courses/${encodeURIComponent(courseId)}/runs/${encodeURIComponent(runId)}/weeks/",
    why: "a facilitator's week editor, for an admin, on a run no programme names: there is no Weeks page to send them to",
    step: "step 8, when the older tree goes",
  },
  {
    file: "src/lib/courses/facilitatorGuide/model.ts",
    line: "/facilitator-guide`;",
    why: "the helper that builds the older course page's link to its facilitator guide loader; its importers are held as doors too",
    step: "step 8, when the older tree goes",
  },
];

/** A string, template or quote, that starts an address in the older editor. */
const DOOR = /["'`]\/admin\/courses(?=[/"'`?#$]|\$\{|$)/g;

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

/** Every literal door in a file: one item per occurrence, with its line. */
function literalDoors(text) {
  const out = [];
  codeLines(text).forEach((line, i) => {
    for (const _ of line.matchAll(DOOR)) out.push({ line: i + 1, text: line });
  });
  return out;
}

/**
 * The body of the function declared at `from`: from the brace after its
 * parameters to the brace that closes it, counted. Braces inside template
 * holes balance, so a count is enough for the code under src.
 */
function functionBody(code, from) {
  const params = code.indexOf("(", from);
  let depth = 0;
  let i = params;
  for (; i < code.length; i += 1) {
    if (code[i] === "(") depth += 1;
    else if (code[i] === ")" && --depth === 0) break;
  }
  const open = code.indexOf("{", i);
  depth = 0;
  for (let j = open; j < code.length; j += 1) {
    if (code[j] === "{") depth += 1;
    else if (code[j] === "}" && --depth === 0) return code.slice(open, j + 1);
  }
  return code.slice(open);
}

/** Exported functions whose body holds a literal door: name to defining file. */
function doorHelpers(sources) {
  const helpers = new Map();
  for (const [name, text] of sources) {
    const code = codeLines(text).join("\n");
    for (const start of code.matchAll(/export (?:async )?function (\w+)\s*\(/g)) {
      if (functionBody(code, start.index).match(DOOR)) helpers.set(start[1], name);
    }
  }
  return helpers;
}

/** Every call of a door helper in a file that imports it. */
function helperDoors(text, helpers) {
  const out = [];
  const code = codeLines(text);
  const joined = code.join("\n");
  for (const helper of helpers.keys()) {
    const imported = new RegExp(`import\\s*(?:type\\s*)?\\{[^}]*\\b${helper}\\b[^}]*\\}\\s*from`).test(joined);
    if (!imported) continue;
    code.forEach((line, i) => {
      if (/^\s*import\b/.test(line)) return;
      for (const _ of line.matchAll(new RegExp(`\\b${helper}\\(`, "g"))) out.push({ line: i + 1, text: line, helper });
    });
  }
  return out;
}

const inOlderTree = (name) => name.startsWith(OLDER_PAGES) || OLDER_TREE.has(name);

/**
 * Every problem with the doors in `sources` (a map of repo-relative path to
 * text): a door no entry claims, an entry that claims a different number of
 * doors than it says, an entry for a file that is not there, and an older
 * component imported from outside the older tree.
 */
export function doorProblems(sources) {
  const problems = [];
  const helpers = doorHelpers(sources);
  const claimed = new Map(DOORS.map((entry) => [entry, 0]));
  for (const [name, text] of sources) {
    if (inOlderTree(name)) continue;
    const doors = [...literalDoors(text), ...helperDoors(text, helpers)];
    for (const door of doors) {
      const entry = DOORS.find((each) => each.file === name && door.text.includes(each.line));
      if (entry) claimed.set(entry, claimed.get(entry) + 1);
      else problems.push(`${name}:${door.line}: a door into /admin/courses no entry claims: ${door.text.trim()}`);
    }
  }
  for (const [entry, found] of claimed) {
    if (!sources.has(entry.file)) problems.push(`${entry.file} is listed but not in src`);
    else if (found !== (entry.count ?? 1)) problems.push(`${entry.file}: the entry claims ${entry.count ?? 1} door(s) and ${found} found`);
  }
  for (const component of OLDER_TREE.keys()) {
    const base = component.split("/").pop().replace(/\.tsx?$/, "");
    const asAlias = new RegExp(`from\\s+["']@/features/courses/${base}["']`);
    const asRelative = new RegExp(`from\\s+["']\\./${base}["']`);
    for (const [name, text] of sources) {
      if (name === component) continue;
      const imports = asAlias.test(text) || (name.startsWith("src/features/courses/") && !name.slice("src/features/courses/".length).includes("/") && asRelative.test(text));
      if (imports && !inOlderTree(name)) problems.push(`${name} imports ${component}, which is the older editor's own`);
    }
  }
  return problems;
}

const files = walk(SRC);
const SOURCES = new Map(files.map((path) => [rel(path), readFileSync(path, "utf8")]));

test("every door outside the older editor is an entry of its own, and every entry claims exactly its doors", () => {
  assert.deepEqual(doorProblems(SOURCES), []);
});

test("every entry says why and the step that removes it", () => {
  for (const entry of DOORS) {
    assert.ok(entry.why.trim() && entry.step.trim(), `${entry.file} needs a reason and a step`);
    assert.match(entry.step, /^step \d/, `${entry.file}: name the step`);
  }
  for (const [name, why] of OLDER_TREE) assert.ok(why.trim(), `${name} needs a reason`);
});

test("the guard itself: a second door in a listed file fails", () => {
  const name = "src/features/courses/GroupWeekEditor.tsx";
  const sources = new Map(SOURCES);
  sources.set(name, `${sources.get(name)}\nexport const other = \`/admin/courses/\${id}/runs/\${run}\`;\n`);
  const problems = doorProblems(sources);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /^src\/features\/courses\/GroupWeekEditor\.tsx:\d+: a door into \/admin\/courses no entry claims/);
});

test("the guard itself: a newer page calling a helper that builds an older address fails", () => {
  const sources = new Map(SOURCES);
  sources.set(
    "src/features/applications/made-up/Page.tsx",
    'import { facilitatorGuideAdminPath } from "@/lib/courses/facilitatorGuide/model";\nexport const href = facilitatorGuideAdminPath(courseId);\n',
  );
  const problems = doorProblems(sources);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /made-up\/Page\.tsx:2: a door .* facilitatorGuideAdminPath\(courseId\)/);
});

test("the guard itself: a newer page mounting an older component, and an entry whose door has gone, fail", () => {
  const sources = new Map(SOURCES);
  sources.set("src/features/applications/made-up/Mount.tsx", 'import RunEditor from "@/features/courses/RunEditor";\n');
  const teams = "src/features/applications/teams/ProgrammeTeams.tsx";
  sources.set(teams, sources.get(teams).replaceAll("`/admin/courses/", "`/admin/elsewhere/"));
  const problems = doorProblems(sources);
  assert.deepEqual(problems.sort(), [
    "src/features/applications/made-up/Mount.tsx imports src/features/courses/RunEditor.tsx, which is the older editor's own",
    `${teams}: the entry claims 1 door(s) and 0 found`,
  ]);
});

test("the doors this step repointed lead to each programme's own pages", () => {
  const read = (name) => SOURCES.get(name);
  // The Overview's "Open week N", for the lead too.
  const overview = read("src/lib/courses/programmeOverview.ts");
  assert.match(overview, /href: `\$\{programmePath\}\/weeks\/\$\{weekDocId\(card\.weekNumber\)\}`/);
  assert.match(overview, /href: `\$\{place\.programmePath\}\/weeks\/\$\{weekDocId\(weekNumber\)\}`/);
  // Get ready's Set rooms: the Groups tab's All groups view (its address is still /groups/sessions).
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
  const pages = walk(OLDER_PAGES_DIR).filter((path) => path.endsWith(`${sep}page.tsx`));
  assert.ok(pages.length > 0);
  const runLayout = join(OLDER_PAGES_DIR, "[courseId]", "runs", "[runId]", "layout.tsx");
  assert.match(readFileSync(runLayout, "utf8"), /<OlderEditorLine programme=\{programme\} \/>/);
  const runTree = join(OLDER_PAGES_DIR, "[courseId]", "runs", "[runId]") + sep;
  for (const path of pages) {
    if (path.startsWith(runTree)) continue;
    assert.match(readFileSync(path, "utf8"), /<OlderEditorLine programme=\{null\} \/>/, `${rel(path)} has no line at the top`);
  }
});
