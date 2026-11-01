/**
 * A programme's page is where its lead reaches the run their programme names:
 * the Groups tab (People in groups, Times, Facilitators) and the Attendance
 * tab, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/groups
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/facilitators
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/attendance
 *
 * ## What this guards
 *
 *  1. THE SAME BOARD, NOT A COPY. People in groups is the run's allocation
 *     board, the component the admin's mount under `/admin/courses` draws,
 *     handed the run the programme names. A lead is handed no link to the run
 *     editor, which they cannot open, and its empty state says an admin adds
 *     groups; an admin's still links there.
 *  2. FOR THE LEAD AND AN ADMIN, DECIDED BEFORE THE RUN IS READ. A reviewer is
 *     told the tabs are the lead's and an admin's and only the form was read;
 *     somebody with no role on the programme is told there is no programme
 *     here; the tree's gate sends a member, a track lead and somebody signed
 *     out to the dashboard.
 *  3. EVERY STATE HAS A SENTENCE: no run named, a run that has gone, each in
 *     words for a lead and for an admin.
 *  4. THE GRID, WORKED OUT ON THE SERVER. The Attendance tab (wk-attendance)
 *     is handed the run's grid, built from its records once: the groups that
 *     still meet by name, their slot and facilitators, and names and marks,
 *     never an address. Its view marks nothing. (It was handed the groups by
 *     name and time alone while each card read its register through the
 *     route; the grid replaced that view, and this section pins the grid as
 *     strictly.)
 *
 * Real: the pages (server components), the tree's gate, the loaders, the
 * views rendered to HTML, and the board. Faked: the session, the Admin SDK
 * handle, `next/link`, `next/navigation` and the stylesheets.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { CAST, COURSE, makeWorld, seedWorld } from "./lib/handoverWorld.mjs";
import { AGI, ROUND, RUN, B, A, C, formPath, leadSeed } from "./lib/leadWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const made = makeWorld("__leadPages");
const { world, reset } = made;

const ui = { h: createElement };
globalThis.__leadPagesUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SESSION = "export async function getCurrentUser() { return globalThis.__leadPages.user; }";
const STYLESHEETS = [
  "./GroupsViews.module.css",
  "./GroupFacilitators.module.css",
  "./ProgrammeAttendance.module.css",
  // The facilitator's pages (boards wk-fac-group, wk-fac-home-phone): their own sheet and the
  // member's pages' shared one, since the group page and the Attendance tab draw their cards.
  "@/features/courses/weekly/weekly.module.css",
  "./facilitator.module.css",
  "@/features/courses/facilitator/facilitator.module.css",
  // This week's work's Reopen (the week you submit): its button's sheet and the confirm's.
  "./written.module.css",
  "./Modal.module.css",
  "./TimesPicture.module.css",
  "./Circles.module.css",
  "./WeekChart.module.css",
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./ProgrammeFrame.module.css",
  "./AllocationBoard.module.css",
  "./AllocationPublish.module.css",
  // People in groups as the programme's hub draws it (board st-groups).
  "./PeopleInGroups.module.css",
  "./ActionToast.module.css",
  "./Badge.module.css",
  "./Button.module.css",
  "./Card.module.css",
  "./Dropdown.module.css",
  "./InitialsChip.module.css",
  "./PersonSelector.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  "./Chip.module.css",
];
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__leadPages.db; }"],
    ["@/lib/firebase/session", SESSION],
    ["./session", SESSION],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function useSelectedLayoutSegment() { return 'groups'; }\n" +
        "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, ...rest }) =>\n" +
        "  globalThis.__leadPagesUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
    ],
    // The client SDK is never reached on the server: the views read through
    // routes, in effects, which a server render does not run.
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
        .join("\n"),
    ],
    ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
  ]),
});

const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: PeoplePage } = await loadTs(join(TABS, "groups", "page.tsx"));
const { default: FacilitatorsPage } = await loadTs(join(TABS, "groups", "facilitators", "page.tsx"));
const { default: AttendancePage } = await loadTs(join(TABS, "attendance", "page.tsx"));

/**
 * The board itself, with its data hook stood in by a run that has no groups
 * yet: the one state in which it links to the run editor.
 */
const { loadTs: loadBoard } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["next/link", "export default ({ href, className, children }) => globalThis.__leadPagesUi.h('a', { href, className }, children);"],
    [
      "./useAllocation",
      "export function useAllocation() {\n" +
        "  return {\n" +
        "    data: {\n" +
        "      run: { id: 'run', label: 'Autumn 2026', courseTitle: 'AGI Strategy Fellowship', academicYear: '2026/27', allocationPublishedAt: null },\n" +
        "      groups: [],\n" +
        "      people: [],\n" +
        "      publish: { adminOnly: false, emails: 0, people: 0, facilitators: 0, more: 0, noAddress: [], emptyGroups: [], refusals: [], test: { state: 'none', when: null, who: null } },\n" +
        "    },\n" +
        "    loading: false, error: null, reload() {}, place: async () => ({ ok: true }), publishAllocation: async () => ({ ok: true }),\n" +
        "    sendPublishTest: async () => ({ ok: true }), removeEnrolment: async () => ({ ok: true }),\n" +
        "  };\n" +
        "}\n" +
        "export default useAllocation;",
    ],
    ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
  ]),
});
const { default: AllocationBoard } = await loadBoard(join("features", "courses", "AllocationBoard.tsx"));

const PAGE_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
const RUN_EDITOR = `/admin/courses/${COURSE.agi}/runs/${RUN.agi}`;

/** The session `getCurrentUser()` builds from the stored account, with the reviewer flag the roles writer keeps. */
function sessionFor(uid) {
  const base = made.sessionOf(uid);
  if (!base) return null;
  return { ...base, permissions: CAST.zach.permissions, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** A page as `who` sees it: the element, its HTML, what it read and where it sent them. */
async function draw(Page, who) {
  world.user = who === null ? null : sessionFor(who);
  const reads = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  const before = made.everything();
  try {
    const element = await Page({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) });
    const html = renderToStaticMarkup(element);
    return { element, html, text: text(html), reads, to: null, wrote: made.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { element: null, html: "", text: "", reads, to: err.to, wrote: made.everything() !== before };
  } finally {
    world.db.collection = collection;
  }
}

/** Every element below `element` whose component is called `name`. */
function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  for (const value of Object.values(element.props ?? {})) find(value, name, out);
  return out;
}

beforeEach(() => {
  reset(leadSeed());
  globalThis.__leadPages.db = world.db;
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
});

// ---------------------------------------------------------------------------
// 1. The same board
// ---------------------------------------------------------------------------

describe("1. People in groups is the run's own allocation board", () => {
  // Since People in groups was restyled (board st-groups) the hub draws the
  // run's board with its own component, `PeopleInGroups`, over the same
  // allocation route and moves (tests/course-hub-people-in-groups.test.mjs);
  // the admin's mount under /admin/courses keeps `AllocationBoard`. Until
  // then the hub handed `AllocationBoard` the run and a run editor link,
  // which these two tests pinned. They now pin the run the hub's board is
  // handed and who it is drawn for, as strictly.
  test("the lead is handed the board for the run the programme names, drawn for the lead", async () => {
    const drawn = await draw(PeoplePage, "claudia");
    const boards = find(drawn.element, "PeopleInGroups");
    assert.equal(boards.length, 1);
    assert.equal(find(drawn.element, "AllocationBoard").length, 0);
    const { view } = boards[0].props;
    assert.deepEqual(
      [view.run, view.viewer, view.roundId, view.programmeId, view.blank],
      [{ id: RUN.agi, courseId: COURSE.agi }, "lead", ROUND, AGI, null],
    );
    assert.ok(!drawn.html.includes(RUN_EDITOR), "the lead was offered the run editor");
    assert.match(drawn.html, new RegExp(`<a href="${PAGE_PATH}/groups" class="view viewCurrent" aria-current="page">People in groups</a>`));
    assert.equal(drawn.wrote, false);
  });

  test("an admin is handed the same board, drawn for an admin", async () => {
    const drawn = await draw(PeoplePage, "zach");
    const [board] = find(drawn.element, "PeopleInGroups");
    assert.deepEqual([board.props.view.run, board.props.view.viewer], [{ id: RUN.agi, courseId: COURSE.agi }, "admin"]);
  });

  test("the board's empty state sends an admin to the run editor, and tells a lead an admin adds groups", () => {
    const asAdmin = renderToStaticMarkup(createElement(AllocationBoard, { courseId: COURSE.agi, runId: RUN.agi }));
    assert.match(asAdmin, new RegExp(`<a href="${RUN_EDITOR}"[^>]*>run editor</a>`));
    const asLead = renderToStaticMarkup(createElement(AllocationBoard, { courseId: COURSE.agi, runId: RUN.agi, runEditorHref: null }));
    assert.ok(!asLead.includes("/admin/courses/"), "the lead was sent to a page they cannot open");
    assert.match(text(asLead), /No groups on this run yet An admin adds the run’s groups in the run editor, each with a session time, and they appear here as columns to place people into\./);
  });

  test("the Facilitators view is handed the run, and reads its people through the route", async () => {
    const drawn = await draw(FacilitatorsPage, "claudia");
    const [view] = find(drawn.element, "GroupFacilitators");
    assert.deepEqual(view.props, { runId: RUN.agi });
    assert.match(drawn.html, new RegExp(`<a href="${PAGE_PATH}/groups/facilitators" class="view viewCurrent" aria-current="page">Facilitators</a>`));
    assert.ok(!drawn.reads.includes("users"), "the page read the roster itself");
  });
});

// ---------------------------------------------------------------------------
// 2. Who is answered what
// ---------------------------------------------------------------------------

describe("2. for the lead and an admin, decided before the run is read", () => {
  for (const [Page, tab, label] of [
    [PeoplePage, "Groups", "People in groups"],
    [FacilitatorsPage, "Groups", "Facilitators"],
    [AttendancePage, "Attendance", "Attendance"],
  ]) {
    test(`${label}: a reviewer is told it is the lead's and an admin's, and only the form was read`, async () => {
      const drawn = await draw(Page, "lloyd");
      assert.match(drawn.text, new RegExp(`Only the programme’s lead and admins can open ${tab}`));
      assert.match(drawn.html, new RegExp(`href="${PAGE_PATH}/applications"`));
      assert.deepEqual(drawn.reads, ["admissionRounds"]);
    });

    test(`${label}: somebody with no role on the programme is told there is no programme here`, async () => {
      const drawn = await draw(Page, "tess");
      assert.match(drawn.text, /There is no programme here/);
      assert.deepEqual(drawn.reads, ["admissionRounds"]);
    });

    test(`${label}: a track lead, a member placed on the run, a member and somebody signed out go to the dashboard`, async () => {
      for (const who of ["yusuf", "amara", "nobody", null]) {
        const drawn = await draw(Page, who);
        assert.equal(drawn.to, "/dashboard", String(who));
        assert.deepEqual(drawn.reads, [], `${who}'s request read something`);
      }
    });

    test(`${label}: a lead who no longer leads the programme is answered as anybody else`, async () => {
      // No longer meeting the bar, Claudia is sent away by the tree's gate.
      world.db.poke("users/claudia", { suRecognised: false });
      const demoted = await draw(Page, "claudia");
      assert.equal(demoted.to, "/dashboard");
      // Replaced as lead, and still a reviewer on the form, she is told the
      // tab is the lead's and an admin's.
      reset(leadSeed());
      globalThis.__leadPages.db = world.db;
      world.db.poke("users/claudia", { admissionsReviewer: true });
      world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "nadia", [`programmes.${AGI}.reviewerUids`]: ["lloyd", "claudia"] });
      const replaced = await draw(Page, "claudia");
      assert.equal(
        find(replaced.element, "AllocationBoard").length +
          find(replaced.element, "PeopleInGroups").length +
          find(replaced.element, "ProgrammeAttendance").length,
        0,
      );
      assert.match(replaced.text, /Only the programme’s lead and admins can open/);
      assert.deepEqual(replaced.reads, ["admissionRounds"]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Every state has a sentence
// ---------------------------------------------------------------------------

describe("3. a programme with no run, in words for each", () => {
  test("no run named: an admin is sent to Settings, a lead is told an admin names it", async () => {
    reset(seedWorld());
    globalThis.__leadPages.db = world.db;
    world.db.poke("users/claudia", { admissionsReviewer: true });
    for (const Page of [PeoplePage, FacilitatorsPage, AttendancePage]) {
      const admin = await draw(Page, "zach");
      assert.match(admin.text, /AGI Strategy doesn’t name a course run yet\. Name it on the Settings tab, under Course run\./);
      assert.match(admin.html, new RegExp(`href="${PAGE_PATH}/setup"`));
      const lead = await draw(Page, "claudia");
      assert.match(lead.text, /AGI Strategy doesn’t name a course run yet\. An admin names it on the Settings tab, under Course run\./);
      assert.ok(!lead.html.includes(`href="${PAGE_PATH}/setup"`));
      assert.ok(!lead.reads.includes("courseRuns"), "a run was read for a programme that names none");
    }
  });

  test("a run that has gone, and one being destroyed", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    const destroying = await draw(PeoplePage, "claudia");
    assert.match(destroying.text, /The course run AGI Strategy names is no longer on the site\. An admin names another/);
    assert.equal(find(destroying.element, "AllocationBoard").length + find(destroying.element, "PeopleInGroups").length, 0);
    await world.db.collection("courseRuns").doc(RUN.agi).delete();
    const gone = await draw(AttendancePage, "zach");
    assert.match(gone.text, /The course run AGI Strategy names is no longer on the site\. Name another on the Settings tab/);
  });
});

// ---------------------------------------------------------------------------
// 4. Names and times only
// ---------------------------------------------------------------------------

describe("4. the Attendance tab is handed the run's grid, worked out on the server", () => {
  test("each group that still meets, in People in groups' order, with names and marks and nothing else", async () => {
    world.db.poke(`courseGroups/${C}`, { archived: true });
    const drawn = await draw(AttendancePage, "claudia");
    const [grid] = find(drawn.element, "ProgrammeAttendance");
    // The order every tab of the programme's page lists its groups in, the
    // order People in groups draws its columns (Monday first), since the walk
    // of stage two's fixes (G10). wk-attendance draws them by name, A to D,
    // and until then this grid did too.
    assert.deepEqual(
      grid.props.model.groups.map((group) => ({ id: group.id, name: group.name, tag: group.tag, line: group.line })),
      [
        { id: B, name: "Group B", tag: "B", line: "Tuesdays 6pm · Rahul and Sofia" },
        { id: A, name: "Group A", tag: "A", line: "Thursdays 6pm · Sofia" },
      ],
    );
    assert.deepEqual(
      { roundId: grid.props.roundId, programmeId: grid.props.programmeId, programmeName: grid.props.programmeName, initialGroup: grid.props.initialGroup },
      { roundId: ROUND, programmeId: AGI, programmeName: "AGI Strategy", initialGroup: "all" },
    );
    // The run, its groups, its enrolments and registers, the accounts they
    // name, the switch the register's ending reads, (since board
    // wk-fac-group's notes, C30) the notes its groups' facilitators share,
    // and (since board wk-week-phone's, C29) the notes each group shares on
    // its week pages, both of which the lead reads under the grid: nothing
    // else.
    assert.deepEqual([...new Set(drawn.reads)].sort(), [
      "admissionRounds",
      "config",
      "courseAttendance",
      "courseEnrolments",
      "courseGroupNotes",
      "courseGroupSharedNotes",
      "courseGroups",
      "courseRuns",
      "users",
    ]);
    assert.ok(!drawn.html.includes("@"), "an address reached the page");
    assert.equal(drawn.wrote, false);
  });

  test("the grid draws By person and By week, a filter of groups, the CSV, the legend, and marks nothing", async () => {
    const drawn = await draw(AttendancePage, "claudia");
    const said = drawn.text;
    // The filter lists the groups in People in groups' order (the walk of stage two's fixes, G10).
    assert.match(said, /By person By week Group All B C A Download CSV/);
    assert.match(drawn.html, /aria-pressed="true"[^>]*>By person<\/button>/);
    assert.match(drawn.html, /aria-pressed="true"[^>]*>All<\/button>/);
    assert.match(said, /Group A Thursdays 6pm · Sofia/);
    assert.match(said, /P Present L Late LE Left early E Excused A Absent · Not yet Tonight P Saved, not pushed Late and left early count as came\./);
    assert.match(
      said,
      /Each person sees their own marks on their programme page once their facilitator finishes the register\. Nobody sees a target, or how many they could miss\./,
    );
    // Nothing that marks: the only buttons are the views, the filter and the download.
    const buttons = [...drawn.html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]));
    assert.deepEqual(buttons, ["By person", "By week", "All", "B", "C", "A", "Download CSV"]);
  });
});
