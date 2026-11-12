/**
 * A group's page: the page under a programme's Groups tab where admins and
 * the programme's lead run one group, and the facilitator's cut of it on
 * their own group page.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   1. The arithmetic (`src/lib/courses/groupPage/model.ts`): which state a
 *      week is in, where the term is, the words on every button that emails,
 *      the lines of "What will happen" drawn from the routes' previews, and
 *      the history's two lines and filters.
 *   2. The reader (`src/lib/courses/groupPage/load.ts`) on the sessions world
 *      (Group B, Tuesdays 6pm, four people, Rahul and Sofia facilitating, on
 *      Thu 19 Nov 2026): every week with its date and state, who said what,
 *      the count a notice emails, and the history, which a change writes.
 *   3. The page itself, drawn as each person would see it: admins and the
 *      lead read it, a reviewer is told the tab is theirs, a group of another
 *      run is not here; and the facilitator's own group page carries the cut
 *      (how the group meets as words, Change one week, Set the link, the
 *      weeks) without people or history.
 *   4. What a preview answers, read through the panel's own lines, for one
 *      week's move and for a new regular time from a week onwards.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { AGI, AWAY, B, C, ROUND, RUN, makeSessionsWorld } from "./lib/sessionsWorld.mjs";

const ui = { h: createElement };
globalThis.__groupPageUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const STYLESHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) {
    STYLESHEETS.add(specifier);
  }
}
const CARD = (name) => `export default function ${name}() { return globalThis.__groupPageUi.h("div", null, "[${name}]"); }`;

const w = await makeSessionsWorld("__groupPage", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useSelectedLayoutSegment() { return 'groups'; }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children, ...rest }) =>\n" +
      "  globalThis.__groupPageUi.h('a', { href, className, 'aria-label': rest['aria-label'] }, children);",
  ],
  ["./session", "export async function getCurrentUser() { return globalThis.__groupPage.user; }"],
  ["@/features/courses/GroupRoster", CARD("GroupRoster")],
  ["@/features/courses/AttendanceGrid", CARD("AttendanceGrid")],
  ["./useGroupRoster", "export function useGroupRoster() { return { memberCount: 3, loading: false, error: null, notYetTold: false, reload() {} }; }"],
  ["./useGroupWeeks", "export function groupNoticeUrl(groupId) { return `/api/courses/groups/${groupId}/notice`; }"],
  ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
]);
const { world, loadTs, at } = w;

const model = await loadTs("lib/courses/groupPage/model.ts");
const words = await loadTs("lib/courses/groupPage/words.ts");
const { loadGroupPage } = await loadTs("lib/courses/groupPage/load.ts");
const { normalizeCourseRun } = await loadTs("lib/firestore/courses.ts");
const { normalizeCourseGroup } = await loadTs("lib/firestore/courseGroups.ts");
const regular = await w.courseRoute("groups", "[groupId]", "session", "regular");

const ADMIN_GROUP = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "groups", "[groupId]");
const LEARN_GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const { default: ProgrammeGroupPage } = await loadTs(join(ADMIN_GROUP, "page.tsx"));
const { default: FacilitatorGroupPage } = await loadTs(join(LEARN_GROUP, "page.tsx"));

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function sessionFor(uid) {
  const base = w.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

/** A page as `who` sees it: its element, HTML and text, and whether it wrote. */
async function draw(Page, who, params) {
  world.user = who === null ? null : sessionFor(who);
  world.course = true;
  const before = w.everything();
  try {
    const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);
    return { element, html, text: text(html), to: null, wrote: w.everything() !== before };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { element: null, html: "", text: "", to: err.to, wrote: w.everything() !== before };
    throw err;
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

const groupPage = (who, groupId = B) => draw(ProgrammeGroupPage, who, { roundId: ROUND, programmeId: AGI, groupId });
const run = () => normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
const group = (groupId = B) => normalizeCourseGroup(groupId, world.db.read(`courseGroups/${groupId}`));
const read = (viewer = "admin", viewerUid = "zach", groupId = B) =>
  loadGroupPage(world.courseDb, { run: run(), group: group(groupId), viewer, viewerUid, now: new Date() });

beforeEach(() => {
  w.reset();
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
});

// ---------------------------------------------------------------------------
// 1. The arithmetic
// ---------------------------------------------------------------------------

const week = (over = {}) => ({
  weekNumber: 2,
  weekId: "w02",
  sessionKey: "w02",
  title: "How fast",
  dateKey: "2026-11-11",
  hhmm: "15:00",
  minutes: 120,
  room: "Portland A21",
  campus: "university-park",
  online: false,
  cancelled: false,
  change: null,
  state: "upcoming",
  started: false,
  ended: false,
  taken: false,
  hasLink: false,
  slotDays: ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"],
  joiningOnline: [],
  cantMakeIt: [],
  people: [],
  ...over,
});

describe("1. the arithmetic of a group's page", () => {
  const base = { dateKey: "2026-11-11", started: false, taken: false, heldFalse: false, cancelled: false, change: null, online: false, todayKey: "2026-11-10", tomorrowKey: "2026-11-11" };

  test("a week's state: a taken register first, then cancelled, passed with no register, today, tomorrow, changed", () => {
    assert.equal(model.weekStateOf({ ...base, taken: true, started: true }), "met");
    assert.equal(model.weekStateOf({ ...base, taken: true, heldFalse: true, started: true }), "didnt-happen");
    assert.equal(model.weekStateOf({ ...base, cancelled: true }), "cancelled");
    assert.equal(model.weekStateOf({ ...base, started: true }), "no-register");
    assert.equal(model.weekStateOf({ ...base, dateKey: "2026-11-10" }), "today");
    assert.equal(model.weekStateOf(base), "tomorrow");
    assert.equal(model.weekStateOf({ ...base, dateKey: "2026-11-18", change: "moved" }), "moved");
    assert.equal(model.weekStateOf({ ...base, dateKey: "2026-11-18", change: "pushed" }), "moved");
    assert.equal(model.weekStateOf({ ...base, dateKey: "2026-11-18", online: true }), "online");
    assert.equal(model.weekStateOf({ ...base, dateKey: "2026-11-18" }), "upcoming");
  });

  test("a week's pill says its date and state in the board's words", () => {
    assert.equal(words.weekPillLine("2026-11-04", "met"), "Wed 4 Nov · met");
    assert.equal(words.weekPillLine("2026-11-11", "tomorrow"), "Wed 11 Nov · tomorrow");
    assert.equal(words.weekPillLine("2026-11-09", "no-register"), "Mon 9 Nov · no register");
    assert.equal(words.weekPillLine("2026-11-18", "upcoming"), "Wed 18 Nov");
    assert.equal(words.weekOptionWords(2, "2026-11-09", "16:00", "no-register"), "Week 2 · Mon 9 Nov, 4pm · passed, no register taken");
    assert.equal(words.weekOptionWords(2, "2026-11-11", "15:00", "tomorrow"), "Week 2 · Wed 11 Nov, 3pm · tomorrow");
  });

  test("where the term is, as the chip beside the group's name says it", () => {
    const weeks = [week({ weekNumber: 1, dateKey: "2026-11-04", ended: true, started: true, taken: true }), week()];
    assert.equal(words.termChipWords(model.termChipOf(weeks, 6, "2026-11-10", "2026-11-11")), "Week 2 is tomorrow");
    assert.equal(words.termChipWords(model.termChipOf(weeks, 6, "2026-11-11", "2026-11-12")), "Week 2 is today");
    assert.equal(words.termChipWords(model.termChipOf(weeks, 6, "2026-11-01", "2026-11-02")), "Week 2 on Wed 11 Nov");
    const over = weeks.map((each) => ({ ...each, ended: true, started: true }));
    assert.equal(words.termChipWords(model.termChipOf(over, 6, "2026-12-20", "2026-12-21")), "Finished");
    assert.equal(model.termChipOf([], 3, "2026-11-10", "2026-11-11"), null);
    assert.equal(words.termChipWords(model.termChipOf([], 0, "2026-11-10", "2026-11-11")), "New");
  });

  test("the button that emails names what happens and how many it emails, in the board's words", () => {
    assert.equal(model.oneWeekButtonWords("move", 2, 7, false), "Move week 2 and email 7 people");
    assert.equal(model.oneWeekButtonWords("online", 4, 6, false), "Hold week 4 online and email 6 people");
    assert.equal(model.oneWeekButtonWords("move", 2, 9, false), "Move week 2 and email 9 people");
    assert.equal(model.oneWeekButtonWords("move", 2, 0, true), "Save the correction (emails nobody)");
    assert.equal(model.oneWeekButtonWords("move", 2, 5, true), "Save the correction and email 5 people");
    assert.equal(model.oneWeekButtonWords("cancel", 3, 1, false), "Cancel week 3 and email 1 person");
    assert.equal(model.oneWeekButtonWords("push", 3, 4, false), "Cancel week 3, push the rest back and email 4 people");
    assert.equal(model.oneWeekButtonWords("push", 3, 0, false), "Cancel week 3 and push the rest back (emails nobody)");
    assert.equal(model.oneWeekButtonWords("restore", 2, 7, false), "Put week 2 back and email 7 people");
    assert.equal(model.oneWeekButtonWords("move", 2, 0, false), "Move week 2 (emails nobody)");
    assert.equal(model.regularButtonWords("Group A", 6), "Change Group A’s time and email 6 people");
    assert.equal(model.regularButtonWords("Group A", 0), "Change Group A’s time (emails nobody)");
    assert.equal(model.roomButtonWords(6), "Save the room and email 6 people");
    assert.equal(words.tellAgainWords(7), "Tell the group and email 7 people");
    // Before What will happen has answered, nobody knows the count: the button names what happens and no number.
    const waiting = (over) => model.waitingButtonWords({ kind: "move", weekNumber: 2, metAtAnotherTime: false, regular: false, groupName: "Group A", ...over });
    assert.equal(waiting({}), "Move week 2");
    assert.equal(waiting({ metAtAnotherTime: true }), "Save the correction");
    assert.equal(waiting({ kind: "restore" }), "Put week 2 back");
    assert.equal(waiting({ regular: true }), "Change Group A’s time");
    assert.equal(waiting({ kind: null }), "Change");
  });

  test("which one-week choices a week offers: a passed week with no register is put right; a week that met offers none", () => {
    const alone = (each) => model.oneWeekChoicesOf(each, [each]);
    assert.deepEqual(alone(week({ hasLink: true })), { putRight: false, met: false, online: true, restore: false, push: true });
    assert.deepEqual(alone(week({ started: true })), { putRight: true, met: false, online: false, restore: false, push: true });
    assert.deepEqual(alone(week({ started: true, taken: true })), { putRight: false, met: true, online: false, restore: false, push: false });
    assert.equal(alone(week({ change: "moved" })).restore, true);
    assert.equal(alone(week({ change: "pushed" })).restore, false, "a push moved the weeks, not this one");
    assert.equal(alone(week({ hasLink: false })).online, false, "no link, no holding it online");
  });

  test("cancel and push the rest back is not offered once a later week has met; cancel and keep pace still is", () => {
    // Week 3 passed with no register; week 4 met. Pushing week 3 back would move week 4.
    const three = week({ weekNumber: 3, weekId: "w03", sessionKey: "w03", dateKey: "2026-11-17", started: true, ended: true });
    const four = week({ weekNumber: 4, weekId: "w04", sessionKey: "w04", dateKey: "2026-11-24", started: true, ended: true, taken: true });
    const five = week({ weekNumber: 5, weekId: "w05", sessionKey: "w05", dateKey: "2026-12-01" });
    const weeks = [three, four, five];
    assert.deepEqual(model.oneWeekChoicesOf(three, weeks), { putRight: true, met: false, online: false, restore: false, push: false });
    assert.equal(model.oneWeekChoicesOf(five, weeks).push, true, "an earlier week that met moves nowhere");
    assert.equal(model.oneWeekChoicesOf(four, weeks).met, true);
    assert.equal(words.PUSH_BACK_LATER_MET, "A later week has already met, so the rest can’t be pushed back.");
  });

  test("a move lands on today or later; it met at another time lands on today or earlier, in the week's own days", () => {
    const w2 = week();
    assert.deepEqual(model.moveDays(w2, "2026-11-09", false), ["2026-11-09", "2026-11-10", "2026-11-11"]);
    assert.deepEqual(model.moveDays(w2, "2026-11-09", true), ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
  });

  test("a new regular time starts after the last week whose register was taken, at the first week still to come", () => {
    const weeks = [
      week({ weekNumber: 1, taken: true, started: true }),
      week({ weekNumber: 2, started: true }),
      week({ weekNumber: 3 }),
      week({ weekNumber: 4 }),
    ];
    assert.deepEqual(model.regularStartWeeks(weeks), [2, 3, 4]);
    assert.equal(model.defaultRegularStart(weeks), 3);
    assert.deepEqual(model.regularStartWeeks([...weeks, week({ weekNumber: 5, taken: true })]), []);
  });

  test("a history row reads as two lines: what changed, then before, the reason and who was emailed", () => {
    assert.deepEqual(
      model.historyLines("Moved week 2 to Thu 12 Nov, 3pm, Monica Partridge E02. Before: Wed 11 Nov, 3pm, Portland A21. Reason: Portland A21 is closed for an exam. Emailed 7."),
      {
        headline: "Moved week 2 to Thu 12 Nov, 3pm, Monica Partridge E02.",
        rest: "Before: Wed 11 Nov, 3pm, Portland A21. Reason: Portland A21 is closed for an exam. Emailed 7.",
      },
    );
    assert.deepEqual(model.historyLines("Set the meeting link for week 2 only. Before: no link."), {
      headline: "Set the meeting link for week 2 only.",
      rest: "Before: no link.",
    });
    assert.deepEqual(model.historyLines("Finished week 1’s register."), { headline: "Finished week 1’s register.", rest: "" });
    const rows = [
      { id: "1", category: "time-and-room" },
      { id: "2", category: "people" },
      { id: "3", category: "link" },
      { id: "4", category: "registers" },
    ];
    assert.deepEqual(model.filterHistory(rows, "everything").map((row) => row.id), ["1", "2", "3", "4"]);
    assert.deepEqual(model.filterHistory(rows, "time-and-room").map((row) => row.id), ["1"]);
    assert.deepEqual(model.filterHistory(rows, "people").map((row) => row.id), ["2"]);
    assert.deepEqual(model.filterHistory(rows, "link").map((row) => row.id), ["3"]);
    // ADDED (November 2026): the Registers filter, now registers log there
    // (taking one in a facilitator's place, giving a session, didn't happen).
    assert.deepEqual(model.filterHistory(rows, "registers").map((row) => row.id), ["4"]);
    assert.deepEqual(words.HISTORY_FILTERS.map((each) => each.label), ["Everything", "Time and room", "People", "Link", "Registers"]);
    assert.equal(model.historyWhenWords("2026-11-10T12:20:00Z"), "Tue 10 Nov, 12:20pm");
  });

  test("when the week's work locks, before and after, through the house clock", () => {
    assert.equal(
      model.lockLine(2, { before: "2026-11-11T15:00:00Z", after: "2026-11-12T15:00:00Z" }),
      "Week 2’s work locks at Thu 12 Nov, 3pm (was Wed 11 Nov, 3pm).",
    );
    assert.equal(model.lockLine(4, { before: "2026-11-25T15:00:00Z", after: "2026-11-25T15:00:00Z" }), "Unchanged: Wed 25 Nov, 3pm.");
  });

  const reminders = (over = {}) => ({
    weekOpen: { scheduled: false, before: null, after: null, gone: false },
    reminders: {
      on: false,
      threeDay: { before: null, after: null, gone: 0 },
      oneDay: { before: null, after: null, gone: 0 },
      people: 6,
    },
    ...over,
  });

  test("with the automatic emails switched off, the reminders line says so in one plain line and nothing else", () => {
    assert.equal(model.remindersLine(2, reminders()), model.REMINDERS_OFF);
    assert.equal(model.REMINDERS_OFF, "The automatic emails before a session are switched off, so none goes out on its own.");
  });

  test("with them on, it says what already went and what moves", () => {
    const line = model.remindersLine(
      2,
      reminders({
        weekOpen: { scheduled: true, before: "2026-11-05T09:00:00Z", after: "2026-11-05T09:00:00Z", gone: true },
        reminders: {
          on: true,
          threeDay: { before: "2026-11-08T09:00:00Z", after: "2026-11-09T09:00:00Z", gone: 5 },
          oneDay: { before: "2026-11-10T09:00:00Z", after: "2026-11-11T09:00:00Z", gone: 0 },
          people: 6,
        },
      }),
    );
    assert.equal(
      line,
      "“Week 2 is open” already went, and isn’t sent again. The 3-day reminder already went to 5 people. The 1-day reminder moves to Wed 11 Nov, 9am.",
    );
  });

  test("who is told: the count, the group's people and the facilitators beside them; nobody for a correction", () => {
    const told = { emails: 7, refused: false, people: 6, facilitatorNames: ["Rahul"] };
    assert.equal(
      model.toldLine({ told, tell: true, groupName: "Group C", incubator: false, correction: false }),
      "7 people by email: Group C’s 6 and Rahul. Programme pages and Home show the new time straight away.",
    );
    assert.equal(
      model.toldLine({ told: { ...told, emails: 5, people: 5, facilitatorNames: [] }, tell: false, groupName: "Group J", incubator: false, correction: true }),
      "Nobody: the session has happened. The change shows in Group J’s history.",
    );
    assert.equal(
      model.toldLine({ told: { emails: 9, refused: false, people: 9, facilitatorNames: [] }, tell: true, groupName: "Group A", incubator: true, correction: false }),
      "9 people by email: the incubator’s 9. Programme pages and Home show the new time straight away.",
    );
    assert.equal(words.noticeToWords({ groupName: "Group C", incubator: false, people: 6, facilitatorNames: ["Rahul"] }), "Notice to Group C’s 6 and Rahul");
  });

  const moment = (over) => ({ weekNumber: 2, durationMinutes: 120, campus: "university-park", online: false, cancelled: false, ...over });

  test("one week's move, as the panel draws What will happen", () => {
    const lines = model.oneWeekPreviewLines({
      preview: {
        kind: "move",
        weekNumber: 2,
        started: false,
        before: moment({ dateKey: "2026-11-11", startTimeLocal: "15:00", room: "Portland A21" }),
        after: moment({ dateKey: "2026-11-12", startTimeLocal: "15:00", room: "Monica Partridge E02" }),
        lastSession: { before: "2026-12-09", after: "2026-12-09" },
        lock: { before: "2026-11-11T15:00:00Z", after: "2026-11-12T15:00:00Z" },
        reminders: reminders(),
        said: { joiningOnline: { count: 1, names: ["Sofia"] }, cantMakeIt: { count: 1, names: ["Grace"] } },
        told: { emails: 7, refused: false, people: 6, facilitatorNames: ["Rahul"] },
        register: { exists: false, taken: false },
        notice: { title: "Week 2 moves to Thu 12 Nov, 3pm", message: "x" },
        at: null,
      },
      metAtAnotherTime: false,
      tell: true,
      groupName: "Group C",
      incubator: false,
    });
    assert.deepEqual(lines.map((line) => line.label), ["Session", "Work locks", "Reminders", "Answers", "Told"]);
    assert.equal(
      lines[0].text,
      "Week 2 moves from Wed 11 Nov, 3pm, Portland A21 to Thu 12 Nov, 3pm to 5pm, Monica Partridge E02 (University Park). Other weeks stay as they are.",
    );
    assert.equal(lines[3].text, "Sofia is still joining online and Grace still can’t make it. What each said stays with the session.");
  });

  test("a session put right after it met: recorded, its register can be taken, nobody told", () => {
    const lines = model.oneWeekPreviewLines({
      preview: {
        kind: "move",
        weekNumber: 2,
        started: true,
        before: moment({ dateKey: "2026-11-09", startTimeLocal: "13:00", room: "George Green A04", campus: null }),
        after: moment({ dateKey: "2026-11-10", startTimeLocal: "10:00", room: "George Green A04", campus: null }),
        lastSession: { before: "2026-12-07", after: "2026-12-07" },
        lock: { before: "2026-11-09T13:00:00Z", after: "2026-11-10T10:00:00Z" },
        reminders: reminders(),
        said: { joiningOnline: { count: 0, names: [] }, cantMakeIt: { count: 0, names: [] } },
        told: { emails: 5, refused: false, people: 5, facilitatorNames: [] },
        register: { exists: false, taken: false },
        notice: { title: "t", message: "m" },
        at: null,
      },
      metAtAnotherTime: true,
      tell: false,
      groupName: "Group J",
      incubator: false,
    });
    assert.deepEqual(lines.map((line) => line.label), ["Session", "Work locks", "Register", "Reminders", "Answers", "Told"]);
    assert.equal(lines[0].text, "Week 2 is recorded as Tue 10 Nov, 10am to 12pm, George Green A04, not Mon 9 Nov, 1pm.");
    assert.equal(lines[2].text, "Its register is for Tue 10 Nov, 10am, and can be taken now.");
    assert.equal(lines[5].text, "Nobody: the session has happened. The change shows in Group J’s history.");
  });

  test("a new regular time from a week onwards: the weeks that move, the weeks kept, asked again, told", () => {
    const lines = model.regularPreviewLines({
      preview: {
        fromWeek: 2,
        dayOrTimeChanged: true,
        askedAgain: true,
        regular: {
          before: { weekday: 1, startTimeLocal: "16:00", durationMinutes: 120, room: "Monica Partridge C10", campus: null },
          after: { weekday: 2, startTimeLocal: "17:30", durationMinutes: 120, room: "", campus: null },
        },
        moves: [2, 3, 4].map((n, i) => ({
          weekNumber: n,
          before: moment({ weekNumber: n, dateKey: `2026-11-${String(9 + i * 7).padStart(2, "0")}`, startTimeLocal: "16:00", room: "Monica Partridge C10" }),
          after: moment({ weekNumber: n, dateKey: `2026-11-${String(10 + i * 7).padStart(2, "0")}`, startTimeLocal: "17:30", room: "" }),
          lock: { before: null, after: null },
        })),
        kept: [{ weekNumber: 1, pinned: true, session: moment({ weekNumber: 1, dateKey: "2026-11-02", startTimeLocal: "16:00", room: "Monica Partridge C10" }) }],
        ownTimes: [],
        reminders: [{ weekNumber: 2, ...reminders() }],
        told: { emails: 6, refused: false, people: 5, facilitatorNames: ["Ella"] },
        notice: { subject: "Group A now meets on Tuesdays, 5:30pm", before: [], after: [], asks: true },
        at: null,
      },
      groupName: "Group A",
      incubator: false,
      todayKey: "2026-11-10",
    });
    const by = Object.fromEntries(lines.map((line) => [line.label, line.text]));
    assert.equal(by.Sessions, "Weeks 2 to 4 move to Tuesdays, 5:30pm to 7:30pm: today, Tue 10 Nov, Tue 17 Nov and Tue 24 Nov.");
    assert.equal(by.Kept, "Week 1 keeps Mon 2 Nov, 4pm. Its register and when its work locks don’t change.");
    assert.equal(by.Reminders, model.REMINDERS_OFF);
    assert.match(by.Room, /^To be confirmed\./);
    assert.match(by["Asked again"], /^The email asks Can you make this time\? with the same three answers\./);
    assert.equal(by.Told, "6 people by email: Group A’s 5 and Ella. Programme pages and Home show the new time straight away.");
  });

  test("a later week that keeps its own one-week change is said to keep its change, not its time, which may move", () => {
    const lines = model.regularPreviewLines({
      preview: {
        fromWeek: 2,
        dayOrTimeChanged: true,
        askedAgain: true,
        regular: {
          before: { weekday: 1, startTimeLocal: "16:00", durationMinutes: 120, room: "Monica Partridge C10", campus: null },
          after: { weekday: 2, startTimeLocal: "17:30", durationMinutes: 120, room: "Monica Partridge C10", campus: null },
        },
        moves: [],
        kept: [],
        ownTimes: [
          { weekNumber: 3, kind: "online", session: moment({ weekNumber: 3, dateKey: "2026-11-17", startTimeLocal: "17:30" }), campus: null },
        ],
        reminders: [],
        told: { emails: 6, refused: false, people: 5, facilitatorNames: ["Ella"] },
        notice: { subject: "Group A now meets on Tuesdays, 5:30pm", before: [], after: [], asks: true },
        at: null,
      },
      groupName: "Group A",
      incubator: false,
      todayKey: "2026-11-10",
    });
    const own = lines.find((line) => line.label === "Keeps its own");
    assert.equal(own?.text, "Week 3 keeps its own change (held online): Tue 17 Nov, 5:30pm.");
  });

  test("the start times and lengths a panel offers keep the session's own", () => {
    assert.ok(model.startTimeOptions("18:15").includes("18:15"));
    assert.equal(model.startTimeOptions("18:00").filter((each) => each === "18:00").length, 1);
    assert.deepEqual(model.lengthOptions([60, 90, 120], 150), [60, 90, 120, 150]);
  });

  test("no word on the page carries a dash of either kind", () => {
    const strings = [];
    for (const value of Object.values(words)) {
      if (typeof value === "string") strings.push(value);
      if (Array.isArray(value)) for (const each of value) strings.push(JSON.stringify(each));
      if (value && typeof value === "object" && !Array.isArray(value)) strings.push(JSON.stringify(value));
    }
    for (const said of strings) assert.doesNotMatch(said, /[\u2013\u2014]/, said);
  });
});

// ---------------------------------------------------------------------------
// 2. The reader
// ---------------------------------------------------------------------------

describe("2. the reader, on Group B four weeks in", () => {
  test("every week of the plan, past ones too, each with its date and state, and the count of people", async () => {
    const view = await read();
    assert.deepEqual(
      view.weeks.map((each) => [each.weekNumber, each.dateKey, each.state]),
      [
        [1, "2026-11-03", "no-register"],
        [2, "2026-11-10", "no-register"],
        [3, "2026-11-17", "no-register"],
        [4, "2026-11-24", "upcoming"],
        [5, "2026-12-01", "upcoming"],
        [6, "2026-12-08", "upcoming"],
      ],
    );
    assert.equal(view.openWeek, 4);
    assert.equal(view.chip, "Week 4 on Tue 24 Nov");
    assert.equal(view.peopleCount, 4, "amara, dev, ines and omar hold places; nina left");
    assert.equal(view.meets.hhmm, "18:00");
    assert.equal(view.notice.emails, await w.changeEmailsFor(B, "zach"));
  });

  test("a register taken says the week met; the page never carries a link or an address", async () => {
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w03`, { runId: RUN.agi, groupId: B, weekNumber: 3, markedByUid: "rahul", records: {} });
    const view = await read();
    assert.equal(view.weeks.find((each) => each.weekNumber === 3).state, "met");
    const flat = JSON.stringify(view);
    assert.doesNotMatch(flat, /https?:\/\//);
    assert.doesNotMatch(flat, /@example\.com/);
  });

  test("what each person said about a session: joining online and can't make it, by name", async () => {
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w04`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 4,
      onlineSaid: { amara: new Date() },
      excusedInAdvance: { ines: new Date() },
      records: { ines: "excused" },
    });
    const view = await read();
    const four = view.weeks.find((each) => each.weekNumber === 4);
    assert.equal(four.joiningOnline.length, 1);
    assert.equal(four.cantMakeIt.length, 1);
    const said = Object.fromEntries(four.people.map((person) => [person.uid, person.said]));
    assert.deepEqual(said, { amara: "online", dev: "coming", ines: "cant", omar: "coming" });
    assert.equal(four.state, "upcoming", "a word in advance is no register taken");
  });

  test("the facilitator's cut carries no people and no history", async () => {
    const view = await read("facilitator", "rahul");
    assert.equal(view.history, null);
    assert.ok(view.weeks.every((each) => each.people.length === 0));
    assert.equal(view.canChangeRegular, false);
    assert.deepEqual(view.facilitatorsWithPlaces, []);
  });

  test("a change writes a history row the page reads, newest first, as two lines", async () => {
    const pressed = await w.press("rahul", B, { week: 4, dateKey: "2026-11-24", kind: "cancel" }, { tell: false });
    assert.equal(pressed.changed.status, 200);
    const view = await read();
    const [row] = view.history.rows;
    assert.equal(row.category, "time-and-room");
    assert.match(row.headline, /^Cancelled week 4’s session on Tue 24 Nov, keeping pace\.$/);
    assert.match(row.rest, /Reason: Rahul and Sofia are both away\./);
    assert.equal(view.weeks.find((each) => each.weekNumber === 4).state, "cancelled");
  });
});

// ---------------------------------------------------------------------------
// 3. The pages
// ---------------------------------------------------------------------------

describe("3. the group's page, and the facilitator's cut", () => {
  test("an admin reads it: the way back, the head, how the group meets, the weeks and the tabs", async () => {
    const drawn = await groupPage("zach");
    assert.equal(drawn.to, null);
    assert.equal(drawn.wrote, false, "drawing the page writes nothing");
    for (const said of [
      "Groups",
      "Group B",
      "Week 4 on Tue 24 Nov",
      "Take the register",
      "How Group B meets",
      "Day and time",
      "Tuesdays, 6pm to 8pm",
      "Leads and admins change the regular time, room and facilitators. Facilitators change one week and set the link.",
      "Week by week",
      "History",
      "Tue 3 Nov · no register",
      "Tue 24 Nov",
      "Change this week",
      "4 people",
    ]) {
      assert.ok(drawn.text.includes(said), `missing "${said}" in: ${drawn.text.slice(0, 600)}`);
    }
    // CHANGED ON PURPOSE (November 2026), with covering a register: Take the
    // register is the group's register under this page, which admins and
    // the programme's lead take.
    const registerPath = `/admin/admissions/forms/${ROUND}/programmes/${AGI}/groups/${B}/register`;
    assert.ok(drawn.html.includes(`href="${registerPath}"`), "Take the register is the group's register under this page");
    assert.doesNotMatch(drawn.text, /Attendance, all weeks/, "no tab for something that does not exist yet");
    assert.doesNotMatch(drawn.text, /Remind/, "Remind comes with a later step");
    const [body] = find(drawn.element, "GroupPage");
    assert.ok(body, "the page hands its body the server's view");
  });

  test("the programme's lead reads it too, and takes the register from it", async () => {
    // CHANGED ON PURPOSE (November 2026): leads write registers now, so the
    // lead is offered the group's register under this page, as an admin is.
    const drawn = await groupPage("claudia");
    assert.ok(drawn.text.includes("How Group B meets"), drawn.text.slice(0, 400));
    assert.ok(drawn.html.includes(`href="/admin/admissions/forms/${ROUND}/programmes/${AGI}/groups/${B}/register"`), "the lead is not offered the register");
    assert.ok(!drawn.html.includes(`/learn/${RUN.agi}/group/${B}/register`), "the lead is sent to a register the run's pages refuse them");
  });

  test("a reviewer is told the tab is the lead's and an admin's; a group of another run is not here", async () => {
    const reviewer = await groupPage("lloyd");
    assert.doesNotMatch(reviewer.text, /How Group B meets/);
    world.db.poke(`courseGroups/${C}`, { runId: RUN.tais });
    const other = await groupPage("zach", C);
    assert.ok(other.text.includes(words.GROUP_NOT_HERE_TITLE), other.text.slice(0, 300));
    const nonsense = await groupPage("zach", "not a group id");
    assert.ok(nonsense.text.includes(words.GROUP_NOT_HERE_TITLE));
  });

  test("the facilitator's own group page carries the cut above what was there: words, Change one week, Set the link, the weeks", async () => {
    const drawn = await draw(FacilitatorGroupPage, "rahul", { runId: RUN.agi, groupId: B });
    assert.equal(drawn.to, null, drawn.to);
    for (const said of ["Tuesdays, 6pm to 8pm", "Change one week", "or an admin changes the regular time or room.", "Tue 3 Nov · no register"]) {
      assert.ok(drawn.text.includes(said), `missing "${said}" in: ${drawn.text.slice(0, 800)}`);
    }
    assert.doesNotMatch(drawn.text, /Who changed what/, "no history on the facilitator's page");
    const [cut] = find(drawn.element, "FacilitatorMeets");
    assert.ok(cut);
    assert.equal(cut.props.view.history, null);
    assert.ok(cut.props.view.weeks.every((each) => each.people.length === 0));
  });

  test("the change panel greys out Cancel and push the rest back once a later week has met, and says why", async () => {
    const { default: ChangePanel } = await loadTs(join("features", "courses", "groupPage", "ChangePanel.tsx"));
    // Wed 25 Nov: week 3 passed with no register, week 4 met and was finished.
    at("2026-11-25T10:00:00Z");
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w04`, {
      runId: RUN.agi, groupId: B, weekNumber: 4, occurrence: 1, pushedAt: new Date("2026-11-24T20:30:00Z"),
    });
    const view = await read();
    const panel = (weekNumber) =>
      renderToStaticMarkup(
        createElement(ChangePanel, { view, start: { choice: "one", weekNumber }, oneWeekOnly: false, onClose() {}, onDone() {} }),
      );
    // Before hydration every control is off, so an option that is not offered is told by its label's class.
    const optionClass = (html, value) => new RegExp(`<label class="([^"]*)"><input(?=[^>]*value="${value}")`).exec(html)?.[1] ?? null;
    const three = panel(3);
    assert.ok(text(three).includes(words.PUSH_BACK_LATER_MET), text(three).slice(0, 600));
    assert.match(optionClass(three, "push") ?? "", /optionOff/, "push is offered although week 4 met");
    assert.equal(optionClass(three, "cancel"), "option", "cancel and keep pace is still offered");
    const five = panel(5);
    assert.equal(optionClass(five, "push"), "option", "an earlier week that met moves nowhere");
    assert.ok(!text(five).includes(words.PUSH_BACK_LATER_MET));
  });

  test("the facilitator's page still opens when how the group meets can't be read: the cut is left out, and the failure logged", async () => {
    const real = world.courseDb;
    const failing = Object.create(real);
    failing.getAll = async (...refs) => {
      if (refs.some((ref) => /^courseRuns\/[^/]+\/weeks\//.test(ref.path))) throw new Error("the weeks could not be read");
      return real.getAll(...refs);
    };
    world.courseDb = failing;
    const logged = mock.method(console, "error", () => {});
    try {
      const drawn = await draw(FacilitatorGroupPage, "rahul", { runId: RUN.agi, groupId: B });
      assert.equal(drawn.to, null, drawn.to);
      assert.ok(drawn.html.length > 0, "the page drew nothing");
      assert.equal(find(drawn.element, "FacilitatorMeets").length, 0, "a cut drawn from a read that failed");
      assert.ok(
        logged.mock.calls.some((call) => String(call.arguments[0]).includes("[facilitator group page]")),
        "the failure was not logged",
      );
    } finally {
      logged.mock.restore();
      world.courseDb = real;
    }
  });
});

// ---------------------------------------------------------------------------
// 4. What a preview answers, read through the panel's own lines
// ---------------------------------------------------------------------------

describe("4. the routes' previews, through the panel's lines", () => {
  test("one week's move: the session, the lock, the answers and who is told, with the count the press checks", async () => {
    const response = await w.ask.change("rahul", B, {
      week: 4,
      dateKey: "2026-11-24",
      kind: "move",
      move: { dateKey: "2026-11-25", time: "18:00", room: "Hallward B12", roomToBeConfirmed: false, length: 120 },
      reason: AWAY,
      preview: true,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const lines = model.oneWeekPreviewLines({
      preview: response.body.preview,
      metAtAnotherTime: false,
      tell: true,
      groupName: "Group B",
      incubator: false,
    });
    const by = Object.fromEntries(lines.map((line) => [line.label, line.text]));
    assert.match(by.Session, /^Week 4 moves from Tue 24 Nov, 6pm, .* to Wed 25 Nov, 6pm to 8pm, /);
    assert.match(by["Work locks"], /Wed 25 Nov/);
    const emails = await w.changeEmailsFor(B, "rahul");
    assert.equal(response.body.preview.told.emails, emails);
    assert.ok(by.Told.startsWith(`${emails === 1 ? "1 person" : `${emails} people`} by email`), by.Told);
    assert.equal(model.oneWeekButtonWords("move", 4, response.body.preview.told.emails, false), `Move week 4 and email ${emails === 1 ? "1 person" : `${emails} people`}`);
  });

  test("a new regular time from week 4: the weeks that move and the weeks kept, drawn without throwing", async () => {
    const response = await w.call(
      "zach",
      regular.POST,
      { groupId: B },
      { body: { fromWeek: 4, weekday: 3, time: "18:00", length: 120, room: "Hallward B12", preview: true }, course: true },
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const lines = model.regularPreviewLines({ preview: response.body.preview, groupName: "Group B", incubator: false, todayKey: "2026-11-19" });
    const by = Object.fromEntries(lines.map((line) => [line.label, line.text]));
    assert.match(by.Sessions, /^Weeks 4 to 6 move to Wednesdays, 6pm to 8pm: Wed 25 Nov, Wed 2 Dec and Wed 9 Dec\.$/);
    assert.match(by.Kept, /^Weeks 1 to 3 keep their dates/);
    assert.ok(by["Asked again"].startsWith("The email asks"));
    at("2026-11-19T10:00:00Z");
  });
});
