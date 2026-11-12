/**
 * JOINING A SESSION ONLINE, run: somebody taking part says on their next
 * session's ticket that they are joining it online; the box at the top of
 * their facilitators' group page and register asks for a meeting link for
 * that week; the link reaches everybody in the group on their tickets; the
 * register records in the room or online beside every mark that says
 * somebody came; and the figures say how many sessions people came to in the
 * room and online.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/joining-online   (the press)
 *   POST /api/courses/groups/[groupId]/meeting-link     (the box's link)
 *   GET, POST, PATCH /api/courses/groups/[groupId]/attendance (the register)
 *   POST /api/courses/groups/[groupId]/attendance/push  (the rollup)
 *   GET  /api/courses/runs/[runId]/overview              (who sees the link)
 *
 * ## What this guards
 *
 *  1. WHO says it: somebody taking part in the group, told their group, by
 *     their own uid, and nobody else; nothing is emailed.
 *  2. WHEN: before the session starts, on a session of the group that is not
 *     cancelled, finished, not held or online for everybody, and never over a
 *     line a facilitator filled in. ONE THING AT A TIME with Can't make it:
 *     the route refuses while they have told us they can't make it, the
 *     ticket offers one or the other, and wherever both stand on a register,
 *     can't make it wins.
 *  3. THE BOX asks for a link for each session somebody is joining online
 *     that has none, and says who once it has one; the link route saves it
 *     for the week or every week, behind the group page's gate, and emails
 *     nobody.
 *  4. THE LINK reaches everybody in the group and nobody else, on every
 *     ticket, worded for anybody joining online when the session is in a
 *     room; an online week keeps its Join online in place of Add to calendar.
 *  5. THE REGISTER keeps in the room or online as its own map, never as a
 *     mark: prefilled online from the person's word, kept through every mark
 *     that still says they came, taken away by any other; corrected on a
 *     finished register by an admin with its own audit row, and counted in
 *     the rollup the push recomputes.
 *  6. THE FIGURES: the Attendance tab, its file, who finished and the
 *     member's own sessions say where people were, and a register written
 *     before any of this reads as in the room.
 *  7. THE WORDS: no dash, and nothing a member reads says mark, grade or
 *     score.
 *
 * Real: every route, loader, library and component named above. Faked: what
 * the member pages world fakes (the session, the Admin SDK handle, the
 * view-as guard, the clock, the stylesheets, the browser's data hooks), and,
 * to draw the register, its hook.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { B, NOW, RUN, makeMemberPagesWorld, textOf } from "./lib/memberPagesWorld.mjs";
import { A, register, registerPath } from "./lib/hubAttendanceWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeMemberPagesWorld("__joiningOnline");
const { world, call, courseRoute, loadTs } = w;
const press = await courseRoute("groups", "[groupId]", "joining-online");
const linkRoute = await courseRoute("groups", "[groupId]", "meeting-link");
const cantRoute = await courseRoute("groups", "[groupId]", "cant-make-it");
const registerRoute = await courseRoute("groups", "[groupId]", "attendance");
const pushRoute = await courseRoute("groups", "[groupId]", "attendance", "push");
const seat = await loadTs(join("lib", "courses", "joiningOnline", "seat.ts"));
const model = await loadTs(join("lib", "courses", "joiningOnline", "model.ts"));
const words = await loadTs(join("lib", "courses", "joiningOnline", "words.ts"));
const cantWords = await loadTs(join("lib", "courses", "cantMakeIt", "words.ts"));
const linkWords = await loadTs(join("lib", "courses", "sessionChange", "words.ts"));
const box = await loadTs(join("lib", "courses", "meetingLink", "box.ts"));
const audience = await loadTs(join("lib", "courses", "meetingLink", "audience.ts"));
const attendance = await loadTs(join("lib", "courses", "programmeAttendance.ts"));
const whoFinished = await loadTs(join("lib", "courses", "finishing", "whoFinished.ts"));
const cardFacts = await loadTs(join("features", "courses", "sessionChange", "cardFacts.ts"));
const courses = await loadTs(join("lib", "firestore", "courses.ts"));
const groupsLib = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const enrolments = await loadTs(join("lib", "firestore", "courseEnrolments.ts"));

const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

const LINK = "https://meet.example.com/group-b-week-3";

/** One press, as `who`, about a session of `groupId`. */
const tell = (who, body, { groupId = B, viewAs = false } = {}) =>
  call(who, press.POST, { groupId }, { body, course: true, viewAs });
const online = (who, sessionKey, options) => tell(who, { sessionKey, online: true }, options);
const inTheRoom = (who, sessionKey, options) => tell(who, { sessionKey, online: false }, options);
const cantMake = (who, sessionKey, cantMakeIt = true) =>
  call(who, cantRoute.POST, { groupId: B }, { body: { sessionKey, cantMakeIt }, course: true });
/** The box's link, as `who`. */
const giveLink = (who, body, { groupId = B, viewAs = false } = {}) =>
  call(who, linkRoute.POST, { groupId }, { body, course: true, viewAs });
/** The register, as `who`. */
const registerAs = (who, groupId = B) => call(who, registerRoute.GET, { groupId }, { course: true });
/** A correction (PATCH) carries a reason: every correction of a finished register needs one. */
const markAs = (who, week, marks, method = "POST") =>
  call(who, registerRoute[method], { groupId: B }, {
    body: { weekNumber: week, marks, ...(method === "PATCH" ? { reason: "From the sign-in sheet." } : {}) },
    course: true,
  });
/** A register as stored. */
const stored = (groupId, week) => world.db.read(registerPath(groupId, week));
/** A stored stamp, as a Date, whichever the store kept. */
const instant = (value) => (value instanceof Date ? value : typeof value?.toDate === "function" ? value.toDate() : new Date(value));

/** The run, its live groups and somebody's seat, as a server page reads them. */
function asStored(who) {
  const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
  const groups = world.db
    .paths()
    .filter((path) => path.startsWith("courseGroups/") && path.split("/").length === 2)
    .map((path) => groupsLib.normalizeCourseGroup(path.split("/")[1], world.db.read(path)))
    .filter((group) => group.runId === RUN.agi && !group.archived);
  const raw = who ? world.db.read(`courseEnrolments/${RUN.agi}__${who}`) : null;
  const enrolment = raw ? enrolments.normalizeCourseEnrolment(`${RUN.agi}__${who}`, raw) : null;
  return { run, groups, enrolment };
}

/** What the programme page's loader hands the ticket's "Joining online" for `who`. */
async function ticketFor(who) {
  const { run, groups, enrolment } = asStored(who);
  world.course = true;
  try {
    return await seat.joiningOnlineFor(world.courseDb, { user: w.sessionOf(who), run, enrolment, groups, now: new Date() });
  } finally {
    world.course = false;
  }
}

/** The box at the top of Group B's pages, its people named as the register names them. */
async function boxOfB() {
  const { run, groups } = asStored(null);
  const group = groups.find((each) => each.id === B);
  const people = [
    { uid: "chloe", name: "Chloe Nguyen" },
    { uid: "farah", name: "Farah Hussain" },
    { uid: "kofi", name: "Kofi Asante" },
  ];
  world.course = true;
  try {
    return await box.joiningOnlineBox(world.courseDb, { run, group, people, now: new Date() });
  } finally {
    world.course = false;
  }
}

/** The run's records and one viewer's listed groups, as the lead's tabs read them. */
async function recordsNow() {
  world.course = true;
  try {
    return await attendance.readRunRecords(world.courseDb, RUN.agi);
  } finally {
    world.course = false;
  }
}
const rowOf = (listed, uid) => listed.flatMap((entry) => entry.people).find((person) => person.row.uid === uid)?.row;

// ---------------------------------------------------------------------------
// The components, drawn with their hooks handing them a suite's own answers
// ---------------------------------------------------------------------------

const handle = { attendance: null, h: createElement };
globalThis.__joiningOnlineUi = handle;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const stylesheets = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) stylesheets.add(specifier);
}
const ui = createLoader({
  stubs: new Map([
    ...[...stylesheets].map((specifier) => [specifier, CLASS_NAMES]),
    ["server-only", "export {};"],
    ["next/link", "export default ({ href, className, children }) => globalThis.__joiningOnlineUi.h('a', { href, className }, children);"],
    ["next/navigation", "export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {} });"],
    ["@/hooks/useHydrated", "export function useHydrated() { return true; }"],
    ["./useAttendance", "export default function useAttendance() { return globalThis.__joiningOnlineUi.attendance; }"],
  ]),
});
const AttendanceGrid = (await ui.loadTs(join("features", "courses", "AttendanceGrid.tsx"))).default;
const TicketAnswers = (await ui.loadTs(join("features", "courses", "weekly", "TicketAnswers.tsx"))).default;
const SessionTicket = (await ui.loadTs(join("features", "courses", "weekly", "SessionTicket.tsx"))).default;
const JoiningOnlineBox = (await ui.loadTs(join("features", "courses", "facilitator", "JoiningOnlineBox.tsx"))).default;
const ProgrammeAttendance = (await ui.loadTs(join("features", "applications", "groups", "ProgrammeAttendance.tsx"))).default;

function drawRegister(payload) {
  handle.attendance = {
    ...payload,
    loading: false,
    loaded: true,
    error: null,
    reload: () => {},
    mark: async () => {},
    edit: async () => ({}),
    push: async () => ({}),
    saveNote: async () => ({}),
  };
  const html = renderToStaticMarkup(createElement(AttendanceGrid, { groupId: B, runId: RUN.agi }));
  return { html, text: textOf(html) };
}

const draw = (component, props) => {
  const html = renderToStaticMarkup(createElement(component, props));
  return { html, text: textOf(html) };
};

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who may say it", () => {
  test("somebody taking part in the group, told their group: the register keeps their word beside its marks, and nobody is emailed", async () => {
    const answer = await online("chloe", "w03");
    assert.deepEqual(answer, { status: 200, body: { ok: true, online: true, message: words.saidOnlineWords(false) } });
    const doc = stored(B, 3);
    assert.deepEqual(Object.keys(doc.onlineSaid), ["chloe"]);
    assert.equal(instant(doc.onlineSaid.chloe).toISOString(), NOW.toISOString(), "when they said it");
    assert.deepEqual([doc.runId, doc.groupId, doc.weekNumber, doc.occurrence], [RUN.agi, B, 3, 1], "the register's parts, as the marking route writes them");
    // Never a mark, and a draft nobody has marked: no marks, no push, no held switch, no marker.
    assert.equal(doc.records, undefined, "saying it wrote a mark");
    assert.equal(doc.online, undefined, "saying it wrote where they were");
    assert.equal(doc.pushedAt ?? null, null);
    assert.equal(doc.held, undefined);
    assert.equal(doc.markedByUid, undefined);
    assert.deepEqual(world.mail, [], "somebody was emailed");
  });

  test("as every other kind of caller: refused, and nothing is written", async () => {
    const before = w.everything();
    for (const [who, status, why] of [
      [null, 401, "somebody signed out"],
      ["rahul", 404, "the group's facilitator, who holds no place in it"],
      ["claudia", 404, "the programme's lead"],
      ["zach", 404, "an admin"],
      ["amara", 404, "somebody in another group of the run"],
      ["omar", 404, "somebody staff took off the run"],
      ["sam", 404, "somebody who left the run"],
      ["nobody", 404, "a member on nothing"],
    ]) {
      const answer = await online(who, "w03");
      assert.equal(answer.status, status, `${why}: ${JSON.stringify(answer.body)}`);
      if (status === 404) assert.equal(answer.body.error, words.JOINING_ONLINE_REFUSAL.notYours, why);
    }
    // Una is placed in Group C and Publish has not told Una the group yet.
    assert.equal((await online("una", "w03", { groupId: "agi-autumn-2026-wednesday__grp00003" })).status, 404);
    assert.deepEqual((await online("chloe", "w03", { groupId: "no-such-group" })).body, { error: words.JOINING_ONLINE_REFUSAL.notYours });
    assert.equal((await online("chloe", "w03", { groupId: ".." })).status, 404);
    // A view-as session is refused before anything else.
    assert.equal((await online("chloe", "w03", { viewAs: true })).status, 403);
    assert.equal(w.everything(), before, "a refused press wrote something");
  });

  test("a body that is not a press is the same 400 for everybody signed in, before anything is read", async () => {
    for (const who of ["chloe", "zach", "rahul", "nobody"]) assert.equal((await tell(who, {})).status, 400, who);
    for (const body of [
      { sessionKey: "w3", online: true },
      { sessionKey: "w03", online: "yes" },
      { sessionKey: "w03" },
      { sessionKey: "w03", online: true, uid: "farah" },
      [],
    ]) {
      assert.equal((await tell("chloe", body)).status, 400, JSON.stringify(body));
    }
    assert.equal(stored(B, 3), undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. When
// ---------------------------------------------------------------------------

describe("2. while it may be said, one thing at a time", () => {
  test("only before the session starts, about a session the group holds", async () => {
    assert.deepEqual(await online("chloe", "w09"), { status: 400, body: { error: words.JOINING_ONLINE_REFUSAL.noSession } });
    at("2026-11-17T18:00:00Z");
    assert.deepEqual((await online("chloe", "w03")).body, { error: words.JOINING_ONLINE_REFUSAL.started });
    assert.equal(stored(B, 3), undefined);
  });

  test("not about a session called off, finished, said not to have happened, or held online for everybody", async () => {
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w03: { kind: "cancelled", reason: "The room is closed.", dateKey: "2026-11-17", byUid: "rahul", at: NOW } },
      sessionModes: { w06: "virtual" },
    });
    world.db.seed(registerPath(B, 4), register(B, 4, {}, { pushed: true }));
    world.db.seed(registerPath(B, 5), register(B, 5, {}, { pushed: false, held: false }));
    assert.deepEqual(await online("chloe", "w03"), { status: 409, body: { error: words.JOINING_ONLINE_REFUSAL.cancelled } });
    assert.deepEqual((await online("chloe", "w04")).body, { error: words.JOINING_ONLINE_REFUSAL.finished });
    assert.deepEqual((await online("chloe", "w05")).body, { error: words.JOINING_ONLINE_REFUSAL.notHeld });
    assert.deepEqual((await online("chloe", "w06")).body, { error: words.JOINING_ONLINE_REFUSAL.online });
    // A group whose campus is Online meets online every week.
    world.db.poke(`courseGroups/${B}`, { sessionChanges: {}, sessionModes: {}, campus: "online" });
    assert.deepEqual((await online("chloe", "w03")).body, { error: words.JOINING_ONLINE_REFUSAL.online });
  });

  test("never over a line a facilitator has filled in: it is theirs", async () => {
    assert.equal((await markAs("rahul", 3, [{ uid: "farah", status: "present" }])).status, 200);
    assert.deepEqual(await online("farah", "w03"), { status: 409, body: { error: words.JOINING_ONLINE_REFUSAL.marked } });
    assert.deepEqual(await inTheRoom("farah", "w03"), { status: 409, body: { error: words.JOINING_ONLINE_REFUSAL.marked } });
  });

  test("not while they have told us they can't make it; once they can make it after all, yes", async () => {
    assert.equal((await cantMake("chloe", "w03")).status, 200);
    assert.deepEqual(await online("chloe", "w03"), { status: 409, body: { error: words.JOINING_ONLINE_REFUSAL.told } });
    assert.equal(stored(B, 3).onlineSaid, undefined);
    assert.equal((await cantMake("chloe", "w03", false)).status, 200);
    assert.equal((await online("chloe", "w03")).status, 200);
    assert.deepEqual(Object.keys(stored(B, 3).onlineSaid), ["chloe"]);
  });

  test("saying it twice changes nothing; taking it back clears their own word and nobody else's", async () => {
    assert.equal((await online("chloe", "w03")).status, 200);
    at("2026-11-17T12:30:00Z");
    assert.equal((await online("kofi", "w03")).status, 200);
    const first = stored(B, 3).onlineSaid.chloe;
    assert.equal((await online("chloe", "w03")).body.online, true);
    assert.equal(instant(stored(B, 3).onlineSaid.chloe).toISOString(), instant(first).toISOString(), "saying it again moved when they said it");
    const back = await inTheRoom("chloe", "w03");
    assert.deepEqual(back, { status: 200, body: { ok: true, online: false, message: words.onlineSavedWords(false, false) } });
    assert.deepEqual(Object.keys(stored(B, 3).onlineSaid), ["kofi"]);
    assert.equal((await inTheRoom("chloe", "w03")).body.online, false, "taking back what is not there");
    assert.deepEqual(Object.keys(stored(B, 3).onlineSaid), ["kofi"]);
  });
});

// ---------------------------------------------------------------------------
// 3. The box and the link route
// ---------------------------------------------------------------------------

describe("3. the box asks the facilitators for a link, and the link route saves it", () => {
  test("a session somebody is joining online with no link: who, and the field; once linked, who, and no prompt", async () => {
    assert.deepEqual(await boxOfB(), [], "nobody has said anything");
    assert.equal((await online("chloe", "w03")).status, 200);
    assert.equal((await online("farah", "w03")).status, 200);
    assert.deepEqual(await boxOfB(), [
      { sessionKey: "w03", weekNumber: 3, day: "Tue 17 Nov", names: ["Chloe Nguyen", "Farah Hussain"], hasLink: false },
    ]);
    const asking = draw(JoiningOnlineBox, { groupId: B, sessions: await boxOfB(), canAdd: true });
    assert.ok(asking.text.includes("2 people are joining online on Tue 17 Nov. Add a meeting link for week 3."), asking.text);
    assert.ok(asking.text.includes("Chloe Nguyen and Farah Hussain"), asking.text);
    assert.match(asking.html, /<label[^>]*>Meeting link for week 3<\/label>/);
    assert.ok(asking.text.includes(words.EVERY_WEEK), asking.text);
    assert.match(asking.html, /<button type="submit"[^>]*>Add the link<\/button>/);
    assert.ok(asking.text.includes(words.BOX_NOTE), asking.text);
    // In a view-as session the box says who, and offers nothing to press.
    assert.doesNotMatch(draw(JoiningOnlineBox, { groupId: B, sessions: await boxOfB(), canAdd: false }).html, /<form/);

    const saved = await giveLink("rahul", { sessionKey: "w03", url: LINK, everyWeek: false });
    assert.deepEqual(saved, { status: 200, body: { ok: true, sessionKey: "w03", everyWeek: false } });
    assert.equal(world.db.read(`courseGroups/${B}`).sessionOverrides.w03.meetingUrl, LINK, "the week's own link");
    assert.equal(world.db.read(`courseGroups/${B}`).session.meetingUrl, null, "the standing link is untouched");
    assert.deepEqual(world.mail, [], "somebody was emailed");
    const linked = await boxOfB();
    assert.equal(linked[0].hasLink, true);
    const said = draw(JoiningOnlineBox, { groupId: B, sessions: linked, canAdd: true });
    assert.equal(said.text, "Chloe Nguyen and Farah Hussain are joining online on Tue 17 Nov.");
    assert.doesNotMatch(said.html, /<form|meet\.example/, "the box shows the link or asks again");
  });

  test("somebody who has told us they can't make it is nobody's to expect online, and nor is a session not asked about", async () => {
    // Kofi says Joining online, then (from a page that had not caught up) Can't make it.
    assert.equal((await online("kofi", "w04")).status, 200);
    assert.equal((await cantMake("kofi", "w04")).status, 200);
    assert.deepEqual(await boxOfB(), [], "an excused person is asked about");
    // Can't make it wins on Kofi's ticket too: told, and not said.
    at("2026-11-17T20:30:00Z");
    assert.deepEqual(await ticketFor("kofi"), { groupId: B, sessionKey: "w04", day: "Tue 24 Nov", said: false, told: true });
    // An online week is not asked about: everybody joins it online, and Hold it online already asks for its link.
    at(NOW.toISOString());
    assert.equal((await online("chloe", "w03")).status, 200);
    world.db.poke(`courseGroups/${B}`, { sessionModes: { w03: "virtual" } });
    assert.deepEqual(await boxOfB(), []);
  });

  test("kept for every week: the group's standing link, and the week's own taken away so it reads the standing one", async () => {
    world.db.poke(`courseGroups/${B}`, { sessionOverrides: { w04: { meetingUrl: "https://meet.example.com/old", location: "Hallward A1" } } });
    const saved = await giveLink("sofia", { sessionKey: "w04", url: LINK, everyWeek: true });
    assert.deepEqual(saved, { status: 200, body: { ok: true, sessionKey: "w04", everyWeek: true } });
    const group = world.db.read(`courseGroups/${B}`);
    assert.equal(group.session.meetingUrl, LINK);
    assert.deepEqual(group.sessionOverrides.w04, { location: "Hallward A1" }, "the week's room is kept and its own link gone");
    // A week with no link of its own is given no empty entry.
    assert.equal((await giveLink("sofia", { sessionKey: "w05", url: LINK, everyWeek: true })).status, 200);
    assert.equal(world.db.read(`courseGroups/${B}`).sessionOverrides.w05, undefined);
    assert.equal((await giveLink("zach", { sessionKey: "w03", url: LINK })).status, 200, "an admin may");
  });

  test("the programme's lead sets a link too, and the group's history says which weeks, never the link", async () => {
    // Claudia leads the programme that names the run: admitted, then the body is checked.
    assert.equal((await giveLink("claudia", {})).status, 400, "the lead, with an empty body");
    assert.equal((await giveLink("claudia", { sessionKey: "w03", url: LINK })).status, 200, "the lead may");
    const rows = world.db
      .paths()
      .filter((path) => path.startsWith("courseAudit/"))
      .map((path) => world.db.read(path))
      .filter((row) => row.kind === "group-link-set");
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].groupId, rows[0].weekId, rows[0].actorUid, rows[0].before, rows[0].after],
      [B, "w03", "claudia", { link: false }, { link: true, everyWeek: false }],
    );
    assert.equal(rows[0].detail, "Set the meeting link for week 3 only. Before: no link.");
    assert.ok(!JSON.stringify(rows[0]).includes("meet.example"), "the history holds the link");
  });

  test("everybody but the group's live facilitators, its programme's lead and admins is refused before the body is read, and nothing is written", async () => {
    const before = w.everything();
    for (const [who, status] of [[null, 401], ["chloe", 403], ["amara", 403], ["tom", 403], ["nobody", 403]]) {
      assert.equal((await giveLink(who, { sessionKey: "w03", url: LINK })).status, status, String(who));
      assert.equal((await giveLink(who, {})).status, status, `${who}, with an empty body`);
    }
    // Missing and someone else's group are one 403; an admin is told it is missing.
    assert.equal((await giveLink("rahul", { sessionKey: "w03", url: LINK }, { groupId: "no-such-group" })).status, 403);
    assert.equal((await giveLink("zach", { sessionKey: "w03", url: LINK }, { groupId: "no-such-group" })).status, 404);
    assert.equal((await giveLink("rahul", { sessionKey: "w03", url: LINK }, { viewAs: true })).status, 403);
    // An archived group unstaffs its facilitators.
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await giveLink("rahul", { sessionKey: "w03", url: LINK })).status, 403);
    world.db.poke(`courseGroups/${B}`, { archived: false });
    assert.equal(w.everything(), before, "a refused link was written");
  });

  test("only a web address, only a session still to end, and never past the weeks a group keeps apart", async () => {
    for (const url of ["javascript:alert(1)", "meet.example.com/abc", "https://user:pass@meet.example.com/x", "", `https://meet.example.com/${"a".repeat(400)}`]) {
      assert.equal((await giveLink("rahul", { sessionKey: "w03", url })).status, 400, url);
    }
    assert.equal((await giveLink("rahul", { sessionKey: "w03", url: LINK, also: 1 })).status, 400, "an unknown field");
    assert.deepEqual(await giveLink("rahul", { sessionKey: "w09", url: LINK }), { status: 400, body: { error: words.MEETING_LINK_REFUSAL.noSession } });
    assert.deepEqual(await giveLink("rahul", { sessionKey: "w02", url: LINK }), { status: 409, body: { error: words.MEETING_LINK_REFUSAL.over } });
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w03: { kind: "cancelled", reason: "The room is closed.", dateKey: "2026-11-17", byUid: "rahul", at: NOW } },
    });
    assert.deepEqual(await giveLink("rahul", { sessionKey: "w03", url: LINK }), { status: 409, body: { error: words.MEETING_LINK_REFUSAL.cancelled } });
    // Twenty weeks already set apart: a new one is refused; one of them may change, and every week may too.
    const apart = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`w${String(i + 10).padStart(2, "0")}`, { location: "Somewhere" }]));
    world.db.poke(`courseGroups/${B}`, { sessionChanges: {}, sessionOverrides: apart });
    assert.deepEqual(await giveLink("rahul", { sessionKey: "w04", url: LINK }), { status: 409, body: { error: words.MEETING_LINK_REFUSAL.full } });
    assert.equal((await giveLink("rahul", { sessionKey: "w04", url: LINK, everyWeek: true })).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 4. The link reaches the group
// ---------------------------------------------------------------------------

describe("4. the link reaches everybody in the group, worded for whoever joins online", () => {
  test("on everybody's overview in the group, and on nobody else's", async () => {
    assert.equal((await giveLink("rahul", { sessionKey: "w03", url: LINK })).status, 200);
    for (const who of ["chloe", "farah", "kofi", "rahul"]) {
      const body = (await w.overview(who)).body;
      const card = body.groups.find((group) => group.id === B);
      assert.equal(card?.calendar.nextSession?.meetingUrl, LINK, who);
    }
    // Somebody in another group of the run is never handed Group B's link, nor is the lead reading it as a card of theirs.
    for (const who of ["amara", "dev"]) {
      const answer = await w.overview(who);
      assert.ok(!JSON.stringify(answer.body).includes("meet.example.com"), `${who} was handed Group B's link`);
    }
  });

  test("a session in a room keeps Add to calendar and carries the link for anybody joining online; an online week says Join online in its place", async () => {
    assert.equal((await giveLink("rahul", { sessionKey: "w03", url: LINK })).status, 200);
    const card = (await w.overview("chloe")).body.groups.find((group) => group.id === B);
    const facts = cardFacts.ticketFacts(card);
    assert.equal(facts.joinUrl, LINK);
    assert.equal(facts.joinFor, "joining-online");
    const inRoom = draw(SessionTicket, { facts, eyebrow: "Tonight · week 3", heading: "Tue 17 Nov, 6pm to 8pm", roomChanged: false, facilitators: [], calendar: true });
    assert.ok(inRoom.text.includes("Hallward B12"), inRoom.text);
    assert.ok(inRoom.text.includes("Add to calendar"), inRoom.text);
    assert.ok(inRoom.text.includes(`${linkWords.JOIN_ONLINE} ${words.FOR_JOINING_ONLINE} ${linkWords.LINK_IS_HERE}`), inRoom.text);
    assert.match(inRoom.html, /href="https:\/\/meet\.example\.com\/group-b-week-3"/);

    // The week held online: the link is everybody's, in Add to calendar's place, as before.
    world.db.poke(`courseGroups/${B}`, { sessionModes: { w03: "virtual" } });
    const onlineCard = (await w.overview("chloe")).body.groups.find((group) => group.id === B);
    const onlineFacts = cardFacts.ticketFacts(onlineCard);
    assert.equal(onlineFacts.joinFor, "everybody");
    const online = draw(SessionTicket, { facts: onlineFacts, eyebrow: "Tonight · week 3 · online", heading: "6pm to 8pm", roomChanged: false, facilitators: [], calendar: true });
    assert.ok(!online.text.includes("Add to calendar"), online.text);
    assert.ok(online.text.includes(`${linkWords.JOIN_ONLINE} ${linkWords.LINK_IS_HERE}`), online.text);
    assert.ok(!online.text.includes(words.FOR_JOINING_ONLINE), online.text);

    // An in-person week still carries the link now: somebody may be joining it online.
    world.db.poke(`courseGroups/${B}`, { sessionModes: { w03: "in-person" } });
    const personFacts = cardFacts.ticketFacts((await w.overview("chloe")).body.groups.find((group) => group.id === B));
    assert.deepEqual([personFacts.joinUrl, personFacts.joinFor, personFacts.room], [LINK, "joining-online", "Hallward B12"]);
  });

  test("one answer says who sees a link: the group's people, its standing facilitators and admins", () => {
    const user = (uid, role = "member") => ({ uid, role, email: `${uid}@example.com`, displayName: uid, suRecognised: false, permissions: {} });
    const group = { id: B, facilitatorUids: ["rahul"] };
    const sees = (viewer, seat, isAdmin = false) => audience.seesSessionLink({ viewer, isAdmin, seat, group, sessionKey: "w03" });
    assert.equal(sees(user("zach", "admin"), null, true), true, "an admin");
    assert.equal(sees(user("chloe"), { status: "active", groupId: B }), true, "somebody with a seat in the group");
    assert.equal(sees(user("rahul"), null), true, "a facilitator of the group");
    assert.equal(sees(user("amara"), { status: "active", groupId: A }), false, "somebody in another group");
    assert.equal(sees(user("sam"), { status: "withdrawn", groupId: B }), false, "somebody who left");
    assert.equal(sees(user("rahul", "pending"), null), false, "a facilitator whose account no longer stands");
    assert.equal(sees(user("nobody"), null), false, "a member on nothing");
  });

  test("who a link is for, by how the session meets", () => {
    const held = (mode, campus, room) => model.heldOnline({ mode, campus, room });
    assert.equal(held("virtual", "jubilee", "Room 1"), true);
    assert.equal(held("in-person", "online", ""), false);
    assert.equal(held(null, "online", "Room 1"), true);
    assert.equal(held(null, "jubilee", ""), false);
    assert.equal(held(null, null, "Hallward B12"), false);
    assert.equal(held(null, null, "  "), true, "a link and nothing else is the oldest shape of an online group");
  });
});

// ---------------------------------------------------------------------------
// 5. The programme page: one at a time
// ---------------------------------------------------------------------------

describe("5. the programme page offers Joining online beside Can't make it, one at a time", () => {
  test("to somebody taking part, about the next session; to nobody else, and not once it has started", async () => {
    assert.deepEqual(await ticketFor("chloe"), { groupId: B, sessionKey: "w03", day: "Tue 17 Nov", said: false, told: false });
    for (const who of ["rahul", "zach", "claudia", "una", "sam", "nobody"]) assert.equal(await ticketFor(who), null, who);
    at("2026-11-17T18:30:00Z");
    assert.equal(await ticketFor("chloe"), null, "the session has started");
    at("2026-11-17T20:30:00Z");
    assert.deepEqual(await ticketFor("chloe"), { groupId: B, sessionKey: "w04", day: "Tue 24 Nov", said: false, told: false });
    // A line a facilitator filled in leaves nothing to offer.
    at(NOW.toISOString());
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "present" }])).status, 200);
    assert.equal(await ticketFor("chloe"), null);
  });

  test("both buttons while neither is said; once said, only the way back; once told, only Can't make it's way back", async () => {
    const cant = { groupId: B, sessionKey: "w03", day: "Tue 17 Nov", told: false };
    const open = draw(TicketAnswers, { cantMakeIt: cant, joiningOnline: await ticketFor("chloe"), hasLink: false });
    assert.equal(open.text, `${cantWords.CANT_MAKE_IT} ${words.JOINING_ONLINE}`);
    assert.match(open.html, /aria-label="Joining online on Tue 17 Nov"/);

    assert.equal((await online("chloe", "w03")).status, 200);
    const said = draw(TicketAnswers, { cantMakeIt: cant, joiningOnline: await ticketFor("chloe"), hasLink: false });
    assert.equal(said.text, `${words.saidOnlineWords(false)} ${words.IN_THE_ROOM_AFTER_ALL}`);
    assert.ok(!said.text.includes(cantWords.CANT_MAKE_IT), "Can't make it is offered while they are joining online");
    const linked = draw(TicketAnswers, { cantMakeIt: cant, joiningOnline: await ticketFor("chloe"), hasLink: true });
    assert.ok(linked.text.startsWith(words.saidOnlineWords(true)), linked.text);

    assert.equal((await inTheRoom("chloe", "w03")).status, 200);
    assert.equal((await cantMake("chloe", "w03")).status, 200);
    const told = draw(TicketAnswers, { cantMakeIt: { ...cant, told: true }, joiningOnline: await ticketFor("chloe"), hasLink: false });
    assert.equal(told.text, `${cantWords.TOLD_US} ${cantWords.CAN_MAKE_IT_AFTER_ALL}`);
    // A view-as session draws the answers and presses nothing.
    const locked = draw(TicketAnswers, { cantMakeIt: cant, joiningOnline: { ...(await ticketFor("chloe")), told: false }, hasLink: false, locked: true });
    assert.match(locked.html, /aria-label="Joining online on Tue 17 Nov" disabled=""/);
  });

  test("on the programme page's ticket, beside Add to calendar, only about the session the ticket shows", async () => {
    await w.asBrowser("chloe");
    const view = await ticketFor("chloe");
    const page = w.programmeHome("chloe", { joiningOnline: view });
    assert.ok(page.text.includes("Hallward B12 R S with Rahul and Sofia Add to calendar Joining online"), page.text);
    for (const other of [{ ...view, sessionKey: "w04" }, { ...view, groupId: A }]) {
      assert.doesNotMatch(w.programmeHome("chloe", { joiningOnline: other }).text, /Joining online/, JSON.stringify(other));
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The register
// ---------------------------------------------------------------------------

describe("6. the register keeps in the room or online beside the marks", () => {
  test("its facilitators, the lead and admins read who said it; a mark that says they came puts them online, and the room otherwise", async () => {
    assert.equal((await online("chloe", "w03")).status, 200);
    for (const who of ["rahul", "claudia", "zach"]) {
      const answer = await registerAs(who);
      assert.equal(answer.status, 200, who);
      assert.deepEqual(answer.body.onlineSaid, { w03: ["chloe"] }, who);
      assert.deepEqual(answer.body.online, {}, who);
    }
    // A press that does not say where: Chloe, who said online, is online; Kofi is in the room.
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "present" }, { uid: "kofi", status: "late" }])).status, 200);
    assert.deepEqual(stored(B, 3).online, { chloe: true, kofi: false });
    assert.deepEqual(stored(B, 3).records, { chloe: "present", kofi: "late" });
    assert.deepEqual((await registerAs("rahul")).body.online, { w03: { chloe: true, kofi: false } });

    // Chloe was in the room after all: kept there through every mark that still says Chloe came.
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "present", online: false }])).status, 200);
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "late" }])).status, 200);
    assert.equal(stored(B, 3).online.chloe, false);
    // Any other mark takes it away, and cannot carry one.
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "absent" }])).status, 200);
    assert.equal(Object.hasOwn(stored(B, 3).online, "chloe"), false);
    assert.equal((await markAs("rahul", 3, [{ uid: "kofi", status: "excused", online: true }])).status, 400);
    assert.equal((await markAs("rahul", 3, [{ uid: "kofi", status: "present", online: "yes" }])).status, 400);
    // Chloe's word stays Chloe's: marking never took it.
    assert.deepEqual(Object.keys(stored(B, 3).onlineSaid), ["chloe"]);
    // "Rest present" puts the people who said it online.
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "present", online: true }, { uid: "farah", status: "present", online: false }])).status, 200);
    assert.deepEqual(stored(B, 3).online, { chloe: true, kofi: false, farah: false });
  });

  test("the grid draws the choice beside a mark that says they came, a slot everywhere else, and says it in words", async () => {
    assert.equal((await online("chloe", "w03")).status, 200);
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "present" }, { uid: "kofi", status: "absent" }])).status, 200);
    const drawn = drawRegister((await registerAs("rahul")).body);
    const choices = [...drawn.html.matchAll(/aria-label="(Where [^"]+)"/g)].map((match) => match[1]);
    // Week 1 and 2's registers are finished and locked for a facilitator; week 3 has two marks, one that says came.
    assert.deepEqual(choices, ["Where Chloe Nguyen was in week 3: joined online. Sets in the room."]);
    assert.match(drawn.html, /aria-label="Chloe Nguyen, week 3: Present\. Joined online\. Sets Late\."/);
    assert.match(drawn.html, /aria-label="Kofi Asante, week 3: Absent\. Sets Excused\."/);
    // Never a second control whose name starts as a cell's does: one cell button per marked week of Chloe's.
    assert.equal([...drawn.html.matchAll(/aria-label="Chloe Nguyen, week 3: /g)].length, 1);
    assert.ok(drawn.text.includes("Not marked Online"), "the legend says what the screen is");
    // Somebody who said it and is not marked yet: heard beside the cell.
    assert.equal((await online("farah", "w04")).status, 200);
    at("2026-11-24T19:00:00Z");
    const later = drawRegister((await registerAs("rahul")).body);
    assert.match(later.html, /aria-label="Farah Hussain, week 4: not marked\. They said they’re joining online\. Sets Present\."/);
  });

  test("a finished register: corrected by an admin, with an audit row, and counted in everybody's rollup", async () => {
    assert.equal((await online("chloe", "w03")).status, 200);
    assert.equal((await markAs("rahul", 3, [{ uid: "chloe", status: "present" }, { uid: "farah", status: "present" }, { uid: "kofi", status: "late" }])).status, 200);
    at("2026-11-17T20:30:00Z");
    const pushed = await call("rahul", pushRoute.POST, { groupId: B }, { body: { weekNumber: 3 }, course: true });
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    const rollup = (uid) => world.db.read(`courseEnrolments/${RUN.agi}__${uid}`).attendance;
    assert.equal(rollup("chloe").online, 1, "Chloe came to one session online");
    assert.equal(rollup("farah").online, 0);
    assert.equal(rollup("kofi").online, 0);
    // A facilitator cannot move it any more; an admin can, and says what moved.
    assert.equal((await markAs("rahul", 3, [{ uid: "kofi", status: "late", online: true }])).status, 409);
    const fixed = await markAs("zach", 3, [{ uid: "kofi", status: "late", online: true }], "PATCH");
    assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
    assert.deepEqual([fixed.body.marked, fixed.body.logged], [1, 1]);
    assert.equal(stored(B, 3).online.kofi, true);
    assert.equal(rollup("kofi").online, 1, "the correction rebuilt Kofi's figures");
    const audit = world.db
      .paths()
      .filter((path) => path.startsWith("courseAudit/"))
      .map((path) => world.db.read(path))
      .filter((row) => row.kind === "attendance-edit");
    // CHANGED ON PURPOSE (November 2026): a correction's row says the line
    // in the register's words, with the reason, and keeps both lines apart.
    assert.deepEqual(audit.map((row) => row.detail), [
      "Corrected week 3’s register: Kofi Asante, Arrived late, in the room to Arrived late, online. Why: “From the sign-in sheet.”",
    ]);
    assert.deepEqual(
      [audit[0].before.line, audit[0].before.online, audit[0].after.line, audit[0].after.online],
      ["Arrived late, in the room", false, "Arrived late, online", true],
    );
    // The same place sent again moves nothing and logs nothing.
    const again = await markAs("zach", 3, [{ uid: "kofi", status: "late", online: true }], "PATCH");
    assert.deepEqual([again.body.marked, again.body.logged], [0, 0]);
    // A mark changed with where it was: one row, saying both.
    const both = await markAs("zach", 3, [{ uid: "farah", status: "late", online: true }], "PATCH");
    assert.equal(both.status, 200);
    assert.ok(
      world.db
        .paths()
        .some(
          (path) =>
            path.startsWith("courseAudit/") &&
            world.db.read(path).detail ===
              "Corrected week 3’s register: Farah Hussain, In the room to Arrived late, online. Why: “From the sign-in sheet.”",
        ),
      "the correction of a mark and its place is not one row saying both",
    );
  });
});

// ---------------------------------------------------------------------------
// 7. The figures
// ---------------------------------------------------------------------------

describe("7. the figures say in the room and online, and a register from before says the room", () => {
  test("the Attendance tab's rows, cells, weeks and file", async () => {
    world.db.poke(registerPath(B, 1), { online: { chloe: true, farah: false } });
    const records = await recordsNow();
    const listed = attendance.listGroups(records, { isAdmin: true }, new Date(), attendance.weeksOf(records));
    const chloe = rowOf(listed, "chloe");
    assert.deepEqual([chloe.came, chloe.of, chloe.online], [2, 2, 1]);
    assert.deepEqual(chloe.cells.find((cell) => cell.weekNumber === 1), { weekNumber: 1, state: "mark", mark: "present", saved: false, online: true });
    assert.deepEqual(chloe.cells.find((cell) => cell.weekNumber === 2), { weekNumber: 2, state: "mark", mark: "present", saved: false }, "a register from before reads as in the room");
    assert.equal(rowOf(listed, "farah").online, 0);
    // Somebody in a group nobody joined online reads as before.
    assert.equal(rowOf(listed, "amara").online, 0);

    const model = attendance.buildRunAttendance(records, { isAdmin: true }, new Date());
    const groupB = model.groups.find((group) => group.id === B);
    assert.deepEqual(groupB.totals.find((total) => total.weekNumber === 1).online, 1);
    const drawn = draw(ProgrammeAttendance, { model, roundId: "r", programmeId: "p", programmeName: "AGI Strategy" });
    assert.match(drawn.html, /aria-label="Chloe Nguyen, week 1: Present, online"/);
    assert.ok(drawn.text.includes("2 of 2 1 in the room, 1 online"), drawn.text);
    assert.ok(drawn.text.includes("P Saved, not pushed P Online"), "the legend says what the corner is once any mark has it");
    const file = attendance.attendanceCsvTable(model);
    const row = file.rows.find((each) => each[1] === "Chloe Nguyen");
    assert.equal(row[2], "Present online");
    assert.equal(row[3], "Present");
    assert.deepEqual(file.header.slice(-3), ["Came", "Of", "Left"], "the file's columns are what they were");

    // Nobody online anywhere: the tab reads exactly as it always has.
    world.db.poke(registerPath(B, 1), { online: {} });
    const plain = attendance.buildRunAttendance(await recordsNow(), { isAdmin: true }, new Date());
    const plainDrawn = draw(ProgrammeAttendance, { model: plain, roundId: "r", programmeId: "p", programmeName: "AGI Strategy" });
    assert.doesNotMatch(plainDrawn.text, /online|in the room/i);
  });

  test("who finished says where the sessions somebody came to were, once any was online", async () => {
    world.db.poke(registerPath(B, 1), { online: { chloe: true } });
    // After every group's last session: Group A's is Thu 10 Dec.
    at("2026-12-11T12:00:00Z");
    const model = whoFinished.buildWhoFinished(
      await recordsNow(),
      { rule: null, decisions: new Map() },
      new Map(),
      { isAdmin: true, uid: "zach", role: "admin" },
      new Date(),
    );
    const chloe = model.rows.find((row) => row.uid === "chloe");
    assert.equal(chloe.cameWhere, "1 in the room, 1 online");
    assert.equal(Object.hasOwn(model.rows.find((row) => row.uid === "farah"), "cameWhere"), false);
  });

  test("the member's own sessions: online on the session, in words and in the legend, and never a count", async () => {
    world.db.poke(registerPath(B, 1), { online: { chloe: true, farah: true } });
    const answer = await w.asBrowser("chloe");
    assert.equal(answer.status, 200);
    assert.deepEqual(
      answer.body.ownAttendance.sessions.map((session) => [session.sessionKey, session.status, session.online]),
      [
        ["w01", "present", true],
        ["w02", "present", false],
      ],
    );
    assert.equal(typeof answer.body.ownAttendance.rollup.online, "number");
    assert.ok(!JSON.stringify(answer.body).includes("farah"), "Chloe was handed somebody else's place");
    const page = w.programmeHome("chloe");
    assert.match(page.html, /aria-label="Week 1, Tue 3 Nov: Present, online"/);
    assert.match(page.html, /aria-label="Week 2, Tue 10 Nov: Present"/);
    const card = /Your sessions .*? Your facilitators fill these in after each session\./.exec(page.text)?.[0] ?? "";
    assert.equal(
      card,
      "Your sessions P 3 Nov P 10 Nov · 17 Nov · 24 Nov · 1 Dec · 8 Dec P Present · Not yet Online Your facilitators fill these in after each session.",
      "the member's card says something besides its marks, its legend and its line",
    );
    assert.doesNotMatch(card, /\d+ of \d+|in the room|sessions:/, "the member's card counts their sessions");
  });
});

// ---------------------------------------------------------------------------
// 8. The words
// ---------------------------------------------------------------------------

describe("8. the words", () => {
  test("no dash anywhere; nothing a member reads says mark, grade or score, or how many they can miss", () => {
    const toThePerson = [
      words.JOINING_ONLINE,
      words.joiningOnlineLabel("Tue 17 Nov"),
      words.IN_THE_ROOM_AFTER_ALL,
      words.saidOnlineWords(true),
      words.saidOnlineWords(false),
      words.onlineSavedWords(true, false),
      words.onlineSavedWords(false, false),
      words.SAVING,
      words.FOR_JOINING_ONLINE,
      words.ONLINE_WORD,
      ...Object.values(words.JOINING_ONLINE_REFUSAL),
    ];
    for (const line of toThePerson) {
      assert.doesNotMatch(line, /[\u2013\u2014]/, line);
      assert.doesNotMatch(line, /\bmark|\bgrade|\bscore|\bmiss|dropped out/i, line);
    }
    const toStaff = [
      words.joiningCountWords(1, "Tue 10 Nov"),
      words.joiningCountWords(2, "Tue 10 Nov"),
      words.joiningNamesWords(["Sam"], "Tue 10 Nov"),
      words.joiningNamesWords(["Sam", "Priya", "Kofi"], "Tue 10 Nov"),
      words.addLinkWords(2),
      words.linkFieldLabel(2),
      words.EVERY_WEEK,
      words.ADD_LINK,
      words.LINK_ADDED,
      words.BOX_NOTE,
      words.IN_THE_ROOM,
      words.JOINED_ONLINE,
      words.SAID_ONLINE_IN_ADVANCE,
      words.whereChoiceLabel("Sam", 3, true),
      words.roomAndOnlineWords(4, 1),
      words.sessionsWhereWords(4, 1),
      ...Object.values(words.MEETING_LINK_REFUSAL),
    ];
    for (const line of toStaff) assert.doesNotMatch(line, /[\u2013\u2014]/, line);
    assert.equal(words.joiningCountWords(2, "Tue 10 Nov"), "2 people are joining online on Tue 10 Nov.");
    assert.equal(words.joiningCountWords(1, "Tue 10 Nov"), "1 person is joining online on Tue 10 Nov.");
    assert.equal(`${words.joiningCountWords(2, "Tue 10 Nov")} ${words.addLinkWords(2)}`, "2 people are joining online on Tue 10 Nov. Add a meeting link for week 2.");
    assert.equal(words.joiningNamesWords(["Sam", "Priya", "Kofi"], "Tue 10 Nov"), "Sam, Priya and Kofi are joining online on Tue 10 Nov.");
    assert.equal(words.sessionsWhereWords(4, 1), "5 sessions: 4 in the room, 1 online");
    assert.equal(words.sessionsWhereWords(1, 0), "1 session: 1 in the room, 0 online");
    // The link is on the site, never promised by email.
    for (const line of [...toThePerson, ...toStaff]) assert.doesNotMatch(line, /send(?:s|ing)? (?:you )?the (?:joining|meeting|join) link/i, line);
  });
});
