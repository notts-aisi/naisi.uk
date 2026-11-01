/**
 * ONE ORDER OF GROUPS ON A PROGRAMME'S PAGE.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Every tab of a programme's page lists a run's groups in one order: the
 * order People in groups draws its columns in, by the day each group meets,
 * Monday first, then its start time, then its name (`compareGroupsByMeeting`
 * in `src/lib/firestore/courseGroups.ts`). Until the walk of stage two's
 * fixes they came in four orders on one page: Monday first on People in
 * groups and Facilitators, A to D on Attendance, the Times view and the freed
 * places page, meeting order on the Overview's sessions, and stored order in
 * the Messages tab's To. The stage two journey holds the order the tabs show
 * at every moment of a term; this file holds the tree, so a list of groups a
 * new tab or view adds is caught without anybody remembering it:
 *
 *  1. It reads every module a programme's page imports (its pages and
 *     layouts under `.../programmes/[programmeId]/`, and everything they
 *     import, type imports aside), every route those modules fetch, and
 *     everything those routes import.
 *  2. Each of them that queries a run's groups (`courseGroups` where
 *     `runId`) orders them with `compareGroupsByMeeting`, or is listed in
 *     `READS_WITHOUT_A_LIST` with the reason it lists none of them, or with
 *     the module that orders the list it hands on, which must ask the
 *     comparator itself.
 *  3. The list is checked both ways: every entry is a module the walk
 *     reaches that queries a run's groups.
 *  4. A fetch whose address the walk cannot read is listed in
 *     `FETCHES_IT_CANNOT_READ` with a reason, never skipped, and that list
 *     is checked both ways too.
 *  5. The order has one definition: no other module in `src` works out the
 *     Monday-first difference of two groups' weekdays for itself.
 *
 * A sentence that names several groups ("Groups A and D") is not a list,
 * and reads in name order (`groupsInWords`); nothing here is about one.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const PROGRAMME_PAGES = join(SRC, "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const COMPARATOR_HOME = "src/lib/firestore/courseGroups.ts";

/**
 * Modules the walk reaches that query a run's groups and draw no list of
 * them, each with why. `orderedBy` names the module that orders the list
 * the groups are handed on to, which must ask the comparator.
 */
const READS_WITHOUT_A_LIST = new Map([
  [
    "src/lib/courses/feedback/send.ts",
    {
      why:
        "The feedback batch reads the run's groups only to know who still takes part (a told place in a live group, or a " +
        "live group facilitated) and the name of each person's group for their row, a map by id; its rows are ordered by " +
        "person, never as a list of groups.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/ticks/[itemId]/route.ts",
    {
      why:
        "The tick route reads the run's groups only to know whether the caller facilitates one and which group's copy of " +
        "the week they read, and whose sessions lock it: a yes or no and maps by id, never a list of groups on any page.",
    },
  ],
  [
    "src/lib/courses/weekWork/own.ts",
    {
      why:
        "Who takes part in their own week, for Submit: the run's groups read only to know whether the caller facilitates one " +
        "and whose sessions lock their week, a yes or no and maps by id, never a list of groups on any page.",
    },
  ],
  [
    "src/lib/surveys/personFacts.ts",
    {
      why:
        "A survey reads the run's groups only to know who facilitates one (the facilitators line of \"How valuable was " +
        "each part?\" is hidden from them, and never blank for them): a yes or no per person, never a list of groups. " +
        "A programme's page reaches it through the survey results the lead reads.",
    },
  ],
  [
    "src/lib/courses/coursework/gather.ts",
    {
      why:
        "Claude and Pangram on coursework read the run's live groups only to know who facilitates (whose own work is " +
        "left out of the best answers) and which group's copy of a week each person reads: maps by id, never a list of " +
        "groups on any page.",
    },
  ],
  [
    "src/lib/courses/fillInBoxes/access.ts",
    {
      why:
        "The gate for somebody's fill-in boxes reads the run's live groups only to find whether the person facilitates " +
        "one and which group a fellow sits in: it answers whether one reader may read one person's boxes, never a list " +
        "of groups. A programme's page reaches it through the lead's view of a group's week, which asks it person by person.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts",
    {
      why:
        "Reads the run's groups only to find the ones the caller facilitates, for whether a written answer is theirs to " +
        "write and who gives feedback on it: it answers one answer, never a list of groups. A programme's page reaches " +
        "it through Preview as a fellow, which draws the member's week page with nothing that can be pressed.",
    },
  ],
  [
    "src/lib/courses/weekOne/door.ts",
    {
      why:
        "Week 1's door reads the run's groups only to ask whether the caller facilitates a live one: it answers whether " +
        "week 1 is open to one person, never a list of groups. A programme's page reaches it through Preview as a " +
        "fellow, by way of the routes the member's week page sends.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts",
    {
      why:
        "Reads the run's groups only to find the ones the caller facilitates and the caller's own, for whether a fill-in " +
        "box is theirs to write and who reads it: it answers one box, never a list of groups. A programme's page reaches " +
        "it through Preview as a fellow, which draws the member's week page with nothing that can be pressed.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts",
    {
      why:
        "Reads the run's groups only to find the ones the caller facilitates and the caller's own, whose session says " +
        "whether a pick is still open: it answers one person's pick or ready mark, never a list of groups. A programme's " +
        "page reaches it through Preview as a fellow, which draws the member's week page with nothing that can be pressed.",
    },
  ],
  [
    "src/lib/courses/predictions/taker.ts",
    {
      why:
        "Reads the run's groups only to find the caller's own group and the ones they facilitate, for whether they have " +
        "a predictions card and when its two weeks open to them: it answers one person's own card, never a list of " +
        "groups. A programme's page reaches it through Preview as a fellow, by way of the member's week page's shell.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/reflections/[promptId]/route.ts",
    {
      why:
        "Reads the run's groups only to find the ones the caller facilitates, for whether a reflection box is theirs " +
        "and who reads it: it answers one reflection, never a list of groups. A programme's page reaches it through " +
        "Preview as a fellow, which draws the member's week page with nothing that can be pressed.",
    },
  ],
  [
    "src/lib/courses/updates/readers.ts",
    {
      why:
        "`loadRunGroups` hands every group of the run to the updates readers and counts, which list none of " +
        "them; the Messages tab, the one page that lists them (in To), orders them itself.",
      orderedBy: "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/messages/page.tsx",
    },
  ],
  [
    "src/lib/applications/handover/timesLoad.ts",
    {
      why: "Reads the run's groups for the Times view and hands them to `timesPicture`, which orders the list the view draws.",
      orderedBy: "src/lib/applications/handover/times.ts",
    },
  ],
  [
    "src/lib/applications/handover/pitchesLoad.ts",
    { why: "Reads the run's groups only to name the group each pitch comes from: it lists pitches, never groups." },
  ],
  [
    "src/lib/applications/handover/teamsLoad.ts",
    { why: "Reads the run's groups only to name the group each team and each pitch is in: it lists teams and pitches, never groups." },
  ],
  [
    "src/lib/scheduler/jobs/registerReminders.ts",
    {
      why:
        "Reached through Remind on the Overview, which shares the reminder job's own lookup: it reads a run's " +
        "groups to find the registers to chase, and lists none of them.",
    },
  ],
  [
    "src/lib/courses/allocationPublish.ts",
    {
      why:
        "Plans a press of Publish from the run's groups; the only names it hands back (the groups whose " +
        "facilitators wait for somebody to be placed) are said in a sentence, not listed.",
    },
  ],
  [
    "src/lib/courses/leaving.ts",
    {
      why:
        "Reached through Remove on People in groups, which asks leaving's own answer where a seat's place on the " +
        "form came from: it reads a run's groups only to find when the run's last session ends and whether the " +
        "person facilitates one of them (a facilitator who holds a place is stood down first), and lists none of them.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/allocate/route.ts",
    {
      why:
        "A placement reads the run's groups in its transaction only to find who facilitates which live group, so a " +
        "facilitator who holds a place is placed in their own group and no other. It lists none of them.",
    },
  ],
  [
    "src/app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts",
    {
      why:
        "Remove reads the run's groups in its transaction only to find whether the person facilitates one, so a " +
        "facilitator who holds a place is taken off its facilitators first. It names that one group in a sentence " +
        "and lists none.",
    },
  ],
]);

/** Modules the walk reaches that fetch an address it cannot read, each with what they fetch and why it lists no run's groups. */
const FETCHES_IT_CANNOT_READ = new Map([
  [
    "src/features/courses/feedback/FeedbackToSend.tsx",
    "Feedback to send's two presses (its test and its send), at the address built from the run id it is handed " +
      "(`base`): feedback and its emails, never a run's groups.",
  ],
  [
    "src/features/courses/feedback/FeedbackWriter.tsx",
    "Saving, changing and deleting one piece of feedback, at the feedback route built from the run id it is handed " +
      "(`base`): one piece, never a run's groups.",
  ],
  [
    "src/features/admin/memberNotes/PersonNotes.tsx",
    "The notes kept about one person, at the notes route under the member address, or under the programme's " +
      "address for its lead, each built from the ids it is handed: it draws notes, who reads each and the runs " +
      "a note may come from by name, and no group.",
  ],
  [
    "src/features/applications/intake/PlacementBox.tsx",
    "One person's Placement box, at the placement route under the form address it is handed: it draws " +
      "programmes in the order the person ranked them, and no group.",
  ],
  [
    "src/features/applications/intake/PlacementPanel.tsx",
    "Reads one person's placement for the box beside their application, at the placement route under the " +
      "form address it is handed: no group is in what it draws.",
  ],
  [
    "src/features/applications/circles/Circles.tsx",
    "An admin's Circles, at the circles and arrangement routes and the group, place and facilitator routes under " +
      "the addresses it builds: it draws the run's groups in the order the circles route answers them, and a " +
      "suggestion's in the order the arrangement route does, each compareGroupsByMeeting's " +
      "(src/lib/applications/arrange/circles.ts, src/lib/applications/arrange/advise.ts).",
  ],
  [
    "src/features/applications/circles/AskClaude.tsx",
    "Circles' Ask Claude, at the arrangement route under the address it is handed: it lists Claude's answer and " +
      "its moves, and draws no group.",
  ],
  [
    "src/features/applications/review/AssessAllBar.tsx",
    "An admin's \"Assess the rest\" on a programme's list, at each application's assessment route under the form's " +
      "API base it is handed: Claude's and Pangram's reads of applications, never a run's groups.",
  ],
  [
    "src/features/applications/review/ProgrammeClaude.tsx",
    "An admin's Compare and Ask on a programme's list, at the programme's assessments route it is handed: " +
      "Claude's comparison of applications, never a run's groups.",
  ],
  [
    "src/features/applications/review/AssessmentBlock.tsx",
    "An admin's Claude and Pangram block on one application, at that application's assessment route under the " +
      "form's API base it is handed: one application's reads, never a run's groups.",
  ],
  [
    "src/features/courses/courseworkClaude/BestAnswersPanel.tsx",
    "Claude's best answers to one week under the Coursework tab, at the best answers route under the programme " +
      "address it builds and asked again with that same address: it draws the week's questions and the people " +
      "picked for each, and no group.",
  ],
  [
    "src/features/courses/courseworkClaude/PangramPanel.tsx",
    "An admin's Pangram on one person's page on the Coursework tab, at that person's Pangram route under the " +
      "programme address it builds: their answers with each reading, and no group.",
  ],
  [
    "src/features/courses/WeekBlocksLoader.tsx",
    "The week loader's card, at the address it is handed (the run's week, or one group's own copy of it, on the " +
      "Weeks tab): it reads and saves one week's blocks, never a run's groups.",
  ],
  [
    "src/features/courses/facilitatorGuide/FacilitatorGuideLoader.tsx",
    "The facilitator guide's paste card, at the guide's own route for one place in a course's guide (the Weeks " +
      "tab's guide box): it reads and saves one document, never a run's groups.",
  ],
  [
    "src/features/applications/teams/ProgrammeTeams.tsx",
    "The Teams tab's own actions (making a team, a move, removing one, the email and its test), at the address the " +
      "page hands it: teams, never a run's groups.",
  ],
  [
    "src/features/applications/overview/CertificatesSection.tsx",
    "The Certificates section's two presses (its test and its send), at the address built from the round and " +
      "programme ids it is handed (`base`): certificates and their emails, never a run's groups.",
  ],
  [
    "src/features/applications/review/ReviewScreen.tsx",
    "The review screen's own routes, under the round's admissions address it is handed (`apiBase`): they read " +
      "applications, reviews and review settings, never a run's groups.",
  ],
  [
    "src/features/applications/review/AccessRequirementsBlock.tsx",
    "An application's access requirements, under the same admissions address (`apiBase`): no group is read.",
  ],
  [
    "src/features/applications/review/ApplicationsBoard.tsx",
    "The Applications tab's list actions, at the address the page hands it (`apiPath`): applications and " +
      "decisions, never a run's groups.",
  ],
  [
    "src/features/applications/editor/editorClient.ts",
    "The form editor's calls (`call(url)`), to the form, its question sets, its programmes and their roles under " +
      "`/api/admissions/forms`: programmes and questions, never a run's groups.",
  ],
  [
    "src/features/applications/freedPlaces/FreedPlacesBoard.tsx",
    "Posts an offer and its test (`post(path)`) to the programme's freed places routes; the groups it offers are " +
      "the ones the page's loader lists, which `timedGroupsOf` orders with the comparator.",
  ],
  [
    "src/features/applications/times/TimesActions.tsx",
    "The Times view's two writes (`send(url)`), to the programme's own routes under " +
      "`.../programmes/[programmeId]/groups`: one group's day and start, or a new group. Each names one group or " +
      "none and lists none; the groups the view lists are the picture's, which orders them with the comparator.",
  ],
  [
    "src/features/applications/groups/GroupFacilitators.tsx",
    "The Facilitators view's asks, their test and Remind (`post(url)`), to the programme's own routes under " +
      "`.../programmes/[programmeId]/facilitators`: each names one group of the ones the view's read listed, and " +
      "lists none.",
  ],
  [
    "src/features/courses/courseMutations.ts",
    "Reached from the Facilitators view for `setGroupFacilitators` alone, which posts one group's facilitators " +
      "(`postJson(url)`); its other calls are the course editor's, not a programme page's.",
  ],
]);

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

const rel = (file) => relative(ROOT, file).split(sep).join("/");
const read = (file) => readFileSync(file, "utf8");

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** The file an `@/` or relative import names, or null when it names no TypeScript. */
function resolveImport(specifier, from) {
  const base = specifier.startsWith("@/") ? join(SRC, specifier.slice(2)) : resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null;
}

/** Every module reached from `starts` by imports that are not type-only. */
function importClosure(starts) {
  const seen = new Set();
  const stack = [...starts];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of read(file).matchAll(/^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+["']([^"']+)["']/gm)) {
      const specifier = match[1];
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
      const found = resolveImport(specifier, file);
      if (found) stack.push(found);
    }
  }
  return seen;
}

/** The route file an `/api/...` address names, a `${...}` part matching the one `[param]` folder there is. */
function routeFile(address) {
  const parts = address.replace(/[?#].*$/, "").split("/").filter(Boolean);
  if (parts[0] !== "api") return null;
  let dir = join(SRC, "app");
  for (const part of parts) {
    if (part.includes("${")) {
      const params = readdirSync(dir).filter((name) => /^\[[^\]]+\]$/.test(name));
      if (params.length !== 1) return null;
      dir = join(dir, params[0]);
    } else {
      dir = join(dir, part);
      if (!existsSync(dir)) return null;
    }
  }
  const file = join(dir, "route.ts");
  return existsSync(file) ? file : null;
}

/** Each fetch in a module: the route it reaches, or null when its address cannot be read. */
function fetchesIn(file) {
  const text = read(file);
  // An address built once and fetched below it: `const base = \`/api/...\``.
  const bases = new Map(
    [...text.matchAll(/const (\w+) = (?:useMemo\(\s*\(\)\s*=>\s*)?`(\/api\/[^`]+)`/g)].map((match) => [match[1], match[2]]),
  );
  const out = [];
  for (const match of text.matchAll(/\bfetch\(\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$.]*))/g)) {
    let address = match[1] ?? match[2] ?? match[3] ?? null;
    if (address) {
      const leading = /^\$\{(\w+)\}/.exec(address);
      if (leading && bases.has(leading[1])) address = bases.get(leading[1]) + address.slice(leading[0].length);
    }
    out.push(address ? routeFile(address) : null);
  }
  return out;
}

/** Whether a module queries a run's groups: `courseGroups`, by name or through a constant, where `runId`. */
function queriesRunGroups(text) {
  const flat = text.replace(/\s+/g, " ");
  const constants = new Set([...flat.matchAll(/const (\w+) = "courseGroups"/g)].map((match) => match[1]));
  return [...flat.matchAll(/\.collection\(\s*("courseGroups"|\w+)\s*\)\s*\.where\(\s*"runId"/g)].some(
    (match) => match[1] === '"courseGroups"' || constants.has(match[1]),
  );
}

/** Whether a module orders groups with the one comparator. */
const ordersWithTheComparator = (text) => /\.sort\(\s*compareGroupsByMeeting\s*\)|\bcompareGroupsByMeeting\(/.test(text);

const pages = filesUnder(PROGRAMME_PAGES);
const fromPages = importClosure(pages);
const routes = new Set();
const unreadable = new Set();
for (const file of fromPages) {
  for (const route of fetchesIn(file)) {
    if (route) routes.add(route);
    else unreadable.add(rel(file));
  }
}
const reached = new Set([...fromPages, ...importClosure([...routes])]);
const readsGroups = [...reached].filter((file) => queriesRunGroups(read(file))).map(rel).sort();

describe("one order of groups on every tab of a programme's page", () => {
  test("the walk reaches the programme's pages, the routes their views fetch, and what those import", () => {
    assert.ok(pages.length > 10, `only ${pages.length} pages under the programme's folder`);
    // The routes the tabs' own views fetch that list a run's groups.
    for (const route of [
      "src/app/api/courses/runs/[runId]/allocation/route.ts",
      "src/app/api/courses/runs/[runId]/facilitators/route.ts",
    ]) {
      assert.ok([...routes].map(rel).includes(route), `${route} is not among the routes the walk reached`);
    }
    for (const lister of [
      "src/lib/courses/programmeAttendance.ts",
      "src/lib/applications/handover/timesLoad.ts",
      "src/lib/applications/freedPlaces/groups.ts",
    ]) {
      assert.ok(readsGroups.includes(lister), `${lister} was not found reading a run's groups`);
    }
  });

  test("every module that queries a run's groups orders them with the one comparator, or says why it lists none", () => {
    const problems = [];
    for (const file of readsGroups) {
      if (ordersWithTheComparator(read(join(ROOT, file)))) continue;
      const listed = READS_WITHOUT_A_LIST.get(file);
      if (!listed) {
        problems.push(
          `${file} queries a run's groups and neither orders them with compareGroupsByMeeting nor is in READS_WITHOUT_A_LIST`,
        );
        continue;
      }
      assert.ok(listed.why.length > 40, `${file}: the reason is too short to be one`);
      if (listed.orderedBy && !ordersWithTheComparator(read(join(ROOT, listed.orderedBy)))) {
        problems.push(`${file} hands its groups to ${listed.orderedBy}, which does not order them with compareGroupsByMeeting`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test("the list of reads without a list is checked both ways", () => {
    for (const [file, { orderedBy }] of READS_WITHOUT_A_LIST) {
      assert.ok(readsGroups.includes(file), `${file} is listed, and the walk does not find it reading a run's groups`);
      assert.ok(!ordersWithTheComparator(read(join(ROOT, file))), `${file} orders its groups now: take it off the list`);
      if (orderedBy) assert.ok(reached.has(join(ROOT, orderedBy)), `${orderedBy} is not reached from a programme's page`);
    }
  });

  test("every fetch the walk cannot read is listed with a reason, and every listed one is still there", () => {
    assert.deepEqual([...unreadable].filter((file) => !FETCHES_IT_CANNOT_READ.has(file)).sort(), []);
    for (const [file, why] of FETCHES_IT_CANNOT_READ) {
      assert.ok(unreadable.has(file), `${file} is listed, and its fetches can all be read now: take it off the list`);
      assert.ok(why.length > 40, `${file}: the reason is too short to be one`);
    }
  });

  test("the order has one definition: no other module works out the Monday-first difference of two groups' weekdays", () => {
    const MONDAY_FIRST = /\(\(\s*[\w.]+\.weekday\s*\+\s*6\s*\)\s*%\s*7\s*\)\s*-\s*\(\(\s*[\w.]+\.weekday\s*\+\s*6\s*\)\s*%\s*7\s*\)/;
    const copies = filesUnder(SRC)
      .filter((file) => MONDAY_FIRST.test(read(file)))
      .map(rel);
    assert.deepEqual(copies, [COMPARATOR_HOME]);
    assert.match(read(join(ROOT, COMPARATOR_HOME)), /export function compareGroupsByMeeting\(/);
  });
});
