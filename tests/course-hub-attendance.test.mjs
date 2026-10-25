/**
 * A programme's Attendance tab (board wk-attendance), its CSV and the run's
 * line under the programme's name, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/attendance
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export
 *   the programme's layout (the line under its name)
 *
 * ## What this guards
 *
 *  1. THE GRID'S MARKS AND COUNTS, for a group that has run three sessions:
 *     late and left early count as came; excused counts in "of" and never as
 *     came; somebody who left keeps the marks they had and nothing after;
 *     two absences in a row are named; each group has its own dates and its
 *     own words for tonight, tomorrow and a register not finished.
 *  2. WHO IS A ROW: the register's own rule. The lead sees the people Publish
 *     has told, an admin everybody placed; a leaver is listed in the group
 *     whose register marked them; nobody's address and nobody's note.
 *  3. THE PAGE, as every caller, with its filter opened from the Overview.
 *  4. THE CSV: its exact rows and file name, its log row written before the
 *     file, a refusal when the log cannot be written, and nobody else.
 *  5. THE LINE UNDER THE NAME, from the run's records, for the lead and
 *     admins once the run is under way.
 *
 * Real: the pages, the layout, the route, the libraries under them. Faked:
 * the session, the Admin SDK handle, the view-as guard, `next/link`,
 * `next/navigation`, the stylesheets and the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { CAST, makeWorld } from "./lib/handoverWorld.mjs";
import {
  A,
  AGI,
  B,
  C,
  D,
  NOW,
  ROUND,
  RUN,
  SAM_SAID,
  SECRET_NOTE,
  account,
  attendanceSeed,
  enrolment,
  registerPath,
  switches,
} from "./lib/hubAttendanceWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const made = makeWorld("__hubAttendance");
const { world, reset, formRoute } = made;
const exportRoute = await formRoute("programmes", "[programmeId]", "attendance", "export");

const ui = { h: createElement };
globalThis.__hubAttendanceUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SESSION = "export async function getCurrentUser() { return globalThis.__hubAttendancePages.user; }";
const STYLESHEETS = [
  "./ProgrammeAttendance.module.css",
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./ProgrammeFrame.module.css",
  "@/features/applications/editor/ProgrammeFrame.module.css",
  "./InitialsChip.module.css",
  "./Modal.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  "./Chip.module.css",
];
globalThis.__hubAttendancePages = { user: null, db: null };
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__hubAttendancePages.db; }"],
    ["@/lib/firebase/session", SESSION],
    ["./session", SESSION],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function useSelectedLayoutSegment() { return 'attendance'; }\n" +
        "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, ...rest }) =>\n" +
        "  globalThis.__hubAttendanceUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
    ],
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
        .join("\n"),
    ],
    ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
  ]),
});

const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: AttendancePage } = await loadTs(join(PROGRAMME, "attendance", "page.tsx"));
const { default: ProgrammeLayout } = await loadTs(join(PROGRAMME, "layout.tsx"));
const { readRunRecords, buildRunAttendance, attendanceCsvTable, readRunHeader } = await loadTs(
  join("lib", "courses", "programmeAttendance.ts"),
);

const PAGE_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

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

/** The tab as `who` sees it: the element, its HTML and text, what it read, where it sent them. */
async function draw(who, searchParams) {
  globalThis.__hubAttendancePages.user = who === null ? null : sessionFor(who);
  const reads = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  const before = made.everything();
  try {
    const element = await AttendancePage({
      params: Promise.resolve({ roundId: ROUND, programmeId: AGI }),
      searchParams: Promise.resolve(searchParams ?? {}),
    });
    const html = renderToStaticMarkup(element);
    return { element, html, text: text(html), reads, to: null, wrote: made.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { element: null, html: "", text: "", reads, to: err.to, wrote: made.everything() !== before };
  } finally {
    world.db.collection = collection;
  }
}

/** The programme's head, as `who` sees it, around an empty page. */
async function head(who) {
  globalThis.__hubAttendancePages.user = sessionFor(who);
  const element = await ProgrammeLayout({
    children: createElement("main", null, "page"),
    params: Promise.resolve({ roundId: ROUND, programmeId: AGI }),
  });
  return text(renderToStaticMarkup(element));
}

/** A press of "Download CSV" as `who`: the file, or the refusal. */
async function download(who, { viewAs = false } = {}) {
  world.user = made.sessionOf(who);
  world.viewAs = viewAs;
  try {
    const res = await exportRoute.POST(new Request("https://naisi.invalid/api", { method: "POST" }), {
      params: Promise.resolve({ roundId: ROUND, programmeId: AGI }),
    });
    if (res instanceof Response) {
      // Read as bytes and decoded keeping a byte-order mark, which `text()` would drop.
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, headers: res.headers, bytes, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) };
    }
    return { status: res.status, body: res.body };
  } finally {
    world.viewAs = false;
  }
}

/** The grid as `who` would be handed it: `true` for an admin's. */
async function gridFor(isAdmin) {
  const records = await readRunRecords(world.db, RUN.agi);
  return buildRunAttendance(records, { isAdmin }, new Date());
}

/** Each cell as one word: a mark (starred while saved and not finished), or the cell's state. */
const cellsOf = (person) => person.cells.map((cell) => (cell.state === "mark" ? `${cell.mark}${cell.saved ? "*" : ""}` : cell.state));
const groupOf = (model, id) => model.groups.find((group) => group.id === id);
const rowOf = (model, groupId, uid) => groupOf(model, groupId).people.find((person) => person.uid === uid);
const exportRows = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("dataExports/"))
    .map((path) => world.db.read(path));

function start(seed = attendanceSeed()) {
  reset(seed, { now: () => new Date() });
  globalThis.__hubAttendancePages.db = world.db;
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  start();
});

// ---------------------------------------------------------------------------
// 1. The grid's marks and counts
// ---------------------------------------------------------------------------

describe("1. the grid's marks and counts", () => {
  test("Group A, three sessions run: late counts as came, excused counts in Of, two absences in a row are named", async () => {
    const model = await gridFor(false);
    const group = groupOf(model, A);
    assert.equal(group.line, "Thursdays 6pm · Sofia");
    assert.deepEqual(
      group.weeks.map((week) => [week.weekNumber, week.dateLabel, week.tag]),
      [
        [1, "29 Oct", null],
        [2, "5 Nov", null],
        [3, "12 Nov", null],
        [4, "19 Nov", null],
        [5, "26 Nov", null],
        [6, "3 Dec", null],
      ],
    );
    assert.deepEqual(
      group.people.map((person) => person.name),
      ["Amara Okafor", "Bea Lindqvist", "Dev Patel", "Sam Whitfield", "Tariq Mensah"],
    );
    const row = (uid) => rowOf(model, A, uid);
    assert.deepEqual(cellsOf(row("amara")), ["present", "present", "present", "not-yet", "not-yet", "not-yet"]);
    assert.deepEqual([row("amara").came, row("amara").of], [3, 3]);
    assert.deepEqual(cellsOf(row("dev")), ["late", "present", "present", "not-yet", "not-yet", "not-yet"]);
    assert.deepEqual([row("dev").came, row("dev").of], [3, 3], "late counts as came");
    assert.deepEqual(cellsOf(row("bea")), ["present", "excused", "present", "not-yet", "not-yet", "not-yet"]);
    assert.deepEqual([row("bea").came, row("bea").of], [2, 3], "excused counts in Of and never as came");
    assert.deepEqual(cellsOf(row("tariq")), ["present", "absent", "absent", "not-yet", "not-yet", "not-yet"]);
    assert.deepEqual([row("tariq").came, row("tariq").of, row("tariq").absentInARow], [1, 3, 2]);
    assert.deepEqual(row("tariq").absentWeeks, [2, 3]);
    for (const uid of ["amara", "dev", "bea"]) assert.equal(row(uid).absentInARow, 0, uid);
  });

  test("somebody who left keeps the marks they had, and nothing after they went", async () => {
    const sam = rowOf(await gridFor(false), A, "sam");
    assert.equal(sam.left, "Left Fri 6 Nov");
    assert.equal(sam.leftDateKey, "2026-11-06");
    assert.deepEqual(cellsOf(sam), ["present", "absent", "after", "after", "after", "after"]);
    assert.deepEqual([sam.came, sam.of], [1, 2]);
    assert.equal(sam.absentInARow, 0, "somebody who left is not chased about absences");
  });

  test("left early counts as came, as present and late do", async () => {
    world.db.poke(registerPath(A, 3), { "records.bea": "left-early" });
    const bea = rowOf(await gridFor(false), A, "bea");
    assert.deepEqual(cellsOf(bea).slice(0, 3), ["present", "excused", "left-early"]);
    assert.deepEqual([bea.came, bea.of], [2, 3]);
  });

  test("each group's own dates, and the words over them: tonight, tomorrow, not finished, this week", async () => {
    const model = await gridFor(false);
    assert.deepEqual(model.weeks, [1, 2, 3, 4, 5, 6].map((weekNumber) => ({ weekNumber, thisWeek: weekNumber === 3 })));
    const week3 = (id) => groupOf(model, id).weeks[2];
    assert.deepEqual(week3(B), { weekNumber: 3, dateLabel: "17 Nov", tag: "tonight" });
    assert.deepEqual(week3(C), { weekNumber: 3, dateLabel: "18 Nov", tag: "tomorrow" });
    assert.deepEqual(week3(D), { weekNumber: 3, dateLabel: "16 Nov", tag: "not-finished" });
    assert.equal(groupOf(model, B).line, "Tuesdays 6pm · Rahul and Sofia");
    assert.equal(groupOf(model, C).line, "Wednesdays 1pm · Tom");
    assert.equal(groupOf(model, D).line, "Mondays 6pm · Grace");
    // Tonight's session has no mark yet: the dashed box, and it counts for nobody.
    const kofi = rowOf(model, B, "kofi");
    assert.deepEqual(cellsOf(kofi), ["excused", "present", "today", "not-yet", "not-yet", "not-yet"]);
    assert.deepEqual([kofi.came, kofi.of], [1, 2]);
    // A register saved and not finished: its marks are ringed, and they count.
    const freya = rowOf(model, D, "freya");
    assert.deepEqual(cellsOf(freya), ["present", "absent", "absent*", "not-yet", "not-yet", "not-yet"]);
    assert.deepEqual([freya.came, freya.of, freya.absentInARow], [1, 3, 2]);
    assert.deepEqual(cellsOf(rowOf(model, D, "yasmin")).slice(0, 3), ["present", "present", "present*"]);
  });

  test("a session that started at 1pm today is Today, not Tonight", async () => {
    mock.timers.setTime(new Date("2026-11-18T09:00:00Z").getTime());
    const model = await gridFor(false);
    assert.deepEqual(groupOf(model, C).weeks[2], { weekNumber: 3, dateLabel: "18 Nov", tag: "today" });
    assert.deepEqual(groupOf(model, B).weeks[2].tag, "not-finished", "Group B's session last night has no register");
  });

  test("a register marked as not held: the session counts for nobody, and says so", async () => {
    world.db.poke(registerPath(A, 2), { held: false });
    const model = await gridFor(false);
    assert.equal(groupOf(model, A).weeks[1].tag, "not-held");
    assert.deepEqual(cellsOf(rowOf(model, A, "bea")).slice(0, 3), ["present", "not-held", "present"]);
    assert.deepEqual([rowOf(model, A, "bea").came, rowOf(model, A, "bea").of], [2, 2]);
    // With week 2 not held, Tariq has one absence since the last present mark, not two in a row.
    assert.equal(rowOf(model, A, "tariq").absentInARow, 0);
  });

  test("% who came, by week: every group's marks so far, and which groups week 3 is from", async () => {
    const model = await gridFor(false);
    assert.deepEqual(
      model.totals.map((total) => [total.weekNumber, total.percent, total.came, total.of, total.soFar, total.from]),
      [
        [1, 92, 11, 12, false, ["Group A", "Group B", "Group C", "Group D"]],
        [2, 64, 7, 11, false, ["Group A", "Group B", "Group C", "Group D"]],
        [3, 67, 4, 6, true, ["Group A", "Group D"]],
        [4, null, 0, 0, false, []],
        [5, null, 0, 0, false, []],
        [6, null, 0, 0, false, []],
      ],
    );
    // A group's own figures, for the By week view and a filtered footer.
    assert.deepEqual(
      groupOf(model, D).totals.slice(0, 3).map((total) => [total.percent, total.came, total.of, total.soFar]),
      [
        [100, 2, 2, false],
        [50, 1, 2, false],
        [50, 1, 2, true],
      ],
    );
  });

  test("the register's own word for ending: pushed while the push sends next week's email, finished on the schedule", async () => {
    assert.equal((await gridFor(false)).ending, "pushed");
    world.db.seed("config/scheduler", switches({ scheduled: true }));
    assert.equal((await gridFor(false)).ending, "finished");
  });
});

// ---------------------------------------------------------------------------
// 2. Who is a row
// ---------------------------------------------------------------------------

describe("2. who is a row", () => {
  test("the lead sees the people Publish has told; an admin sees everybody placed", async () => {
    const lead = await gridFor(false);
    const admin = await gridFor(true);
    assert.deepEqual(groupOf(lead, C).people.map((person) => person.uid), ["hamza"]);
    assert.equal(groupOf(lead, C).notYetTold, true);
    assert.deepEqual(groupOf(admin, C).people.map((person) => person.uid), ["hamza", "una"]);
    assert.equal(groupOf(admin, C).notYetTold, false);
  });

  test("somebody taken off the run is listed, as Left, in the group whose register marked them", async () => {
    const model = await gridFor(false);
    const omar = rowOf(model, B, "omar");
    assert.equal(omar.left, "Left");
    assert.equal(omar.leftDateKey, null);
    assert.deepEqual(cellsOf(omar), ["present", "after", "after", "after", "after", "after"]);
    assert.deepEqual([omar.came, omar.of], [1, 1]);
    for (const id of [A, C, D]) assert.ok(!groupOf(model, id).people.some((person) => person.uid === "omar"), id);
  });

  test("somebody taken off before any register marked them took no part, and is nobody's row", async () => {
    world.db.poke(registerPath(B, 1), { records: { chloe: "present", farah: "present", kofi: "excused" } });
    const model = await gridFor(false);
    assert.ok(!model.groups.some((group) => group.people.some((person) => person.uid === "omar")));
  });

  test("a group that stopped meeting is no block, and nobody's address or note is in the grid", async () => {
    world.db.poke(`courseGroups/${C}`, { archived: true });
    const model = await gridFor(true);
    assert.deepEqual(model.groups.map((group) => group.name), ["Group A", "Group B", "Group D"]);
    const json = JSON.stringify(model);
    assert.ok(!json.includes("@"), "an address reached the grid");
    assert.ok(!json.includes(SECRET_NOTE), "a participant note reached the grid");
    assert.ok(!json.includes(SAM_SAID), "a leaver's reason reached the grid");
  });

  test("a quiet group shows three people and '+N more'; one with something to look at shows everybody", async () => {
    for (const [uid, name] of [
      ["ivy", "Ivy Moss"],
      ["jon", "Jon Reid"],
      ["kai", "Kai Lowe"],
    ]) {
      world.db.seed(`users/${uid}`, account(uid, name));
      world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, enrolment(uid, C));
    }
    const model = await gridFor(false);
    assert.deepEqual([groupOf(model, C).people.length, groupOf(model, C).shown], [4, 3]);
    assert.equal(groupOf(model, A).shown, groupOf(model, A).people.length, "a leaver and two absences in a row");
    assert.equal(groupOf(model, D).shown, groupOf(model, D).people.length, "a register not finished");
  });
});

// ---------------------------------------------------------------------------
// 3. The page, as every caller
// ---------------------------------------------------------------------------

describe("3. the Attendance tab, as every caller", () => {
  test("the lead: the grid as the board draws it, words and figures from the records", async () => {
    const drawn = await draw("claudia");
    assert.equal(drawn.to, null);
    assert.equal(drawn.wrote, false);
    const said = drawn.text;
    assert.match(said, /Name Week 1 Week 2 Week 3 This week Week 4 Week 5 Week 6 Came/);
    assert.match(said, /Group A Thursdays 6pm · Sofia 29 Oct 5 Nov 12 Nov 19 Nov 26 Nov 3 Dec/);
    assert.match(said, /Group B Tuesdays 6pm · Rahul and Sofia 3 Nov 10 Nov 17 Nov Tonight 24 Nov/);
    assert.match(said, /Group C Wednesdays 1pm · Tom 4 Nov 11 Nov 18 Nov Tomorrow 25 Nov/);
    assert.match(said, /Group D Mondays 6pm · Grace 2 Nov 9 Nov 16 Nov Not pushed 23 Nov/);
    assert.match(said, /Dev Patel L P P · · · 3 of 3/);
    assert.match(said, /Sam Whitfield Left Fri 6 Nov P A 1 of 2/);
    assert.match(said, /Tariq Mensah 2 in a row P A A · · · 1 of 3/);
    assert.match(said, /Omar Haddad Left P 1 of 1/);
    assert.match(said, /All groups % who came 92% 64% 67% so far · · ·/);
    assert.match(said, /Somebody placed in this group isn’t on the register yet: Publish hasn’t told them their group\./);
    assert.ok(!said.includes("Una Byrne"), "a placement Publish has not told reached the lead");
    assert.match(drawn.html, /aria-label="Sam Whitfield, week 1: Present, before they left"/);
    assert.match(drawn.html, /aria-label="Freya Thompson, week 3: Absent, saved, not pushed"/);
    assert.match(drawn.html, /aria-label="Kofi Asante, week 3: today, not yet"/);
    assert.ok(!drawn.html.includes("@") && !drawn.html.includes(SECRET_NOTE));
  });

  test("an admin: everybody placed, Una included, with no notice about Publish", async () => {
    const drawn = await draw("zach");
    assert.match(drawn.text, /Una Byrne/);
    assert.ok(!drawn.text.includes("isn’t on the register yet"));
  });

  test("on the schedule the register's word is finished, in the grid and the legend", async () => {
    world.db.seed("config/scheduler", switches({ scheduled: true }));
    const drawn = await draw("claudia");
    assert.match(drawn.text, /16 Nov Not finished 23 Nov/);
    assert.match(drawn.text, /P Saved, not finished Late and left early count as came\./);
  });

  test("opened from the Overview on one group: that group alone, its own figures in the footer", async () => {
    const drawn = await draw("claudia", { group: D });
    const [grid] = find(drawn.element, "ProgrammeAttendance");
    assert.equal(grid.props.initialGroup, D);
    assert.match(drawn.html, /aria-pressed="true" aria-label="Group D"[^>]*>D<\/button>/);
    assert.ok(!drawn.text.includes("Amara Okafor"), "another group was drawn");
    assert.match(drawn.text, /Group D % who came 100% 50% 50% so far · · ·/);
    // An id that is not one of the run's groups opens on all of them.
    const stranger = await draw("claudia", { group: "somebody-elses-group" });
    assert.equal(find(stranger.element, "ProgrammeAttendance")[0].props.initialGroup, "all");
  });

  test("a quiet group draws three rows and a button for the rest, named for assistive technology", async () => {
    for (const [uid, name] of [
      ["ivy", "Ivy Moss"],
      ["jon", "Jon Reid"],
      ["kai", "Kai Lowe"],
    ]) {
      world.db.seed(`users/${uid}`, account(uid, name));
      world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, enrolment(uid, C));
    }
    const drawn = await draw("claudia");
    assert.match(drawn.html, /<button type="button"[^>]*aria-label="Show 1 more in Group C">\+1 more<\/button>/);
    assert.ok(!drawn.text.includes("Kai Lowe"), "the fourth row of a quiet group was drawn before it was asked for");
  });

  test("a reviewer is told the tab is the lead's and an admin's; the lead of another programme, that there is none", async () => {
    const reviewer = await draw("lloyd");
    assert.match(reviewer.text, /Only the programme’s lead and admins can open Attendance/);
    assert.deepEqual(reviewer.reads, ["admissionRounds"]);
    const other = await draw("tess");
    assert.match(other.text, /There is no programme here/);
    assert.deepEqual(other.reads, ["admissionRounds"]);
  });

  test("the run's track lead, a facilitator, members placed and told or not, somebody on nothing and somebody signed out go to the dashboard", async () => {
    for (const who of ["yusuf", "rahul", "amara", "una", "nobody", null]) {
      const drawn = await draw(who);
      assert.equal(drawn.to, "/dashboard", String(who));
      assert.deepEqual(drawn.reads, [], `${who}'s request read something`);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The CSV
// ---------------------------------------------------------------------------

const LEAD_CSV = [
  "﻿Group,Name,Week 1,Week 2,Week 3,Week 4,Week 5,Week 6,Came,Of,Left",
  "Group A,Amara Okafor,Present,Present,Present,,,,3,3,",
  "Group A,Bea Lindqvist,Present,Excused,Present,,,,2,3,",
  "Group A,Dev Patel,Late,Present,Present,,,,3,3,",
  "Group A,Sam Whitfield,Present,Absent,,,,,1,2,2026-11-06",
  "Group A,Tariq Mensah,Present,Absent,Absent,,,,1,3,",
  "Group B,Chloe Nguyen,Present,Present,,,,,2,2,",
  "Group B,Farah Hussain,Present,Late,,,,,2,2,",
  "Group B,Kofi Asante,Excused,Present,,,,,1,2,",
  "Group B,Omar Haddad,Present,,,,,,1,1,Yes",
  "Group C,Hamza Qureshi,Present,Present,,,,,2,2,",
  "Group D,Freya Thompson,Present,Absent,Absent (not pushed),,,,1,3,",
  "Group D,Yasmin Farouk,Present,Present,Present (not pushed),,,,3,3,",
].join("\n");

describe("4. the CSV", () => {
  test("the lead's file: one row a person, marks in words, named for the programme and the day, logged first", async () => {
    const file = await download("claudia");
    assert.equal(file.status, 200, JSON.stringify(file.body ?? null));
    assert.equal(file.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.equal(file.headers.get("Content-Disposition"), 'attachment; filename="attendance-agi-strategy-2026-11-17.csv"');
    assert.equal(file.headers.get("Cache-Control"), "no-store");
    assert.deepEqual([...file.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a spreadsheet reads the names as UTF-8");
    assert.equal(file.text, LEAD_CSV);
    const rows = exportRows();
    assert.equal(rows.length, 1);
    const { at, ...row } = rows[0];
    assert.ok(at instanceof Date);
    assert.deepEqual(row, {
      kind: "register",
      actorUid: "claudia",
      actorName: "Claudia Reyes",
      scope: { runId: RUN.agi, roundId: ROUND },
      rowCount: 12,
      filename: "attendance-agi-strategy-2026-11-17.csv",
      viaImpersonation: false,
    });
  });

  test("an admin's file holds everybody placed, and the file is exactly the grid", async () => {
    const file = await download("zach");
    assert.equal(file.status, 200);
    const lines = file.text.split("\n");
    assert.equal(lines.length, 14);
    assert.ok(lines.includes("Group C,Una Byrne,,,,,,,0,0,"));
    const records = await readRunRecords(world.db, RUN.agi);
    const table = attendanceCsvTable(buildRunAttendance(records, { isAdmin: true }, new Date()));
    assert.equal(table.rows.length, 13);
    assert.equal(exportRows()[0].rowCount, 13);
  });

  test("names and marks only: no address, no note, no reason anybody gave", async () => {
    const file = await download("zach");
    assert.ok(!file.text.includes("@"));
    assert.ok(!file.text.includes(SECRET_NOTE));
    assert.ok(!file.text.includes(SAM_SAID));
  });

  test("refused when the log cannot be written: no file, and nothing else written", async () => {
    const collection = world.db.collection;
    world.db.collection = (path) => {
      const ref = collection(path);
      if (path !== "dataExports") return ref;
      return { ...ref, add: async () => Promise.reject(Object.assign(new Error("UNAVAILABLE"), { code: 14 })) };
    };
    try {
      const before = made.everything();
      const refused = await download("claudia");
      assert.equal(refused.status, 503);
      assert.equal(
        refused.body.error,
        "The download couldn’t be recorded, so it wasn’t made. Every download of a register is logged. Try again shortly.",
      );
      assert.equal(refused.text, undefined, "a file was handed over");
      assert.equal(made.everything(), before);
    } finally {
      world.db.collection = collection;
    }
  });

  test("every other caller is refused, and nothing is logged", async () => {
    for (const [who, status] of [
      ["lloyd", 403],
      ["tess", 404],
      ["yusuf", 404],
      ["rahul", 404],
      ["amara", 404],
      ["una", 404],
      ["nobody", 404],
      [null, 401],
    ]) {
      const refused = await download(who);
      assert.equal(refused.status, status, String(who));
      assert.equal(refused.text, undefined, String(who));
    }
    assert.deepEqual(exportRows(), []);
  });

  test("a view-as session is refused before anything is read", async () => {
    const before = made.everything();
    const refused = await download("zach", { viewAs: true });
    assert.equal(refused.status, 403);
    assert.equal(made.everything(), before);
  });

  test("a programme that names no run has no attendance to download", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    const refused = await download("claudia");
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "AGI Strategy doesn’t name a course run, so it has no attendance to download.");
    assert.deepEqual(exportRows(), []);
  });
});

// ---------------------------------------------------------------------------
// 5. The line under the programme's name
// ---------------------------------------------------------------------------

describe("5. the line under the programme's name", () => {
  test("once the run is under way: the week, how many are taking part in how many groups, the last sessions", async () => {
    assert.match(
      await head("claudia"),
      /AGI Strategy Fellowship Running · week 3 of 6 C Lead: Claudia · 10 taking part in 4 groups · Last sessions Wed 9 Dec/,
    );
    // An admin is shown everybody placed, Una included.
    assert.match(await head("zach"), /Running · week 3 of 6 C Lead: Claudia · 11 taking part in 4 groups · Last sessions Wed 9 Dec/);
  });

  test("a reviewer keeps the form's own line", async () => {
    const said = await head("lloyd");
    assert.ok(!said.includes("taking part"), said);
    assert.ok(!said.includes("Running"), said);
  });

  test("before the run's first day the form's line stays; after its last week it reads Finished", async () => {
    mock.timers.setTime(new Date("2026-10-27T12:00:00Z").getTime());
    const before = await head("claudia");
    assert.ok(!before.includes("taking part") && !before.includes("Running"), before);
    mock.timers.setTime(new Date("2026-12-20T12:00:00Z").getTime());
    assert.match(await head("claudia"), /Finished C Lead: Claudia · 10 taking part in 4 groups · Last sessions Wed 9 Dec/);
  });

  test("the line is read from the run alone, and the header loader agrees with the grid on who takes part", async () => {
    const header = await readRunHeader(world.db, RUN.agi, { isAdmin: false }, new Date());
    assert.deepEqual(header, { chip: "Running · week 3 of 6", live: true, takingPart: 10, groups: 4, lastSession: "Wed 9 Dec" });
    const grid = await gridFor(false);
    const taking = grid.groups.flatMap((group) => group.people).filter((person) => person.left === null).length;
    assert.equal(taking, header.takingPart);
  });
});
