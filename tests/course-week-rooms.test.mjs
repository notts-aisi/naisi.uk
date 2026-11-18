/**
 * THE WEEK'S ROOMS AND THE TERM'S ROOMS: every group's room for one week,
 * set or changed in its row or pasted from a sheet, and every week of the term
 * as a grid.
 *
 *   /admin/admissions/forms/[roundId]/rooms        the week's rooms
 *   /admin/admissions/forms/[roundId]/rooms/term   the term's rooms
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE MODEL, as pure functions over built worlds: which sessions are a
 *     week's rows and what each says (day and time, campus, that week's room,
 *     the link set or missing, away, online, requests), which rows a room is
 *     changed in, the week picker, the empty states, the term's grid and its
 *     marks, and what Download saves.
 *  2. THE PASTE BOX matches loosely and never guesses: every line it cannot
 *     place, or that fits two groups, is asked about, and only the rows
 *     handed in are candidates.
 *  3. WHO: an admin sees every programme on the form, a programme's lead
 *     their own and nothing of another's (not even that it exists), and a
 *     reviewer, a track lead, a facilitator, a member and somebody signed
 *     out are refused, at both pages. What each page reads, and that it
 *     writes nothing.
 *  4. ONE WRITER: a room saved from a row is the one-week change route's move
 *     to the same day and time, pressed by the page's own code
 *     (`src/lib/courses/weekRooms/press.ts`) against the real routes: the same
 *     refusals, the same history row and the same email to the group as a
 *     press from the group's page; a count that no longer holds is a 409 and
 *     changes nothing; a view-as session is refused.
 *
 * Real: the pages, the tree's gate, the loader, the model, the press module,
 * the change route, the updates route and their email templates. Faked: the
 * session, the Admin SDK handle, the mail door, `next/link`,
 * `next/navigation` and the stylesheets.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { walkSource } from "./lib/functionScan.mjs";
import { groupDoc } from "./lib/handoverWorld.mjs";
import { TAIS, slot } from "./lib/leadWorld.mjs";
import { A, AGI, B, C, NOW, ROUND, RUN, makeSessionsWorld, updatesSeed } from "./lib/sessionsWorld.mjs";

const ui = { h: createElement };
globalThis.__weekRoomsUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const STYLESHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
}

const w = await makeSessionsWorld("__weekRooms", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children, ...rest }) =>\n" +
      "  globalThis.__weekRoomsUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
  ],
  ["./session", "export async function getCurrentUser() { return globalThis.__weekRooms.user; }"],
  ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
]);
const { world, loadTs, call } = w;

const model = await loadTs(join("lib", "courses", "weekRooms", "model.ts"));
const paste = await loadTs(join("lib", "courses", "weekRooms", "paste.ts"));
const csv = await loadTs(join("lib", "courses", "weekRooms", "csv.ts"));
const press = await loadTs(join("lib", "courses", "weekRooms", "press.ts"));
const words = await loadTs(join("lib", "courses", "weekRooms", "words.ts"));
const changeWords = await loadTs(join("lib", "courses", "sessionChange", "words.ts"));
const { compareGroupsByMeeting, normalizeCourseGroup } = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
const updatesRoute = await w.courseRoute("runs", "[runId]", "updates");

const FORM = join("app", "(app)", "admin", "admissions", "forms", "[roundId]");
const { default: WeekRoomsPage } = await loadTs(join(FORM, "rooms", "page.tsx"));
const { default: TermRoomsPage } = await loadTs(join(FORM, "rooms", "term", "page.tsx"));

/** Technical AI Safety's one group, so the other programme on the form has rows: Mondays 5pm. */
const TAIS_A = "technical-ai-safety-autumn-2026__grp00009";

/** The Mondays of the weeks the suite reads. NOW is Thu 19 Nov, 10am. */
const MON_16 = "2026-11-16";
const MON_23 = "2026-11-23";

const read = (path) => world.db.read(path);
const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function seed(over = {}) {
  const base = updatesSeed();
  base[`courseGroups/${TAIS_A}`] = groupDoc({
    runId: RUN.tais,
    courseId: base[`courseRuns/${RUN.tais}`].courseId,
    name: "Group A",
    facilitatorUids: [],
    session: slot({ weekday: 1, startTimeLocal: "17:00", location: "Jubilee B01" }),
  });
  return { ...base, ...over };
}

beforeEach(() => {
  w.reset(seed());
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
});

/** The session `getCurrentUser()` builds, with the reviewer flag the roles writer keeps. */
function sessionFor(uid) {
  const base = w.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

/** A page as `who` sees it: its element, text, the collections it read, where it sent them and whether it wrote. */
async function draw(Page, who, searchParams = {}, roundId = ROUND) {
  world.user = who === null ? null : sessionFor(who);
  world.course = true;
  const reads = [];
  const collection = world.courseDb.collection;
  world.courseDb.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  const before = w.everything();
  try {
    const element = await Page({ params: Promise.resolve({ roundId }), searchParams: Promise.resolve(searchParams) });
    const html = renderToStaticMarkup(element);
    return { element, html, text: text(html), reads, to: null, wrote: w.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { element: null, html: "", text: "", reads, to: err.to, wrote: w.everything() !== before };
  } finally {
    world.courseDb.collection = collection;
    world.course = false;
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

/** The rows the week's rooms hands its table, as `who` sees them. */
async function rowsFor(who, query = {}) {
  const drawn = await draw(WeekRoomsPage, who, query);
  const [board] = find(drawn.element, "WeekRoomsBoard");
  return { drawn, rows: board?.props.rows ?? null };
}

/** The records the loader would hand the model, read straight from the store. */
function recordsOf(programmeId, runId, { registers = {}, requests = {} } = {}) {
  const run = normalizeCourseRun(runId, read(`courseRuns/${runId}`));
  const groups = world.db
    .paths()
    .filter((path) => path.startsWith("courseGroups/"))
    .map((path) => normalizeCourseGroup(path.slice("courseGroups/".length), read(path)))
    .filter((group) => group.runId === runId && !group.archived)
    .sort(compareGroupsByMeeting);
  return {
    programmeId,
    programmeName: programmeId === AGI ? "AGI Strategy" : "Technical AI Safety",
    run,
    groups,
    registers: new Map(Object.entries(registers)),
    requests: new Map(Object.entries(requests)),
  };
}

const registerId = (groupId, week) => `${RUN.agi}__${groupId}__w0${week}`;

/**
 * The page's own `post`, aimed at the real handlers: the change route and the
 * updates route, as `who`, in or out of a view-as session.
 */
function postAs(who, { viewAs = false } = {}) {
  return async (url, body) => {
    const change = /^\/api\/courses\/groups\/([^/]+)\/session\/change$/.exec(url);
    if (change) return call(who, w.change.POST, { groupId: decodeURIComponent(change[1]) }, { body, course: true, viewAs });
    const updates = /^\/api\/courses\/runs\/([^/]+)\/updates$/.exec(url);
    if (updates) return call(who, updatesRoute.POST, { runId: decodeURIComponent(updates[1]) }, { body, course: true, viewAs });
    throw new Error(`the page pressed something else: ${url}`);
  };
}

/** The history rows of one kind. */
const auditRows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => read(path))
    .filter((row) => row.kind === kind);

/** Every email sent, as its reader sees it. */
async function mailRead() {
  return Promise.all(
    world.mail.map(async (message) => ({
      to: message.to,
      subject: message.subject,
      text: (await render(message.react, { plainText: true })).replace(/\s+/g, " "),
    })),
  );
}

// ---------------------------------------------------------------------------
// 1. The model
// ---------------------------------------------------------------------------

describe("1. the week's rows, from records", () => {
  test("a week is Monday to Sunday in London, and a page opens on this week unless another is asked for", () => {
    assert.equal(model.mondayOf("2026-11-19"), MON_16);
    assert.equal(model.mondayOf(MON_16), MON_16);
    assert.equal(model.mondayOf("2026-11-22"), MON_16);
    assert.equal(model.mondayOf("2026-11-23"), MON_23);
    assert.equal(model.mondayOf("nonsense"), "");
    assert.equal(model.chosenMonday(null, NOW), MON_16);
    assert.equal(model.chosenMonday("2026-11-25", NOW), MON_23);
    assert.equal(model.chosenMonday("2026-13-45", NOW), MON_16);
  });

  test("next week: every group of both programmes, each its session that week with its day, time, campus and room", () => {
    const view = model.weekRoomsView({
      programmes: [recordsOf(TAIS, RUN.tais), recordsOf(AGI, RUN.agi)],
      monday: MON_23,
      only: null,
      now: NOW,
    });
    assert.deepEqual(
      view.rows.map((row) => [row.programmeName, row.groupName, row.weekNumber, row.when, row.room, row.state]),
      [
        ["Technical AI Safety", "Group A", 4, "Mon 23 Nov, 5pm", "Jubilee B01", null],
        ["AGI Strategy", "Group B", 4, "Tue 24 Nov, 6pm", "Hallward B12", null],
        ["AGI Strategy", "Group C", 4, "Wed 25 Nov, 1pm", "Room B8", null],
        ["AGI Strategy", "Group A", 5, "Thu 26 Nov, 6pm", "Portland A13", null],
      ],
    );
    assert.equal(view.weekLabel, "w/c Mon 23 Nov");
    assert.deepEqual(view.programmes.map((each) => [each.programmeName, each.rows]), [["Technical AI Safety", 1], ["AGI Strategy", 3]]);
    assert.equal(view.allRows, 4);
    assert.deepEqual(view.counts, { notBooked: 0, linksSet: 0, away: 0, online: 0, requests: 0 });
    assert.equal(view.elsewhere, null);
  });

  test("one programme: its rows alone, every chip still counted", () => {
    const view = model.weekRoomsView({
      programmes: [recordsOf(TAIS, RUN.tais), recordsOf(AGI, RUN.agi)],
      monday: MON_23,
      only: TAIS,
      now: NOW,
    });
    assert.deepEqual(view.rows.map((row) => row.groupId), [TAIS_A]);
    assert.equal(view.allRows, 4);
  });

  test("this week: a session whose time has passed is not changed here; one still to come is", () => {
    const records = recordsOf(AGI, RUN.agi, { registers: { [registerId(C, 3)]: { pushedAt: new Date(), markedByUid: "tom" } } });
    const view = model.weekRoomsView({ programmes: [records], monday: MON_16, only: null, now: NOW });
    assert.deepEqual(
      view.rows.map((row) => [row.groupName, row.weekNumber, row.state]),
      [
        // Tue 17 Nov has passed and nobody took its register: started, put right on the group's page.
        ["Group B", 3, "started"],
        // Wed 18 Nov met: its register was taken.
        ["Group C", 3, "met"],
        // Today, 6pm: still to come.
        ["Group A", 4, null],
      ],
    );
  });

  test("a room not booked, the link for every week or one week, a week called off and a week held online", () => {
    w.reset(
      seed({
        [`courseGroups/${A}`]: { ...read(`courseGroups/${A}`), session: { ...read(`courseGroups/${A}`).session, location: "" } },
      }),
    );
    world.db.poke(`courseGroups/${B}`, { session: { ...read(`courseGroups/${B}`).session, meetingUrl: "https://meet.example/b" } });
    world.db.poke(`courseGroups/${C}`, {
      sessionOverrides: { w04: { meetingUrl: "https://meet.example/c4" } },
      sessionChanges: { w04: { kind: "cancelled", reason: "Away", dateKey: "2026-11-25", byUid: "zach", at: null } },
    });
    const view = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: MON_23, only: null, now: NOW });
    const row = (name) => view.rows.find((each) => each.groupName === name);
    assert.deepEqual(row("Group B").link, { kind: "every", words: "Set: every week" });
    assert.deepEqual(row("Group C").link, { kind: "week", words: "Set: week 4 only" });
    assert.equal(row("Group C").state, "cancelled");
    assert.deepEqual(row("Group A").link, { kind: "none", words: "No link" });
    assert.equal(row("Group A").room, "");
    assert.equal(row("Group A").state, null);
    // A called-off week is no room to book.
    assert.deepEqual(view.counts, { notBooked: 1, linksSet: 2, away: 0, online: 0, requests: 0 });

    world.db.poke(`courseGroups/${B}`, { sessionModes: { w04: "virtual" } });
    const online = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: MON_23, only: null, now: NOW });
    assert.equal(online.rows.find((each) => each.groupName === "Group B").state, "online");
  });

  test("away, online and requests come off the session's own register and the requests counted for the reader", () => {
    const records = recordsOf(AGI, RUN.agi, {
      registers: {
        [registerId(B, 4)]: {
          records: { amara: "excused", ines: "present" },
          excusedInAdvance: { amara: new Date(), omar: new Date() },
          onlineSaid: { ines: new Date() },
        },
      },
      requests: { [`${B}__w04`]: 2 },
    });
    const view = model.weekRoomsView({ programmes: [records], monday: MON_23, only: null, now: NOW });
    const b = view.rows.find((each) => each.groupId === B);
    assert.deepEqual([b.away, b.online, b.requests], [2, 1, 2]);
    assert.deepEqual(view.counts, { notBooked: 0, linksSet: 0, away: 2, online: 1, requests: 2 });
    assert.deepEqual(words.summaryWords(view.counts), ["0 not booked", "0 links set", "2 people away", "1 joining online", "2 requests waiting"]);
  });

  test("the week picker runs from the first week with a session to the last, tagged as the board tags it", () => {
    const view = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: MON_23, only: null, now: NOW });
    assert.equal(view.weeks[0].monday, "2026-10-26");
    assert.equal(view.weeks[view.weeks.length - 1].monday, "2026-12-07");
    const tagged = Object.fromEntries(view.weeks.map((week) => [week.monday, [week.label, week.tag]]));
    assert.deepEqual(tagged[MON_16], ["w/c Mon 16 Nov", "this week"]);
    assert.deepEqual(tagged[MON_23], ["w/c Mon 23 Nov", "next week"]);
    assert.deepEqual(tagged["2026-11-30"], ["w/c Mon 30 Nov", ""]);
    assert.equal(view.previous, MON_16);
    assert.equal(view.next, "2026-11-30");
  });

  test("a week with no sessions: no rows, and the way to the nearest week that has some", () => {
    const after = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: "2026-12-14", only: null, now: NOW });
    assert.deepEqual(after.rows, []);
    assert.deepEqual(after.elsewhere, { monday: "2026-12-07", direction: "last" });
    const tagged = after.weeks.find((week) => week.monday === "2026-12-14");
    assert.equal(tagged.tag, "no sessions");
    const before = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: "2026-10-12", only: null, now: NOW });
    assert.deepEqual(before.elsewhere, { monday: "2026-10-26", direction: "next" });
    const nothing = model.weekRoomsView({ programmes: [], monday: MON_23, only: null, now: NOW });
    assert.deepEqual([nothing.rows, nothing.elsewhere], [[], null]);
  });

  test("the registers a week reads: one a row, by id", () => {
    const ids = model.registerIdsForWeek([recordsOf(AGI, RUN.agi)], MON_23);
    assert.deepEqual(ids.sort(), [registerId(A, 5), registerId(B, 4), registerId(C, 4)].sort());
  });
});

describe("1. the term's grid, from records", () => {
  test("a column a taught week, a row a group, each cell that week's room and what is unusual about it", () => {
    world.db.poke(`courseGroups/${B}`, {
      sessionOverrides: { w04: { weekday: 2, startTimeLocal: "18:00", location: "Portland A21" }, w02: { location: "Hallward B12" } },
      sessionChanges: {
        w04: { kind: "moved", reason: "Exam", dateKey: "2026-11-24", byUid: "claudia", at: null },
        w05: { kind: "cancelled", reason: "Away", dateKey: "2026-12-01", byUid: "claudia", at: null },
      },
    });
    world.db.poke(`courseGroups/${C}`, { sessionModes: { w06: "virtual" }, sessionOverrides: { w03: { location: "Room C1" } } });
    const records = recordsOf(AGI, RUN.agi, { registers: { [registerId(B, 1)]: { pushedAt: new Date() } } });
    const [section] = model.termRoomsView({ roundId: ROUND, programmes: [records] });
    assert.deepEqual(section.weeks.map((week) => [week.label, week.from]), [
      ["Week 1", "Thu 29 Oct"],
      ["Week 2", "Thu 5 Nov"],
      ["Week 3", "Thu 12 Nov"],
      ["Week 4", "Thu 19 Nov"],
      ["Week 5", "Thu 26 Nov"],
      ["Week 6", "Thu 3 Dec"],
    ]);
    const b = section.rows.find((row) => row.groupId === B);
    assert.deepEqual(
      b.cells.map((cell) => [cell.weekNumber, cell.day, cell.room, cell.marks]),
      [
        [1, "Tue 3 Nov", "Hallward B12", ["met"]],
        [2, "Tue 10 Nov", "Hallward B12", []],
        [3, "Tue 17 Nov", "Hallward B12", []],
        [4, "Tue 24 Nov", "Portland A21", ["moved", "notUsual"]],
        [5, "Tue 1 Dec", "Hallward B12", ["cancelled"]],
        [6, "Tue 8 Dec", "Hallward B12", []],
      ],
    );
    const c = section.rows.find((row) => row.groupId === C);
    assert.deepEqual(c.cells[2].marks, ["notUsual"]);
    assert.deepEqual(c.cells[5].marks, ["online"]);
    // A cell opens its week on the week's rooms, its programme alone, its row in view.
    assert.equal(b.cells[3].href, `/admin/admissions/forms/${ROUND}/rooms?week=${MON_23}&programme=${AGI}#room-${B}__w04`);
  });

  test("Download saves what the page shows, and nothing about anybody", () => {
    const view = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: MON_23, only: null, now: NOW });
    const week = csv.weekRoomsCsv(view.rows);
    assert.deepEqual(week.header, ["Programme", "Group", "Day and time", "Campus", "This week’s room", "Link", "Away", "Online", "Requests"]);
    assert.deepEqual(week.body[0], ["AGI Strategy", "Group B", "Tue 24 Nov, 6pm", "", "Hallward B12", "No link", "0", "0", "0"]);
    const [section] = model.termRoomsView({ roundId: ROUND, programmes: [recordsOf(AGI, RUN.agi)] });
    const term = csv.termRoomsCsv([section]);
    assert.deepEqual(term.header, ["Programme", "Group", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"]);
    assert.equal(term.body.length, 3);
    for (const line of [...week.body, ...term.body]) for (const cell of line) assert.ok(!cell.includes("@"), cell);
  });
});

// ---------------------------------------------------------------------------
// 2. The paste box
// ---------------------------------------------------------------------------

describe("2. the paste box matches loosely and asks about the rest", () => {
  /** The board's own week: eleven AGI groups, two of TAIS, one each of two incubators. */
  const candidates = [
    ...["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((letter) => ({
      key: `agi-${letter}`,
      programmeName: "AGI Strategy",
      groupName: `Group ${letter}`,
      room: letter === "A" ? "" : letter === "B" ? "George Green B09" : letter === "C" ? "Portland A21" : "Somewhere",
      notHere: null,
    })),
    { key: "tais-A", programmeName: "Technical AI Safety", groupName: "Group A", room: "", notHere: null },
    { key: "tais-E", programmeName: "Technical AI Safety", groupName: "Group E", room: "", notHere: null },
    { key: "gov-A", programmeName: "Governance and Macrostrategy", groupName: "Group A", room: "", notHere: "Met" },
    { key: "ari-A", programmeName: "Alignment Research Incubator", groupName: "Group A", room: "", notHere: null },
  ];

  test("short names, in any case and spacing; a programme with one group may be named alone", () => {
    assert.deepEqual(paste.programmeAliases("Technical AI Safety"), [["technical", "ai", "safety"], ["technical"], ["tais"], ["tas"]]);
    assert.deepEqual(paste.programmeAliases("Governance and Macrostrategy"), [["governance", "and", "macrostrategy"], ["governance"], ["gm"]]);
    assert.deepEqual(paste.matchGroup("AGI A", candidates), { kind: "matched", key: "agi-A" });
    assert.deepEqual(paste.matchGroup("  agi   group a ", candidates), { kind: "matched", key: "agi-A" });
    assert.deepEqual(paste.matchGroup("TAIS A", candidates), { kind: "matched", key: "tais-A" });
    assert.deepEqual(paste.matchGroup("technical ai safety, Group A", candidates), { kind: "matched", key: "tais-A" });
    assert.deepEqual(paste.matchGroup("Alignment", candidates), { kind: "matched", key: "ari-A" });
    assert.deepEqual(paste.matchGroup("Governance A", candidates), { kind: "matched", key: "gov-A" });
  });

  test("never a guess: two groups are asked about, a near miss is suggested, and nothing is matched across what was handed in", () => {
    assert.deepEqual(paste.matchGroup("Group E", candidates), { kind: "ambiguous", keys: ["agi-E", "tais-E"] });
    assert.deepEqual(paste.matchGroup("Grp K", candidates), { kind: "suggest", key: "agi-K" });
    assert.deepEqual(paste.matchGroup("Grp A", candidates).kind, "ambiguous");
    assert.deepEqual(paste.matchGroup("Mystery group", candidates), { kind: "none" });
    // A programme the reader may not see is not a candidate, so nothing is matched to it: at most
    // the person is asked whether they meant a group they can see.
    const own = candidates.filter((each) => each.programmeName === "AGI Strategy");
    assert.deepEqual(paste.matchGroup("TAIS A", own), { kind: "suggest", key: "agi-A" });
    assert.deepEqual(paste.matchGroup("TAIS", own), { kind: "none" });
    assert.deepEqual(paste.matchGroup("Group E", own), { kind: "matched", key: "agi-E" });
  });

  test("the board's six lines: four ready (two new rooms, two unchanged) and two that need the person", () => {
    const pasted = [
      "AGI A\tMonica Partridge C10",
      "AGI B\tGeorge Green B09",
      "AGI C  Portland A21",
      "Grp K Monica Partridge C15",
      "TAIS A Computer Science A32",
      "Group E\tGeorge Green A03",
      "",
    ].join("\n");
    const lines = paste.readPasted(pasted, candidates);
    assert.deepEqual(
      lines.map((line) => [line.number, line.group, line.room, line.match.kind]),
      [
        [1, "AGI A", "Monica Partridge C10", "matched"],
        [2, "AGI B", "George Green B09", "matched"],
        [3, "AGI C", "Portland A21", "matched"],
        [4, "Grp K", "Monica Partridge C15", "suggest"],
        [5, "TAIS A", "Computer Science A32", "matched"],
        [6, "Group E", "George Green A03", "ambiguous"],
      ],
    );
    const outcomes = paste.outcomesOf(lines, candidates, new Map());
    assert.deepEqual(outcomes.map((each) => each.kind), ["new", "same", "same", "ask", "new", "ask"]);
    assert.equal(
      words.pasteSummaryWords(paste.pasteCounts(outcomes)),
      "6 lines: 4 are ready (2 new rooms, 2 unchanged) and 2 need you. Nothing is saved until you press Save.",
    );
    // The person takes the suggestion and chooses between the two; the lines are ready.
    const chosen = new Map([
      [4, "agi-K"],
      [6, "agi-E"],
    ]);
    assert.deepEqual(
      paste.outcomesOf(lines, candidates, chosen).map((each) => [each.kind, each.key ?? null, each.room ?? null]),
      [
        ["new", "agi-A", "Monica Partridge C10"],
        ["same", "agi-B", null],
        ["same", "agi-C", null],
        ["change", "agi-K", "Monica Partridge C15"],
        ["new", "tais-A", "Computer Science A32"],
        ["change", "agi-E", "George Green A03"],
      ],
    );
  });

  test("a room is the field's: one line, no link, at most its limit; a group twice, or one not changed this week, is asked about", () => {
    const lines = paste.readPasted(
      ["AGI A\t", "AGI D\thttps://meet.example/room", `AGI F\t${"x".repeat(201)}`, "AGI G\tRoom 1", "AGI G\tRoom 2", "Governance\tRoom 3"].join("\n"),
      candidates,
    );
    assert.deepEqual(
      paste.outcomesOf(lines, candidates, new Map()).map((each) => [each.kind, each.problem ?? each.firstLine ?? each.why ?? null]),
      [
        ["room", "noRoom"],
        ["room", "roomLink"],
        ["room", "tooLong"],
        ["change", null],
        ["duplicate", 4],
        ["notHere", "Met"],
      ],
    );
    assert.equal(paste.roomProblem("Portland A21"), null);
  });
});

// ---------------------------------------------------------------------------
// 3. Who, and what each page reads
// ---------------------------------------------------------------------------

describe("3. the week's rooms and the term's rooms are an admin's and a programme's lead's", () => {
  test("an admin: every programme on the form, the week asked for", async () => {
    const { drawn, rows } = await rowsFor("zach", { week: "2026-11-25" });
    assert.ok(rows, drawn.text.slice(0, 300));
    assert.deepEqual(rows.map((row) => [row.programmeName, row.groupName]), [
      ["Technical AI Safety", "Group A"],
      ["AGI Strategy", "Group B"],
      ["AGI Strategy", "Group C"],
      ["AGI Strategy", "Group A"],
    ]);
    assert.ok(drawn.text.includes("The week’s rooms"));
    assert.ok(drawn.text.includes("w/c Mon 23 Nov"));
    assert.ok(drawn.text.includes("A room changed here is for that week. For every week, change it on the group’s page."));
    assert.ok(drawn.text.includes("Changing a room emails that group: it’s a notice."));
    assert.equal(drawn.wrote, false);
    // What it read: the form, the runs, their groups, the week's registers and requests. Nobody's account or place.
    assert.deepEqual([...new Set(drawn.reads)].sort(), ["admissionRounds", "courseAttendance", "courseGroups", "courseRequests", "courseRuns"]);
  });

  test("the lead of AGI Strategy: its groups and nothing of the other programme", async () => {
    const { drawn, rows } = await rowsFor("claudia", { week: MON_23 });
    assert.deepEqual(rows.map((row) => row.programmeName), ["AGI Strategy", "AGI Strategy", "AGI Strategy"]);
    assert.ok(!drawn.text.includes("Technical AI Safety"), "the lead is told the other programme exists");
    assert.ok(!drawn.html.includes(TAIS), "the other programme's id reaches the lead's page");
  });

  test("the lead of another programme: their own, and asking for this one is the same as asking for nothing", async () => {
    const own = await rowsFor("tess", { week: MON_23 });
    assert.deepEqual(own.rows.map((row) => [row.programmeName, row.groupName]), [["Technical AI Safety", "Group A"]]);
    assert.ok(!own.drawn.text.includes("AGI Strategy"));
    const theirs = await draw(WeekRoomsPage, "tess", { programme: AGI });
    const nothing = await draw(WeekRoomsPage, "tess", { programme: "no-such-programme" });
    assert.ok(theirs.text.includes("There is no programme here"));
    assert.equal(theirs.html, nothing.html);
    for (const Page of [WeekRoomsPage, TermRoomsPage]) {
      const asked = await draw(Page, "tess", { programme: AGI });
      assert.ok(!asked.reads.includes("courseRuns"), "a run was read for somebody it is not for");
    }
  });

  test("a reviewer, a form that is not there: 'there is no programme here', before any run is read", async () => {
    for (const [who, roundId] of [
      ["lloyd", ROUND],
      ["zach", "no-such-form"],
    ]) {
      for (const Page of [WeekRoomsPage, TermRoomsPage]) {
        const drawn = await draw(Page, who, {}, roundId);
        assert.ok(drawn.text.includes("There is no programme here"), `${who}: ${drawn.text.slice(0, 200)}`);
        assert.deepEqual([...new Set(drawn.reads)], ["admissionRounds"]);
        assert.equal(drawn.wrote, false);
      }
    }
  });

  test("a track lead, a facilitator, a member and somebody signed out: sent to the dashboard by the tree's gate", async () => {
    for (const who of ["yusuf", "rahul", "amara", "nobody", null]) {
      for (const Page of [WeekRoomsPage, TermRoomsPage]) {
        const drawn = await draw(Page, who);
        assert.equal(drawn.to, "/dashboard", `${who} reached the page`);
        assert.deepEqual(drawn.reads, [], `${who}: something was read`);
      }
    }
  });

  test("the term's rooms: an admin both programmes, a lead their own, every cell a link to its week", async () => {
    const admin = await draw(TermRoomsPage, "zach");
    const [grid] = find(admin.element, "TermRoomsGrid");
    assert.deepEqual(grid.props.sections.map((section) => section.programmeName), ["Technical AI Safety", "AGI Strategy"]);
    assert.ok(admin.text.includes("The term’s rooms"));
    assert.deepEqual([...new Set(admin.reads)].sort(), ["admissionRounds", "courseAttendance", "courseGroups", "courseRuns"]);
    assert.equal(admin.wrote, false);
    assert.ok(admin.html.includes(`/admin/admissions/forms/${ROUND}/rooms?week=${MON_23}&amp;programme=${AGI}#room-`));
    const lead = await draw(TermRoomsPage, "claudia");
    const [own] = find(lead.element, "TermRoomsGrid");
    assert.deepEqual(own.props.sections.map((section) => section.programmeName), ["AGI Strategy"]);
    assert.ok(!lead.text.includes("Technical AI Safety"));
  });

  test("the Sessions view leads to both, already filtered to its programme", async () => {
    const page = readFileSync(join(SRC, "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "groups", "sessions", "page.tsx"), "utf8");
    assert.match(page, /weekRoomsPath\(view\.roundId, \{ programme: view\.programmeId \}\)/);
    assert.match(page, /termRoomsPath\(view\.roundId, view\.programmeId\)/);
  });
});

// ---------------------------------------------------------------------------
// 4. One writer
// ---------------------------------------------------------------------------

describe("4. a room saved here is the one-week change, pressed as the group's page presses it", () => {
  /** Group A's week 5 row, as the lead's page hands it. */
  async function rowOfA(who = "claudia") {
    const { rows } = await rowsFor(who, { week: MON_23 });
    return rows.find((row) => row.groupId === A);
  }

  test("the preview counts whom it emails; the press moves nothing but the room, writes the history row and tells the group", async () => {
    const row = await rowOfA();
    const post = postAs("claudia");
    const before = read(`courseGroups/${A}`);
    const preview = await press.askPreview(post, row, "Monica Partridge C10");
    assert.equal(preview.status, "ok", JSON.stringify(preview));
    const expected = await w.changeEmailsFor(A, "claudia");
    assert.equal(preview.emails, expected);
    assert.equal(preview.tells, true);
    assert.deepEqual(read(`courseGroups/${A}`), before, "a preview wrote something");
    assert.equal(world.mail.length, 0);

    const outcome = await press.saveRoom(post, row, "Monica Partridge C10", preview, "The usual room is booked for an exam.");
    assert.equal(outcome.saved, true, JSON.stringify(outcome));
    assert.equal(outcome.tone, "done", outcome.text);
    const group = read(`courseGroups/${A}`);
    assert.deepEqual(
      [group.sessionOverrides.w05.weekday, group.sessionOverrides.w05.startTimeLocal, group.sessionOverrides.w05.location],
      [4, "18:00", "Monica Partridge C10"],
    );
    assert.equal(group.session.location, "Portland A13", "the room for every week changed");
    assert.equal(group.sessionChanges.w05.kind, "moved");
    const [history] = auditRows("session-moved");
    assert.equal(history.emailed, expected);
    assert.equal(history.reason, "The usual room is booked for an exam.");
    const mail = await mailRead();
    assert.equal(mail.length, expected);
    for (const message of mail) {
      assert.equal(message.subject, "Week 5 moves to Thu 26 Nov, 6pm");
      assert.ok(message.text.includes("Monica Partridge C10"), message.text);
      assert.ok(message.text.includes("Why: The usual room is booked for an exam."), message.text);
    }
  });

  test("the same email, the same history and the same change as a press from the group's page", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "Monica Partridge C10");
    await press.saveRoom(postAs("claudia"), row, "Monica Partridge C10", preview, "Exam.");
    const here = {
      mail: (await mailRead()).map((each) => [each.to, each.subject, each.text]).sort(),
      history: auditRows("session-moved").map((each) => [each.detail, each.before, each.after, each.emailed]),
      group: read(`courseGroups/${A}`).sessionOverrides,
    };

    w.reset(seed());
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
    // The group page's own press (the dialog's way: the count read first, then the change, then the update).
    await w.press("claudia", A, {
      week: 5,
      dateKey: "2026-11-26",
      kind: "move",
      move: { dateKey: "2026-11-26", time: "18:00", room: "Monica Partridge C10" },
      reason: "Exam.",
    });
    const there = {
      mail: (await mailRead()).map((each) => [each.to, each.subject, each.text]).sort(),
      history: auditRows("session-moved").map((each) => [each.detail, each.before, each.after, each.emailed]),
      group: read(`courseGroups/${A}`).sessionOverrides,
    };
    assert.deepEqual(here, there);
  });

  test("a room set where there was none: the writer's move, as today, with the room in its email", async () => {
    world.db.poke(`courseGroups/${A}`, { session: { ...read(`courseGroups/${A}`).session, location: "" } });
    const row = await rowOfA();
    assert.equal(row.room, "");
    const preview = await press.askPreview(postAs("claudia"), row, "George Green B06");
    const outcome = await press.saveRoom(postAs("claudia"), row, "George Green B06", preview, "Booked at last.");
    assert.equal(outcome.saved, true, outcome.text);
    assert.equal(auditRows("session-moved").length, 1);
    const [message] = await mailRead();
    assert.equal(message.subject, "Week 5 moves to Thu 26 Nov, 6pm");
    assert.ok(message.text.includes("George Green B06"));
  });

  test("a room emptied is Room to be confirmed, as the writer says it", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "  ");
    assert.equal(preview.status, "ok", JSON.stringify(preview));
    const outcome = await press.saveRoom(postAs("claudia"), row, "", preview, "The room fell through.");
    assert.equal(outcome.saved, true, outcome.text);
    assert.equal(read(`courseGroups/${A}`).sessionOverrides.w05.location, "");
    assert.deepEqual(press.moveOf(row, " "), { dateKey: "2026-11-26", time: "18:00", room: "", roomToBeConfirmed: true });
  });

  test("the writer's own refusals: a session whose time has passed, and one that met", async () => {
    const { rows } = await rowsFor("claudia", { week: MON_16 });
    const b = rows.find((row) => row.groupId === B);
    const passed = await press.askPreview(postAs("claudia"), b, "Portland A21");
    assert.deepEqual([passed.status, passed.error], ["refused", changeWords.REFUSAL.movedIntoPast]);
    world.db.seed(`courseAttendance/${registerId(B, 3)}`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 3,
      records: { amara: "present" },
      markedByUid: "rahul",
      pushedAt: new Date("2026-11-17T20:00:00Z"),
    });
    const met = await press.askPreview(postAs("claudia"), b, "Portland A21");
    assert.equal(met.status, "refused");
    assert.equal(world.mail.length, 0);
    assert.equal(auditRows("session-moved").length, 0);
  });

  test("a count that no longer holds: 409 with the new count, nothing changed and nobody emailed", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "Monica Partridge C10");
    // Somebody joins Group A after the button was counted.
    world.db.poke(`courseEnrolments/${RUN.agi}__ines`, { groupId: A });
    const before = w.everything();
    const outcome = await press.saveRoom(postAs("claudia"), row, "Monica Partridge C10", preview, "Exam.");
    assert.equal(outcome.saved, false);
    assert.equal(outcome.emails, preview.emails + 1);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a view-as session is refused, and nothing is written", async () => {
    const row = await rowOfA("zach");
    const preview = await press.askPreview(postAs("zach"), row, "Monica Partridge C10");
    const before = w.everything();
    const outcome = await press.saveRoom(postAs("zach", { viewAs: true }), row, "Monica Partridge C10", preview, "Exam.");
    assert.equal(outcome.saved, false);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("the lead of another programme cannot press this one's rooms", async () => {
    const row = await rowOfA("zach");
    const preview = await press.askPreview(postAs("tess"), row, "Monica Partridge C10");
    assert.equal(preview.status, "refused");
    const outcome = await press.saveRoom(postAs("tess"), row, "Monica Partridge C10", { room: "x", status: "ok", emails: 1, tells: true, overCap: false }, "Exam.");
    assert.equal(outcome.saved, false);
    assert.equal(world.mail.length, 0);
  });

  test("pasted, matched and saved one group at a time: each group emailed, each refusal said", async () => {
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w04: { kind: "cancelled", reason: "Away", dateKey: "2026-11-24", byUid: "zach", at: null } },
    });
    const { rows } = await rowsFor("zach", { week: MON_23 });
    const candidates = rows.map((row) => ({
      key: row.key,
      programmeName: row.programmeName,
      groupName: row.groupName,
      room: row.room,
      notHere: row.state === null ? null : words.ROW_STATE[row.state],
    }));
    const lines = paste.readPasted("AGI A\tMonica Partridge C10\nAGI B\tPortland A21\nTAIS A\tComputer Science A32\nAGI C\tRoom B8", candidates);
    const outcomes = paste.outcomesOf(lines, candidates, new Map());
    // Group B's week is called off: its line is not this week's to change; Group C's room is as it was.
    assert.deepEqual(outcomes.map((each) => each.kind), ["change", "notHere", "change", "same"]);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const results = [];
    for (const outcome of outcomes.filter((each) => each.kind === "change")) {
      const row = byKey.get(outcome.key);
      const preview = await press.askPreview(postAs("zach"), row, outcome.room);
      results.push(await press.saveRoom(postAs("zach"), row, outcome.room, preview, "Rooms for next week."));
    }
    assert.deepEqual(results.map((each) => each.saved), [true, true]);
    assert.equal(read(`courseGroups/${A}`).sessionOverrides.w05.location, "Monica Partridge C10");
    assert.equal(read(`courseGroups/${TAIS_A}`).sessionOverrides.w04.location, "Computer Science A32");
    assert.equal(auditRows("session-moved").length, 2);
  });
});

// ---------------------------------------------------------------------------
// 5. The markup the browser spec relies on
// ---------------------------------------------------------------------------

describe("5. what the browser spec reads is drawn", () => {
  test("the week picker, a row's id and its field's name, the reason, the button and the paste button", async () => {
    const { drawn } = await rowsFor("claudia", { week: MON_23 });
    assert.match(drawn.html, /<nav aria-label="Weeks">/);
    assert.ok(drawn.text.includes("w/c Mon 23 Nov next week"));
    assert.ok(drawn.html.includes(`id="room-${A}__w05"`));
    assert.ok(drawn.html.includes('aria-label="Room for AGI Strategy, Group A"'));
    assert.ok(drawn.text.includes("Reason (the group sees this)"));
    assert.ok(drawn.text.includes("Save rooms"));
    assert.ok(drawn.text.includes("Paste rooms from a spreadsheet"));
    assert.ok(drawn.text.includes("The term’s rooms"));
    // Nothing is pressable before the page is live.
    assert.match(drawn.html, /<input[^>]*aria-label="Room for AGI Strategy, Group A"[^>]*disabled=""/);
  });
});
