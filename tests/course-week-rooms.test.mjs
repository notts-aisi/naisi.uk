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
 *  4. ONE WRITER: a room saved from a row or a grid cell is the one-week
 *     change route's room-only kind (`kind: "room"`), pressed by the pages' own
 *     code (`src/lib/courses/weekRooms/press.ts`) against the real routes: the
 *     week's room and nothing else, never marked moved; its own History row;
 *     its own notice, told by the route itself to the people in the group that
 *     week; every refusal; a count that changed is a 409 that changes nothing;
 *     an admin and the programme's lead alone, a view-as session refused; the
 *     grid's several weeks of one group in one transaction, emailing nobody.
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
const gridPaste = await loadTs(join("lib", "courses", "weekRooms", "gridPaste.ts"));
const csv = await loadTs(join("lib", "courses", "weekRooms", "csv.ts"));
const press = await loadTs(join("lib", "courses", "weekRooms", "press.ts"));
const words = await loadTs(join("lib", "courses", "weekRooms", "words.ts"));
const changeWords = await loadTs(join("lib", "courses", "sessionChange", "words.ts"));
const room = await loadTs(join("lib", "courses", "sessionChange", "room.ts"));
const roomWords = await loadTs(join("lib", "courses", "sessionChange", "roomWords.ts"));
const regular = await loadTs(join("lib", "courses", "regularTime", "model.ts"));
const audience = await loadTs(join("lib", "courses", "updates", "audience.ts"));
const readers = await loadTs(join("lib", "courses", "updates", "readers.ts"));
const { compareGroupsByMeeting, normalizeCourseGroup } = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
const updatesRoute = await w.courseRoute("runs", "[runId]", "updates");
const modeRoute = await w.courseRoute("runs", "[runId]", "weeks", "[weekId]", "mode");

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

  test("a room not booked, the link for every week or one week, a week called off and a week held online", async () => {
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

    // A week given the link it had when a later week's press changed every week's link: kept, never "Set: week 4 only",
    // in the facilitator's list's words, by the same decision.
    world.db.poke(`courseGroups/${C}`, { sessionChanges: {}, sessionOverrides: { w04: { meetingUrl: "https://meet.example/c4", linkPinned: true } } });
    world.db.poke(`courseGroups/${A}`, { sessionOverrides: { w04: { meetingUrl: null, linkPinned: true } } });
    const kept = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: MON_23, only: null, now: NOW });
    const keptRow = (name) => kept.rows.find((each) => each.groupName === name);
    assert.deepEqual(keptRow("Group C").link, { kind: "kept", words: "Kept the link it had before" });
    assert.deepEqual(keptRow("Group A").link, { kind: "none", words: "No link" }, "a week kept with no link has none");
    assert.equal(kept.counts.linksSet, 2, "a kept link is a link set");
    const groupWords = await loadTs("lib/courses/groupPage/words.ts");
    assert.equal(groupWords.weekLinkWords, words.weekLinkWords, "the facilitator's list and this page say a week's link with one function");
    world.db.poke(`courseGroups/${A}`, { sessionOverrides: {} });

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

  test("the week picker runs from the first week with a session to the last, tagged this week, next week or no sessions", () => {
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
    const [section] = model.termRoomsView({ roundId: ROUND, programmes: [records], now: NOW });
    assert.deepEqual(section.weeks.map((week) => [week.label, week.from]), [
      ["Week 1", "Thu 29 Oct"],
      ["Week 2", "Thu 5 Nov"],
      ["Week 3", "Thu 12 Nov"],
      ["Week 4", "Thu 19 Nov"],
      ["Week 5", "Thu 26 Nov"],
      ["Week 6", "Thu 3 Dec"],
    ]);
    const b = section.rows.find((row) => row.groupId === B);
    // Each cell says where its room comes from (the week's own, or the usual room), and whether it can take a room here.
    assert.deepEqual(
      b.cells.map((cell) => [cell.weekNumber, cell.day, cell.room, cell.roomSource, cell.state, cell.marks]),
      [
        [1, "Tue 3 Nov", "Hallward B12", "usual", "met", ["met"]],
        [2, "Tue 10 Nov", "Hallward B12", "week", "started", ["started"]],
        [3, "Tue 17 Nov", "Hallward B12", "usual", "started", ["started"]],
        [4, "Tue 24 Nov", "Portland A21", "week", null, ["moved"]],
        [5, "Tue 1 Dec", "Hallward B12", "usual", "cancelled", ["cancelled"]],
        [6, "Tue 8 Dec", "Hallward B12", "usual", null, []],
      ],
    );
    assert.equal(b.cells[3].dateKey, "2026-11-24");
    const c = section.rows.find((row) => row.groupId === C);
    assert.deepEqual([c.cells[2].room, c.cells[2].roomSource, c.cells[2].marks], ["Room C1", "week", ["started"]]);
    assert.deepEqual([c.cells[5].state, c.cells[5].marks], ["online", ["online"]]);
    // A cell opens its week on the week's rooms, its programme alone, its row in view.
    assert.equal(b.cells[3].href, `/admin/admissions/forms/${ROUND}/rooms?week=${MON_23}&programme=${AGI}#room-${B}__w04`);
  });

  test("Download saves what the page shows, and nothing about anybody", () => {
    const view = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: MON_23, only: null, now: NOW });
    const week = csv.weekRoomsCsv(view.rows);
    assert.deepEqual(week.header, ["Programme", "Group", "Day and time", "Campus", "This week’s room", "Link", "Away", "Online", "Requests"]);
    assert.deepEqual(week.body[0], ["AGI Strategy", "Group B", "Tue 24 Nov, 6pm", "", "Hallward B12", "No link", "0", "0", "0"]);
    const [section] = model.termRoomsView({ roundId: ROUND, programmes: [recordsOf(AGI, RUN.agi)], now: NOW });
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
  /** A busy week: eleven AGI groups, two of TAIS, one each of two incubators. */
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
    // A programme the reader may not see (or the page is not showing) is not a candidate, so nothing
    // is matched to it, and no suggestion crosses to another programme's group of the same letter.
    const own = candidates.filter((each) => each.programmeName === "AGI Strategy");
    assert.deepEqual(paste.matchGroup("TAIS A", own), { kind: "none" });
    assert.deepEqual(paste.matchGroup("Grp A", own), { kind: "suggest", key: "agi-A" });
    assert.deepEqual(paste.matchGroup("AGI grp A", own), { kind: "suggest", key: "agi-A" });
    assert.deepEqual(paste.matchGroup("TAIS", own), { kind: "none" });
    assert.deepEqual(paste.matchGroup("Group E", own), { kind: "matched", key: "agi-E" });
  });

  test("six lines: four ready (two changes, two unchanged) and two that need the person", () => {
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
      "6 lines: 4 are ready (2 changes, 2 unchanged) and 2 need you. Nothing is saved until you press Save.",
    );
    // The person takes the suggestion and chooses between the two; the lines are ready. A choice is
    // kept under the line's group as pasted, so typing more in the box keeps it.
    const chosen = new Map([
      [paste.choiceKeyOf(lines[3]), "agi-K"],
      [paste.choiceKeyOf(lines[5]), "agi-E"],
    ]);
    const more = paste.readPasted(`${pasted}AGI D\tHallward B12\n`, candidates);
    assert.deepEqual(paste.outcomesOf(more, candidates, chosen).slice(3, 6).map((each) => each.key), ["agi-K", "tais-A", "agi-E"]);
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
        // An empty room is no room: Group A has none already.
        ["same", null],
        ["room", "roomLink"],
        ["room", "tooLong"],
        ["change", null],
        ["duplicate", 4],
        ["notHere", "Met"],
      ],
    );
    assert.equal(paste.roomProblem("Portland A21"), null);
  });

  test("TBC, to be confirmed, a dash or nothing take a room off; a third column is said; a quoted cell over two lines is refused", () => {
    for (const said of ["", "TBC", "tbc", "T.B.C.", "to be confirmed", "To Be Confirmed", "-", "  -  "]) {
      const lines = paste.readPasted(`AGI B\t${said}`, candidates);
      const [outcome] = paste.outcomesOf(lines, candidates, new Map());
      assert.deepEqual([outcome.kind, outcome.was], ["clear", "George Green B09"], JSON.stringify(said));
    }
    // "TBC Room" is a room's name.
    assert.equal(paste.outcomesOf(paste.readPasted("AGI B\tTBC Room", candidates), candidates, new Map())[0].kind, "change");
    const [third] = paste.readPasted("AGI C\tPortland A22\tbring a laptop", candidates);
    assert.deepEqual([third.room, third.ignored], ["Portland A22", true]);
    assert.equal(paste.readPasted("AGI C\tPortland A22\t", candidates)[0].ignored, false);
    // A spreadsheet copies a cell holding a line break in quotes: one line, refused, no stray quote.
    const quoted = paste.readPasted('AGI C\t"Portland\nA22"\nAGI D\tHallward B12', candidates);
    assert.deepEqual(quoted.map((line) => [line.group, line.room]), [["AGI C", "Portland\nA22"], ["AGI D", "Hallward B12"]]);
    const [refused] = paste.outcomesOf(quoted, candidates, new Map());
    assert.deepEqual([refused.kind, refused.problem], ["room", "roomLine"]);
    assert.equal(words.PASTE_STATE.roomLine, "A room is one line.");
  });
});

describe("1. a campus held online, and what counts as not booked", () => {
  test("a session held online by its campus is Online with no field; Not booked counts only rows that can take a room", () => {
    world.db.poke(`courseGroups/${C}`, { campus: "online", session: { ...read(`courseGroups/${C}`).session, location: "" } });
    world.db.poke(`courseGroups/${A}`, { session: { ...read(`courseGroups/${A}`).session, location: "" } });
    world.db.poke(`courseGroups/${B}`, { sessionModes: { w04: "virtual" }, session: { ...read(`courseGroups/${B}`).session, location: "" } });
    const view = model.weekRoomsView({ programmes: [recordsOf(AGI, RUN.agi)], monday: MON_23, only: null, now: NOW });
    const state = Object.fromEntries(view.rows.map((row) => [row.groupName, [row.state, row.room, row.roomSource]]));
    assert.deepEqual(state, {
      "Group B": ["online", "", "none"],
      "Group C": ["online", "", "none"],
      "Group A": [null, "", "none"],
    });
    assert.equal(view.counts.notBooked, 1);
    assert.deepEqual(words.summaryWords(view.counts)[0], "1 not booked");
    // The download says Online for a session held online, never To be confirmed; so does the term's.
    const rooms = Object.fromEntries(csv.weekRoomsCsv(view.rows).body.map((line) => [line[1], line[4]]));
    assert.deepEqual(rooms, { "Group B": "Online", "Group C": "Online", "Group A": "To be confirmed" });
    const [section] = model.termRoomsView({ roundId: ROUND, programmes: [recordsOf(AGI, RUN.agi)], now: NOW });
    const term = csv.termRoomsCsv([section]);
    const c = term.body.find((line) => line[1] === "Group C");
    assert.ok(c.slice(2).every((cell) => !cell.includes("To be confirmed")), c.join(" | "));
    assert.ok(c.slice(2).some((cell) => cell === "(Online)"), c.join(" | "));
  });
});

describe("2. what a paste box puts into the fields", () => {
  test("a room typed into the table survives more typing in the box and the refresh after a Save; Cancel takes back only what the box put", () => {
    const before = { k1: "Typed before" };
    // The box matches two rows.
    let state = paste.mergePasted(before, { k2: "Room 2", k3: "Room 3" }, before, new Map());
    assert.deepEqual(state.drafts, { k1: "Typed before", k2: "Room 2", k3: "Room 3" });
    // The person types over row 2 in the table, then keeps typing in the box (row 3 changes, row 2 does not).
    let drafts = { ...state.drafts, k2: "Typed in the table" };
    state = paste.mergePasted(drafts, { k2: "Room 2", k3: "Room 3b" }, before, state.pasted);
    assert.deepEqual(state.drafts, { k1: "Typed before", k2: "Typed in the table", k3: "Room 3b" });
    // A Save saves row 3, whose field goes; after the refresh its line reads unchanged and is no longer put.
    drafts = { ...state.drafts };
    delete drafts.k3;
    state = paste.mergePasted(drafts, { k2: "Room 2" }, before, state.pasted);
    assert.deepEqual(state.drafts, { k1: "Typed before", k2: "Typed in the table" });
    // Cancel: what the box still holds as put goes back; what was typed stays.
    state = paste.mergePasted({ ...state.drafts, k4: "Room 4" }, null, before, new Map([["k4", "Room 4"], ["k2", "Room 2"]]));
    assert.deepEqual(state.drafts, { k1: "Typed before", k2: "Typed in the table" });
  });
});

describe("2. the term grid's paste box reads a block", () => {
  const sections = () => model.termRoomsView({ roundId: ROUND, programmes: [recordsOf(AGI, RUN.agi)], now: NOW });

  test("a header of weeks (a number, w5, Week 6 or a date in the week) maps each column; cells that cannot take a room are skipped and say why", () => {
    const text = ["Group\tWeek 4\tw5\t2026-12-03\t3", "AGI A\tRoom 4\tRoom 5\tTBC\tRoom 3", "agi group b\tPortland A21\t\tHallward B12\t"].join("\n");
    const read = gridPaste.readBlock(text, sections(), new Map());
    assert.equal(read.header, true);
    assert.deepEqual(read.columns[0].weeks, [4, 5, 6, 3]);
    assert.equal(words.columnsTakenWords("AGI Strategy", read.columns[0].weeks, true), "AGI Strategy, columns read from the first line: week 4, week 5, week 6, week 3.");
    const [a, b] = read.lines;
    assert.deepEqual([a.groupId, b.groupId], [A, B]);
    assert.deepEqual(a.cells.map((cell) => cell.outcome.kind), ["change", "change", "clear", "skip"]);
    assert.equal(words.skippedWords(3, a.cells[3].outcome.why), "Week 3 skipped: started.");
    // Group B's usual room is Hallward B12, so week 6 says no change; an EMPTY cell leaves its week as it
    // is, even where the week cannot take a room; only TBC and its spellings take a room off.
    assert.deepEqual(b.cells.map((cell) => cell.outcome.kind), ["change", "leave", "same", "leave"]);
    assert.deepEqual(gridPaste.blockRooms(read), { [`${A}__4`]: "Room 4", [`${A}__5`]: "Room 5", [`${A}__6`]: "", [`${B}__4`]: "Portland A21" });
    assert.equal(
      words.blockSummaryWords({ changes: 4, skipped: 1, left: 2, needYou: 0 }),
      "4 rooms to change, 1 skipped, 2 empty cells left as they are. Nothing is saved until you press Save.",
    );
  });

  test("a date header takes, for each group, its session in that date's week: a group pushed back gets the room on that session, and the line says the day", () => {
    // Group B pushed back from week 4: its week 4 session is Tue 1 Dec, its week 5 Tue 8 Dec.
    world.db.poke(`courseGroups/${B}`, {
      paceWeekPlan: [
        ...[1, 2, 3].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` })),
        { kind: "break", label: "No session" },
        ...[4, 5, 6].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` })),
      ],
    });
    const [section] = sections();
    const b = section.rows.find((row) => row.groupId === B);
    assert.deepEqual(b.cells.filter((cell) => cell.kind === "session" && cell.weekNumber >= 4).map((cell) => [cell.weekNumber, cell.dateKey]).slice(0, 2), [
      [4, "2026-12-01"],
      [5, "2026-12-08"],
    ]);
    // A column dated Thu 26 Nov is the run's week 5 and Group A's; the week of Mon 30 Nov holds Group A's
    // week 6 (Thu 3 Dec) and Group B's week 4 (Tue 1 Dec), each said with its day.
    const read = gridPaste.readBlock("Group\t2026-11-26\t2026-11-30\nAGI A\tRoom X\tRoom Z\nAGI B\t\tRoom Y", [section], new Map());
    assert.deepEqual(read.columns[0].weeks, [5, 5]);
    const [a, bLine] = read.lines;
    assert.deepEqual(a.cells.map((cell) => [cell.outcome.weekNumber, cell.outcome.day]), [[5, undefined], [6, "Thu 3 Dec"]]);
    assert.deepEqual([bLine.cells[1].outcome.weekNumber, bLine.cells[1].outcome.day], [4, "Tue 1 Dec"]);
    assert.deepEqual(gridPaste.blockRooms(read), { [`${A}__5`]: "Room X", [`${A}__6`]: "Room Z", [`${B}__4`]: "Room Y" });
    assert.equal(words.cellLineWords(4, "Room Y", "Tue 1 Dec"), "Week 4, Tue 1 Dec: Room Y");
    // A date with no year, the same.
    const yearless = gridPaste.readBlock("Group\tTue 1 Dec\nAGI B\tRoom Y", [section], new Map());
    assert.equal(yearless.lines[0].cells[0].outcome.weekNumber, 4);
  });

  test("with no header the columns are the grid's weeks from its first, said before anything is saved; dates without a year; nothing across programmes", () => {
    const read = gridPaste.readBlock("AGI C\tR1\tR2\tR3\tR4\tR5", sections(), new Map());
    assert.equal(read.header, false);
    assert.deepEqual(read.columns[0].weeks, [1, 2, 3, 4, 5]);
    assert.deepEqual(read.lines[0].cells.map((cell) => cell.outcome.kind), ["skip", "skip", "skip", "change", "change"]);
    assert.deepEqual(gridPaste.readHead("Tue 24 Nov"), { kind: "yearless", month: 11, day: 24 });
    assert.equal(gridPaste.weekOfHead(gridPaste.readHead("24/11"), sections()[0].weeks), 4);
    assert.equal(gridPaste.weekOfHead(gridPaste.readHead("Wk 9"), sections()[0].weeks), null);
    // A group of a programme the grid does not show is asked about, never matched to this one's Group A.
    const other = gridPaste.readBlock("TAIS A\tRoom", sections(), new Map());
    assert.equal(other.lines[0].groupId, null);
    assert.equal(other.lines[0].match.kind, "none");
    // The person's choice for a line holds, and a group twice is asked about.
    const chosen = new Map([[paste.choiceKeyOf({ group: "TAIS A" }), A]]);
    const twice = gridPaste.readBlock("TAIS A\tR1\nAGI A\tR2", sections(), chosen);
    assert.deepEqual(twice.lines.map((line) => [line.groupId, line.duplicateOf]), [[A, null], [A, 1]]);
    assert.equal(words.gridSaveWords(34), "Save 34 rooms. Emails nobody.");
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
    assert.ok(drawn.text.includes("With Tell the group on, each group whose room changes is emailed: it’s a notice."));
    assert.ok(drawn.text.includes("Tell the group"));
    assert.equal(drawn.wrote, false);
    // What it read: the form, the runs, their groups, the week's registers, requests and places (who was in
    // which group that week). Nobody's account.
    assert.deepEqual([...new Set(drawn.reads)].sort(), [
      "admissionRounds",
      "courseAttendance",
      "courseEnrolments",
      "courseGroups",
      "courseRequests",
      "courseRuns",
    ]);
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
    // And, for each group, the record of its last rooms email, by id: no group here has been emailed, so no
    // History row is read for who pressed (tests/course-term-rooms-email.test.mjs reads one). Nobody's account.
    assert.deepEqual([...new Set(admin.reads)].sort(), ["admissionRounds", "courseAttendance", "courseGroups", "courseNudges", "courseRuns"]);
    assert.equal(admin.wrote, false);
    assert.ok(admin.html.includes(`/admin/admissions/forms/${ROUND}/rooms?week=${MON_23}&amp;programme=${AGI}#room-`));
    const lead = await draw(TermRoomsPage, "claudia");
    const [own] = find(lead.element, "TermRoomsGrid");
    assert.deepEqual(own.props.sections.map((section) => section.programmeName), ["AGI Strategy"]);
    assert.ok(!lead.text.includes("Technical AI Safety"));
  });

  test("All groups leads to both, already filtered to its programme", async () => {
    const page = readFileSync(join(SRC, "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "groups", "sessions", "page.tsx"), "utf8");
    assert.match(page, /weekRoomsPath\(view\.roundId, \{ programme: view\.programmeId \}\)/);
    assert.match(page, /termRoomsPath\(view\.roundId, view\.programmeId\)/);
  });
});

// ---------------------------------------------------------------------------
// 4. One writer
// ---------------------------------------------------------------------------

describe("4. a room saved here is the room-only change of that week, and nothing else", () => {
  /** Group A's week 5 row (Thu 26 Nov, 6pm, usually Portland A13), as the lead's page hands it. */
  async function rowOfA(who = "claudia") {
    const { rows } = await rowsFor(who, { week: MON_23 });
    return rows.find((row) => row.groupId === A);
  }
  /** Who a notice about week `week` of a group reaches, for the presser: that week's people and its facilitators. */
  async function weekEmailsFor(groupId, who, week) {
    const runGroups = await readers.loadRunGroups(world.courseDb, w.run().id);
    const found = await audience.updateEmailAudience(world.courseDb, w.run(), runGroups, "group", groupId, who, { withFacilitators: true, weekNumber: week });
    return found.refused ? 0 : found.recipients.length;
  }
  const updatesWritten = () => world.db.paths().filter((path) => path.startsWith("courseUpdates/")).map((path) => read(path));

  test("the preview counts whom it emails; the press changes the week's room alone, writes History and tells the group in the same request", async () => {
    const row = await rowOfA();
    assert.equal(row.roomSource, "usual");
    const post = postAs("claudia");
    const before = read(`courseGroups/${A}`);
    const preview = await press.askPreview(post, row, "George Green B06");
    assert.equal(preview.status, "ok", JSON.stringify(preview));
    const expected = await weekEmailsFor(A, "claudia", 5);
    assert.ok(expected > 0);
    assert.equal(preview.emails, expected);
    assert.equal(preview.tells, true);
    assert.deepEqual(read(`courseGroups/${A}`), before, "a preview wrote something");
    assert.equal(world.mail.length, 0);

    const outcome = await press.saveRoom(post, row, "George Green B06", preview, "", true);
    assert.deepEqual([outcome.saved, outcome.tone], [true, "done"], outcome.text);
    const group = read(`courseGroups/${A}`);
    // The week's room and nothing else: no day, no start, no change record, nothing marked moved.
    assert.deepEqual(group.sessionOverrides.w05, { location: "George Green B06" });
    assert.equal(group.sessionChanges?.w05, undefined);
    assert.deepEqual(group.session, before.session);
    const [history] = auditRows("session-room");
    assert.equal(auditRows("session-moved").length, 0);
    assert.equal(history.weekId, "w05");
    assert.equal(history.emailed, expected);
    assert.equal(history.detail, `Changed week 5’s room to George Green B06, for that week only. Before: Portland A13. Emailed ${expected}.`);
    // Told in the same request: the update on the programme page, and one email each.
    const [update] = updatesWritten();
    assert.deepEqual([update.to, update.groupId, update.title, update.email.settled, update.email.planned], ["group", A, "Week 5 is in George Green B06", true, expected]);
    const mail = await mailRead();
    assert.equal(mail.length, expected);
    for (const message of mail) {
      assert.equal(message.subject, "Week 5 is in George Green B06");
      assert.ok(message.text.includes("Group A’s week 5 session, Thu 26 Nov, 6pm to 8pm, is now in George Green B06, not Portland A13. The day and time are the same."), message.text);
      assert.ok(!message.text.includes("Why:"), message.text);
      assert.ok(!message.text.includes("new time"), message.text);
      assert.ok(!message.text.includes("moves"), message.text);
    }
  });

  test("a room set where there was none, and a room taken off though the group has a usual room: each in its own words", async () => {
    world.db.poke(`courseGroups/${A}`, { session: { ...read(`courseGroups/${A}`).session, location: "" } });
    let row = await rowOfA();
    assert.deepEqual([row.room, row.roomSource], ["", "none"]);
    let preview = await press.askPreview(postAs("claudia"), row, "George Green B06");
    assert.equal((await press.saveRoom(postAs("claudia"), row, "George Green B06", preview, "Booked at last", true)).saved, true);
    let [message] = await mailRead();
    assert.equal(message.subject, "Week 5 is in George Green B06");
    assert.ok(message.text.includes("Group A’s week 5 session, Thu 26 Nov, 6pm to 8pm, is in George Green B06. Why: Booked at last."), message.text);
    assert.equal(auditRows("session-room")[0].detail.startsWith("Set week 5’s room to George Green B06, for that week only. Before: Room to be confirmed."), true);

    w.reset(seed());
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
    row = await rowOfA();
    preview = await press.askPreview(postAs("claudia"), row, "TBC");
    assert.deepEqual([preview.status, preview.room], ["ok", ""]);
    assert.equal((await press.saveRoom(postAs("claudia"), row, "TBC", preview, "", true)).saved, true);
    // Stored as the week's own empty room, the way a move with Room to be confirmed stores it: never "TBC".
    assert.deepEqual(read(`courseGroups/${A}`).sessionOverrides.w05, { location: "" });
    [message] = await mailRead();
    assert.equal(message.subject, "Week 5: room to be confirmed");
    assert.ok(
      message.text.includes("Group A’s week 5 session, Thu 26 Nov, 6pm to 8pm, has no room yet. We’ll email you as soon as it’s booked. The day and time are the same."),
      message.text,
    );
    row = await rowOfA();
    assert.deepEqual([row.room, row.roomSource], ["", "none"]);
    // Typing the usual room back takes the week's own room away: it follows the group again.
    preview = await press.askPreview(postAs("claudia"), row, "Portland A13");
    assert.equal((await press.saveRoom(postAs("claudia"), row, "Portland A13", preview, "", false)).saved, true);
    assert.equal(read(`courseGroups/${A}`).sessionOverrides.w05, undefined);
    assert.equal((await rowOfA()).roomSource, "usual");
  });

  test("a week with only its room set still follows a new regular time and the Weeks tab's online; a moved week keeps its move", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "George Green B06");
    await press.saveRoom(postAs("claudia"), row, "George Green B06", preview, "", false);
    const group = w.group(A);
    // A new regular time from week 4: week 5 takes the new day and time and keeps its own room.
    const planned = regular.planRegularChange({
      run: w.run(),
      group,
      fromWeek: 4,
      slot: { weekday: 5, startTimeLocal: "17:00", durationMinutes: 120, location: "Portland A13", campus: null },
      registers: new Map(),
      storedOverrideWeekIds: Object.keys(read(`courseGroups/${A}`).sessionOverrides),
      now: NOW,
    });
    assert.equal(planned.ok, true, JSON.stringify(planned));
    const week5 = planned.plan.sessionsAfter.find((each) => each.weekNumber === 5 && each.occurrence === 1);
    assert.deepEqual([week5.dateKey, week5.session.startTimeLocal, week5.session.location], ["2026-11-27", "17:00", "George Green B06"]);
    assert.ok(planned.plan.moves.some((move) => move.weekNumber === 5));
    assert.deepEqual(planned.plan.ownTimes.map((own) => [own.weekNumber, own.kind]), [[5, "room"]]);
    // The Weeks tab's "This week is online" treats the group as unchanged and takes it online.
    for (const id of [A, B, C]) world.db.poke(`courseGroups/${id}`, { session: { ...read(`courseGroups/${id}`).session, meetingUrl: "https://meet.example/abc" } });
    const answer = await call("zach", modeRoute.PUT, { runId: RUN.agi, weekId: "w05" }, { body: { online: true }, course: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(read(`courseGroups/${A}`).sessionModes.w05, "virtual");
    // Neither the week's page nor the grid says Moved for it.
    const records = recordsOf(AGI, RUN.agi);
    const [section] = model.termRoomsView({ roundId: ROUND, programmes: [records], now: NOW });
    const cell = section.rows.find((each) => each.groupId === A).cells.find((each) => each.weekNumber === 5);
    assert.ok(!cell.marks.includes("moved"));
    assert.equal(cell.roomSource, "week");

    // A week that carries a real move keeps it: a room set on top changes its room alone.
    w.reset(seed());
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
    world.db.poke(`courseGroups/${A}`, {
      sessionOverrides: { w05: { weekday: 5, startTimeLocal: "17:00", location: "Portland A21" } },
      sessionChanges: { w05: { kind: "moved", reason: "Exam", dateKey: "2026-11-26", byUid: "claudia", at: null, was: {} } },
    });
    const moved = await rowOfA();
    assert.equal(moved.moved, true);
    const again = await press.askPreview(postAs("claudia"), moved, "George Green B06");
    assert.equal((await press.saveRoom(postAs("claudia"), moved, "George Green B06", again, "", false)).saved, true);
    const after = read(`courseGroups/${A}`);
    assert.deepEqual(after.sessionOverrides.w05, { weekday: 5, startTimeLocal: "17:00", location: "George Green B06" });
    assert.equal(after.sessionChanges.w05.kind, "moved");
  });

  test("refused, with nothing written and nobody told: started, met, called off, held online (its mode or the Online campus), the room it has", async () => {
    const { rows } = await rowsFor("claudia", { week: MON_16 });
    const b = rows.find((row) => row.groupId === B);
    const passed = await press.askPreview(postAs("claudia"), b, "Portland A21");
    assert.deepEqual([passed.status, passed.error], ["refused", roomWords.ROOM_REFUSAL.started]);
    world.db.seed(`courseAttendance/${registerId(B, 3)}`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 3,
      records: { amara: "present" },
      markedByUid: "rahul",
      pushedAt: new Date("2026-11-17T20:00:00Z"),
    });
    assert.deepEqual((await press.askPreview(postAs("claudia"), b, "Portland A21")).error, changeWords.REFUSAL.met);
    const row = await rowOfA();
    assert.equal((await press.askPreview(postAs("claudia"), row, "Portland A13")).error, roomWords.ROOM_REFUSAL.sameAsNow);
    const before = w.everything();
    for (const [label, over, error] of [
      ["called off", { sessionChanges: { w05: { kind: "cancelled", reason: "Away", dateKey: "2026-11-26", byUid: "zach", at: null } } }, roomWords.ROOM_REFUSAL.cancelled],
      ["its mode", { sessionModes: { w05: "virtual" } }, roomWords.ROOM_REFUSAL.online],
      ["the Online campus", { campus: "online" }, roomWords.ROOM_REFUSAL.online],
    ]) {
      w.reset(seed());
      world.db.poke(`courseGroups/${A}`, over);
      const answer = await call("claudia", w.change.POST, { groupId: A }, {
        body: { kind: "room", weeks: [{ week: 5, dateKey: "2026-11-26", room: "George Green B06" }], tell: false },
        course: true,
      });
      assert.deepEqual([answer.status, answer.body.error], [409, error], label);
    }
    assert.equal(world.mail.length, 0);
    assert.equal(auditRows("session-room").length, 0);
    assert.ok(before);
  });

  test("Tell the group off: the room is saved, nobody is emailed, and History says so", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "George Green B06");
    const outcome = await press.saveRoom(postAs("claudia"), row, "George Green B06", preview, "Exam", false);
    assert.deepEqual([outcome.saved, outcome.text], [true, words.ROOM_SAVED_NOBODY_TOLD]);
    assert.equal(world.mail.length, 0);
    assert.equal(updatesWritten().length, 0);
    const [history] = auditRows("session-room");
    assert.equal(history.emailed, 0);
    assert.ok(history.detail.endsWith("Reason: Exam. Nobody was emailed."), history.detail);
  });

  test("a count that changed, or fell to nobody, between the preview and the press: 409, nothing changed, and the row asks again", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "George Green B06");
    world.db.poke(`courseEnrolments/${RUN.agi}__ines`, { groupId: A });
    const before = w.everything();
    const outcome = await press.saveRoom(postAs("claudia"), row, "George Green B06", preview, "Exam.", true);
    assert.equal(outcome.saved, false);
    assert.deepEqual(outcome.asked, { emails: preview.emails + 1, overCap: false });
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
    // Nobody left to tell: asked again with nought, and the next press saves it without an email.
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: [] });
    world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { status: "withdrawn" });
    world.db.poke(`courseEnrolments/${RUN.agi}__ines`, { groupId: B });
    const nobody = await call("claudia", w.change.POST, { groupId: A }, {
      body: { kind: "room", weeks: [{ week: 5, dateKey: "2026-11-26", room: "George Green B06" }], tell: true, emailCount: 0 },
      course: true,
    });
    assert.deepEqual([nobody.status, nobody.body.emails], [409, 0]);
    const asked = { ...preview, emails: 0, tells: false };
    assert.equal((await press.saveRoom(postAs("claudia"), row, "George Green B06", asked, "", true)).saved, true);
    assert.equal(world.mail.length, 0);
  });

  test("a moved person: the notice reaches the group's people FOR THAT WEEK, and Away and Online count only them", async () => {
    // Tariq moves from Group C to Group A from week 6; Bea from Group A to Group C from week 5.
    world.db.poke(`courseEnrolments/${RUN.agi}__tariq`, { groupId: A, groupsByWeek: [{ groupId: C, fromWeek: 1 }, { groupId: A, fromWeek: 6 }] });
    world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { groupId: C, groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: C, fromWeek: 5 }] });
    // Bea's word for week 5, written on Group A's register before she moved.
    world.db.seed(`courseAttendance/${registerId(A, 5)}`, {
      runId: RUN.agi,
      groupId: A,
      weekNumber: 5,
      excusedInAdvance: { bea: { at: new Date() } },
      onlineSaid: { bea: { at: new Date() } },
    });
    // A withdrawn place on Group A writes its word for week 5 too: not counted either.
    world.db.poke(`courseEnrolments/${RUN.agi}__nina`, { groupId: A, status: "withdrawn" });
    world.db.poke(`courseAttendance/${registerId(A, 5)}`, { excusedInAdvance: { bea: { at: new Date() }, nina: { at: new Date() } } });
    const row = await rowOfA();
    assert.deepEqual([row.away, row.online], [0, 0]);
    assert.deepEqual([model.awayOn(read(`courseAttendance/${registerId(A, 5)}`)), model.onlineOn(read(`courseAttendance/${registerId(A, 5)}`))], [2, 1]);
    const preview = await press.askPreview(postAs("claudia"), row, "George Green B06");
    assert.equal(preview.emails, await weekEmailsFor(A, "claudia", 5));
    await press.saveRoom(postAs("claudia"), row, "George Green B06", preview, "", true);
    // Week 5: neither Bea (in Group C from week 5) nor Tariq (in Group A from week 6); the facilitator is.
    let to = (await mailRead()).map((each) => each.to).sort();
    assert.deepEqual(to, ["sofia@example.com"]);
    // Week 6: Tariq is.
    world.mail.length = 0;
    const { rows } = await rowsFor("claudia", { week: "2026-11-30" });
    const six = rows.find((each) => each.groupId === A);
    const sixPreview = await press.askPreview(postAs("claudia"), six, "George Green B06");
    await press.saveRoom(postAs("claudia"), six, "George Green B06", sixPreview, "", true);
    to = (await mailRead()).map((each) => each.to).sort();
    assert.deepEqual(to, ["sofia@example.com", "tariq@example.com"]);
  });

  test("the group page's one-week notice carries its week: with nobody moved, the same people, count and emails as before", async () => {
    const body = { week: 5, dateKey: "2026-11-26", kind: "move", move: { dateKey: "2026-11-26", time: "19:00", room: "Portland A13" }, reason: "Exam." };
    const panel = async (withWeek) => {
      const emailCount = await w.changeEmailsFor(A, "claudia");
      const changed = await w.ask.change("claudia", A, { ...body, tell: true, emailCount });
      const update = changed.body.update;
      assert.equal(update.weekNumber, 5);
      const told = await w.ask.post("claudia", {
        to: "group",
        groupId: update.groupId,
        title: update.title,
        message: update.message,
        email: true,
        emailCount: update.emailCount,
        withFacilitators: true,
        ...(withWeek ? { weekNumber: update.weekNumber } : {}),
      });
      return { status: told.status, mail: (await mailRead()).map((each) => [each.to, each.subject, each.text]).sort() };
    };
    const base = await panel(false);
    w.reset(seed());
    const now = await panel(true);
    assert.equal(base.status, 200);
    assert.deepEqual(now, base);

    // With somebody moved in from a later week, the update without its week no longer matches the count.
    w.reset(seed());
    world.db.poke(`courseEnrolments/${RUN.agi}__tariq`, { groupId: A, groupsByWeek: [{ groupId: C, fromWeek: 1 }, { groupId: A, fromWeek: 6 }] });
    const changed = await w.ask.change("claudia", A, { ...body, tell: true, emailCount: await weekEmailsFor(A, "claudia", 5) });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const update = changed.body.update;
    const post = (extra) =>
      w.ask.post("claudia", { to: "group", groupId: A, title: update.title, message: update.message, email: true, emailCount: update.emailCount, withFacilitators: true, ...extra });
    assert.equal((await post({})).status, 409);
    assert.equal((await post({ weekNumber: 5 })).status, 200);
    assert.ok(!(await mailRead()).some((each) => each.to === "tariq@example.com"));
    // The week is for an update to one group alone.
    const refused = await w.ask.post("claudia", { to: "everyone", title: "x", message: "y", email: false, weekNumber: 5 });
    assert.equal(refused.status, 400);
  });

  test("a view-as session and the lead of another programme are refused, and nothing is written", async () => {
    const row = await rowOfA("zach");
    const preview = await press.askPreview(postAs("zach"), row, "George Green B06");
    const before = w.everything();
    assert.equal((await press.saveRoom(postAs("zach", { viewAs: true }), row, "George Green B06", preview, "", true)).saved, false);
    assert.equal((await press.askPreview(postAs("tess"), row, "George Green B06")).status, "refused");
    const outcome = await press.saveRoom(postAs("tess"), row, "George Green B06", { room: "x", status: "ok", emails: 1, tells: true, overCap: false }, "", true);
    assert.equal(outcome.saved, false);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("as each persona: an admin and the programme's own lead; a facilitator and a track lead are sent to the group's page", async () => {
    const body = { kind: "room", weeks: [{ week: 5, dateKey: "2026-11-26", room: "George Green B06" }], tell: false };
    const as = async (who) => (await call(who, w.change.POST, { groupId: A }, { body, course: true })).status;
    // A member of the group, a facilitator of another group, a reviewer and the lead of another programme: refused.
    for (const who of ["bea", "rahul", "lloyd", "tess"]) assert.equal(await as(who), 403, who);
    assert.equal(await as(null), 401);
    assert.equal(world.mail.length, 0);
    assert.equal(auditRows("session-room").length, 0);
    // Group A's own facilitator and the run's track lead pass the route's gate, and are refused the room
    // kind in one sentence that sends them to the group's page; their one-week move is untouched.
    for (const who of ["sofia", "yusuf"]) {
      const answer = await call(who, w.change.POST, { groupId: A }, { body, course: true });
      assert.deepEqual([answer.status, answer.body.error], [403, roomWords.ROOM_REFUSAL.notYours], who);
    }
    assert.equal(read(`courseGroups/${A}`).sessionOverrides?.w05, undefined);
    const moved = await w.ask.change("sofia", A, {
      week: 5,
      dateKey: "2026-11-26",
      kind: "move",
      move: { dateKey: "2026-11-26", time: "19:00", room: "Portland A13" },
      reason: "Later.",
      tell: false,
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    // The programme's own lead and an admin may.
    w.reset(seed());
    assert.equal(await as("claudia"), 200);
    assert.deepEqual(read(`courseGroups/${A}`).sessionOverrides.w05, { location: "George Green B06" });
    w.reset(seed());
    assert.equal(await as("zach"), 200);
  });

  test("a change of case or spacing alone is saved as typed and emails nobody; a room taken off a group with no usual room stays the week's own", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "portland  a13");
    assert.deepEqual([preview.status, preview.quiet, preview.tells, preview.emails], ["ok", true, false, 0]);
    const outcome = await press.saveRoom(postAs("claudia"), row, "portland  a13", { ...preview, tells: true, emails: 3 }, "", true);
    assert.deepEqual([outcome.saved, outcome.text], [true, words.ROOM_SAVED_NOBODY_TOLD]);
    assert.deepEqual(read(`courseGroups/${A}`).sessionOverrides.w05, { location: "portland  a13" });
    assert.equal(world.mail.length, 0);
    assert.equal(auditRows("session-room")[0].emailed, 0);

    // Group A with no usual room: week 5 set, then taken off. The week keeps its own empty room, so a
    // usual room set later does not land on it.
    w.reset(seed());
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
    world.db.poke(`courseGroups/${A}`, { session: { ...read(`courseGroups/${A}`).session, location: "" } });
    const ask = (roomText) =>
      call("claudia", w.change.POST, { groupId: A }, { body: { kind: "room", weeks: [{ week: 5, dateKey: "2026-11-26", room: roomText }] }, course: true });
    assert.equal((await ask("George Green B06")).status, 200);
    assert.equal((await ask("tba.")).status, 200);
    assert.deepEqual(read(`courseGroups/${A}`).sessionOverrides.w05, { location: "" });
    world.db.poke(`courseGroups/${A}`, { session: { ...read(`courseGroups/${A}`).session, location: "Portland A13" } });
    const again = await rowOfA();
    assert.deepEqual([again.room, again.roomSource], ["", "none"]);
  });

  test("a send that fails keeps the room, tells the person pressing, and History says what was really sent", async () => {
    const row = await rowOfA();
    const preview = await press.askPreview(postAs("claudia"), row, "George Green B06");
    assert.ok(preview.emails > 1);
    // Every message refused at the door except the first.
    let seen = 0;
    world.mailFate = () => (seen++ === 0 ? "sent" : "fail");
    try {
      const outcome = await press.saveRoom(postAs("claudia"), row, "George Green B06", preview, "", true);
      const failed = preview.emails - 1;
      assert.deepEqual([outcome.saved, outcome.tone, outcome.notTold, outcome.text], [true, "problem", true, words.roomSavedNotToldWords(failed)]);
      assert.deepEqual(read(`courseGroups/${A}`).sessionOverrides.w05, { location: "George Green B06" });
      const [history] = auditRows("session-room");
      assert.equal(history.emailed, 1);
      assert.ok(history.detail.endsWith("Emailed 1."), history.detail);
      const [update] = updatesWritten();
      assert.deepEqual([update.email.planned, update.email.sent, update.email.failed, update.email.settled], [preview.emails, 1, failed, true]);
      assert.equal(words.notToldSummaryWords(["AGI Strategy, Group A"]), "Saved but not told: AGI Strategy, Group A.");
    } finally {
      world.mailFate = null;
    }
  });

  test("the body: one week to tell or preview, each week once, a room of one line and no link", async () => {
    const parse = (body) => room.parseRoomPress({ kind: "room", ...body });
    const week = (n, roomText = "Room 1") => ({ week: n, dateKey: "2026-11-26", room: roomText });
    assert.equal(parse({ weeks: [week(5), week(6)], tell: true, emailCount: 1 }).error, roomWords.ROOM_REFUSAL.tellOneWeek);
    assert.equal(parse({ weeks: [week(5), week(6)], preview: true }).error, roomWords.ROOM_REFUSAL.previewOneWeek);
    assert.equal(parse({ weeks: [week(5), week(5)] }).error, roomWords.ROOM_REFUSAL.weeks);
    assert.equal(parse({ weeks: [] }).error, roomWords.ROOM_REFUSAL.weeks);
    assert.equal(parse({ weeks: [week(5, "https://meet.example/x")] }).error, roomWords.ROOM_REFUSAL.roomLink);
    assert.equal(parse({ weeks: [week(5, "a\nb")] }).error, roomWords.ROOM_REFUSAL.room);
    assert.equal(parse({ weeks: [week(5, "x".repeat(201))] }).error, roomWords.ROOM_REFUSAL.room);
    assert.equal(parse({ weeks: [week(5)], move: {} }).error, changeWords.REFUSAL.body);
    assert.deepEqual(parse({ weeks: [week(5, " t.b.c. ")] }).value.weeks[0].room, "");
    assert.equal(parse({ weeks: [week(5)] }).value.tell, false);
    for (const said of ["", "  ", "TBC", "tbc", "T.B.C.", "T B C", "to be confirmed", "-", "TBA", "tba", "T.B.A.", "TBC.", "tba.", "To be confirmed.", "-."]) {
      assert.equal(room.isNoRoom(said), true, said);
    }
    for (const said of ["TBC Room", "B-12", "--", "To be confirmed soon", "TBD"]) assert.equal(room.isNoRoom(said), false, said);
  });

  test("the term's grid: several weeks of one group in one request and one transaction, emailing nobody; a refused week says why", async () => {
    const answer = await press.saveGroupWeeks(postAs("claudia"), A, [
      { weekNumber: 5, dateKey: "2026-11-26", room: "George Green B06" },
      { weekNumber: 6, dateKey: "2026-12-03", room: "tbc" },
      { weekNumber: 3, dateKey: "2026-11-12", room: "Room 1" },
    ]);
    assert.deepEqual([...answer.entries()].sort(), [
      [3, { saved: false, text: roomWords.ROOM_REFUSAL.started }],
      [5, { saved: true, text: words.ROOM_SAVED }],
      [6, { saved: true, text: words.ROOM_SAVED }],
    ]);
    const group = read(`courseGroups/${A}`);
    assert.deepEqual([group.sessionOverrides.w05, group.sessionOverrides.w06, group.sessionChanges?.w05], [{ location: "George Green B06" }, { location: "" }, undefined]);
    assert.deepEqual(auditRows("session-room").map((each) => [each.weekId, each.emailed]).sort(), [["w05", 0], ["w06", 0]]);
    assert.equal(world.mail.length, 0);
    assert.equal(updatesWritten().length, 0);
    // The grid never asks to tell: a press that does with several weeks is refused whole.
    const told = await call("claudia", w.change.POST, { groupId: A }, {
      body: { kind: "room", weeks: [{ week: 5, dateKey: "2026-11-26", room: "X" }, { week: 6, dateKey: "2026-12-03", room: "Y" }], tell: true, emailCount: 1 },
      course: true,
    });
    assert.deepEqual([told.status, told.body.error], [400, roomWords.ROOM_REFUSAL.tellOneWeek]);
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
    assert.deepEqual(outcomes.map((each) => each.kind), ["change", "notHere", "change", "same"]);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const results = [];
    for (const outcome of outcomes.filter((each) => each.kind === "change")) {
      const row = byKey.get(outcome.key);
      const preview = await press.askPreview(postAs("zach"), row, outcome.room);
      results.push(await press.saveRoom(postAs("zach"), row, outcome.room, preview, "Rooms for next week.", true));
    }
    assert.deepEqual(results.map((each) => each.saved), [true, true]);
    assert.equal(read(`courseGroups/${A}`).sessionOverrides.w05.location, "Monica Partridge C10");
    assert.equal(read(`courseGroups/${TAIS_A}`).sessionOverrides.w04.location, "Computer Science A32");
    assert.equal(auditRows("session-room").length, 2);
  });
});

describe("4. the room-only notice says the owner's words exactly", () => {
  const facts = { weekNumber: 5, dateKey: "2026-11-26", hhmm: "18:00", minutes: 90, campusLabel: "University Park" };
  const say = (over, context = {}) => roomWords.roomNoticeWords({ ...facts, ...over }, { groupName: "Group A", incubator: false, reason: "", ...context });
  test("set, changed and cleared, with Why only when a reason is given", () => {
    assert.deepEqual(say({ room: "George Green B06", wasRoom: "" }), {
      title: "Week 5 is in George Green B06",
      message: "Group A’s week 5 session, Thu 26 Nov, 6pm to 7:30pm, is in George Green B06 (University Park).",
    });
    assert.deepEqual(say({ room: "George Green B06", wasRoom: "Portland A21" }), {
      title: "Week 5 is in George Green B06",
      message: "Group A’s week 5 session, Thu 26 Nov, 6pm to 7:30pm, is now in George Green B06 (University Park), not Portland A21. The day and time are the same.",
    });
    assert.deepEqual(say({ room: "", wasRoom: "Portland A21" }), {
      title: "Week 5: room to be confirmed",
      message: "Group A’s week 5 session, Thu 26 Nov, 6pm to 7:30pm, has no room yet. We’ll email you as soon as it’s booked. The day and time are the same.",
    });
    assert.equal(
      say({ room: "George Green B06", wasRoom: "" }, { reason: "Booked at last" }).message,
      "Group A’s week 5 session, Thu 26 Nov, 6pm to 7:30pm, is in George Green B06 (University Park).\n\nWhy: Booked at last.",
    );
  });
  test("a missing fact drops out and nothing else changes; an incubator's people read Your", () => {
    assert.equal(say({ room: "George Green B06", wasRoom: "", campusLabel: "", minutes: 0 }).message, "Group A’s week 5 session, Thu 26 Nov, 6pm, is in George Green B06.");
    assert.equal(say({ room: "George Green B06", wasRoom: "Portland A21" }, { incubator: true }).message.startsWith("Your week 5 session, Thu 26 Nov"), true);
    assert.deepEqual(Object.keys(roomWords.ROOM_ONLY_NOTICE_WORDS).sort(), ["booked", "changedLine", "clearedLine", "clearedSubject", "roomSubject", "sameDayAndTime", "setLine"]);
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
    assert.ok(drawn.text.includes("Reason (optional)"));
    assert.ok(drawn.text.includes("Tell the group"));
    assert.match(drawn.html, /<input[^>]*type="checkbox"[^>]*role="switch"[^>]*checked=""/);
    assert.ok(drawn.html.includes(`aria-label="Room to be confirmed for AGI Strategy, Group A"`));
    assert.ok(drawn.text.includes("Save rooms"));
    assert.ok(drawn.text.includes("Paste rooms from a spreadsheet"));
    assert.ok(drawn.text.includes("The term’s rooms"));
    // Nothing is pressable before the page is live.
    assert.match(drawn.html, /<input[^>]*aria-label="Room for AGI Strategy, Group A"[^>]*disabled=""/);
  });
});
