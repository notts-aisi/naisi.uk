/**
 * "CAN'T MAKE IT" FOR ONE SESSION, run: somebody taking part tells us, before
 * a session of their group starts, that they can't make it, from the ticket
 * on their programme page, and the session's register records them as
 * excused (privacy v15, Registers: "We may let you tell us in advance that you
 * can't make a session, which records you as excused.").
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/cant-make-it   (the press)
 *   GET  /api/courses/groups/[groupId]/attendance     (the register, which says so)
 *
 * ## What this guards
 *
 *  1. WHO. Somebody taking part in the group, told their group, and nobody
 *     else: every other kind of caller is refused before anything is
 *     written, and nobody is emailed.
 *  2. WHEN. Only before the session starts, on a session the group holds that
 *     is not called off, whose register is not finished and does not say it
 *     did not happen; never over a line a facilitator has filled in. Saying
 *     it twice changes nothing; taking it back clears the person's own line
 *     and nobody else's.
 *  3. THE REGISTER SAYS IT to the group's facilitators, the lead and admins,
 *     for a session to come whether or not it is a column yet, until a
 *     facilitator takes the line over.
 *  4. EXCUSED IS NEVER MISSING: a run of absences stops at it once its session
 *     has happened, and never before.
 *  5. THE PROGRAMME PAGE offers it on the ticket of the group's next session,
 *     says so once told, and offers it back.
 *  6. THE WORDS: no dash, and never "mark" in what the person reads.
 *
 * Real: the press's and the register's handlers, the programme page's loader
 * and component, and every library under them. Faked: what the member pages
 * world fakes (the session, the Admin SDK handle, the view-as guard, the
 * clock, the stylesheets, the browser's data hooks), and, to draw the
 * register, its hook.
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
import { C, D, register, registerPath } from "./lib/hubAttendanceWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeMemberPagesWorld("__cantMakeIt");
const { world, call, courseRoute, loadTs } = w;
const press = await courseRoute("groups", "[groupId]", "cant-make-it");
const registerRoute = await courseRoute("groups", "[groupId]", "attendance");
const seat = await loadTs(join("lib", "courses", "cantMakeIt", "seat.ts"));
const words = await loadTs(join("lib", "courses", "cantMakeIt", "words.ts"));
const attendance = await loadTs(join("lib", "courses", "programmeAttendance.ts"));
const courses = await loadTs(join("lib", "firestore", "courses.ts"));
const groupsLib = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const enrolments = await loadTs(join("lib", "firestore", "courseEnrolments.ts"));

const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

/** One press, as `who`, about a session of `groupId`. */
const tell = (who, body, { groupId = B, viewAs = false } = {}) =>
  call(who, press.POST, { groupId }, { body, course: true, viewAs });
const cantMake = (who, sessionKey, options) => tell(who, { sessionKey, cantMakeIt: true }, options);
const canAfterAll = (who, sessionKey, options) => tell(who, { sessionKey, cantMakeIt: false }, options);
/** The register's answer to `who`. */
const registerAs = (who, groupId = B) => call(who, registerRoute.GET, { groupId }, { course: true });
/** A register as stored. */
const stored = (groupId, week) => world.db.read(registerPath(groupId, week));
/** A stored stamp, as a Date, whichever the store kept. */
const instant = (value) => (value instanceof Date ? value : typeof value?.toDate === "function" ? value.toDate() : new Date(value));

/** The run's records and one viewer's listed groups, as the lead's tabs read them. */
async function listedAs(isAdmin) {
  world.course = true;
  try {
    const records = await attendance.readRunRecords(world.courseDb, RUN.agi);
    return attendance.listGroups(records, { isAdmin }, new Date(), attendance.weeksOf(records));
  } finally {
    world.course = false;
  }
}
const rowOf = (listed, uid) => listed.flatMap((entry) => entry.people).find((person) => person.row.uid === uid)?.row;

/** What the programme page's loader hands the ticket for `who`. */
async function ticketFor(who) {
  const run = courses.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
  const groups = world.db
    .paths()
    .filter((path) => path.startsWith("courseGroups/") && path.split("/").length === 2)
    .map((path) => groupsLib.normalizeCourseGroup(path.split("/")[1], world.db.read(path)))
    .filter((group) => group.runId === RUN.agi && !group.archived);
  const raw = world.db.read(`courseEnrolments/${RUN.agi}__${who}`);
  const enrolment = raw ? enrolments.normalizeCourseEnrolment(`${RUN.agi}__${who}`, raw) : null;
  world.course = true;
  try {
    return await seat.cantMakeItFor(world.courseDb, { user: w.sessionOf(who), run, enrolment, groups, now: new Date() });
  } finally {
    world.course = false;
  }
}

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who may say it", () => {
  test("somebody taking part in the group, told their group: the register records them excused, with when they said so, and nobody is emailed", async () => {
    const answer = await cantMake("chloe", "w03");
    assert.deepEqual(answer, { status: 200, body: { ok: true, told: true, message: words.TOLD_US } });
    const doc = stored(B, 3);
    assert.deepEqual(doc.records, { chloe: "excused" });
    assert.deepEqual(Object.keys(doc.excusedInAdvance), ["chloe"]);
    assert.equal(instant(doc.excusedInAdvance.chloe).toISOString(), NOW.toISOString(), "when they told us");
    assert.deepEqual([doc.runId, doc.groupId, doc.weekNumber, doc.occurrence], [RUN.agi, B, 3, 1], "the register's parts, as the marking route writes them");
    // A draft nobody has marked: no push, no held switch, nobody's name as its marker.
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
      const answer = await cantMake(who, "w03");
      assert.equal(answer.status, status, `${why}: ${JSON.stringify(answer.body)}`);
      if (status === 404) assert.equal(answer.body.error, words.CANT_MAKE_IT_REFUSAL.notYours, why);
    }
    // Una is placed in Group C and Publish has not told her: her own group is nobody's to her yet.
    assert.equal((await cantMake("una", "w03", { groupId: "agi-autumn-2026-wednesday__grp00003" })).status, 404);
    // A group that is not there is the same answer as one they are not in, and an id that names nothing.
    assert.deepEqual((await cantMake("chloe", "w03", { groupId: "no-such-group" })).body, { error: words.CANT_MAKE_IT_REFUSAL.notYours });
    assert.equal((await cantMake("chloe", "w03", { groupId: ".." })).status, 404);
    // A view-as session is refused before anything else.
    assert.equal((await cantMake("chloe", "w03", { viewAs: true })).status, 403);
    assert.equal(w.everything(), before, "a refused press wrote something");
  });

  test("a body that is not a press is the same 400 for everybody signed in, before anything is read", async () => {
    for (const who of ["chloe", "zach", "rahul", "nobody"]) {
      assert.equal((await tell(who, {})).status, 400, who);
    }
    for (const body of [{ sessionKey: "w3", cantMakeIt: true }, { sessionKey: "w03", cantMakeIt: "yes" }, { sessionKey: "w03" }, []]) {
      assert.equal((await tell("chloe", body)).status, 400, JSON.stringify(body));
    }
  });
});

// ---------------------------------------------------------------------------
// 2. When
// ---------------------------------------------------------------------------

describe("2. while it may be said", () => {
  test("only before the session starts", async () => {
    at("2026-11-17T18:00:00Z");
    assert.deepEqual((await cantMake("chloe", "w03")).body, { error: words.CANT_MAKE_IT_REFUSAL.started });
    assert.deepEqual((await cantMake("chloe", "w02")).body, { error: words.CANT_MAKE_IT_REFUSAL.started });
    assert.equal(stored(B, 3), undefined);
  });

  test("only about a session the group holds", async () => {
    assert.deepEqual(await cantMake("chloe", "w09"), { status: 400, body: { error: words.CANT_MAKE_IT_REFUSAL.noSession } });
  });

  test("not about a session called off through Change a session", async () => {
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w03: { kind: "cancelled", reason: "The room is closed.", dateKey: "2026-11-17", byUid: "rahul", at: NOW } },
    });
    assert.deepEqual(await cantMake("chloe", "w03"), { status: 409, body: { error: words.CANT_MAKE_IT_REFUSAL.cancelled } });
  });

  test("not once its register is finished, or says the session did not happen", async () => {
    world.db.seed(registerPath(B, 4), register(B, 4, {}, { pushed: true }));
    world.db.seed(registerPath(B, 5), register(B, 5, {}, { pushed: false, held: false }));
    assert.deepEqual((await cantMake("chloe", "w04")).body, { error: words.CANT_MAKE_IT_REFUSAL.finished });
    assert.deepEqual((await cantMake("chloe", "w05")).body, { error: words.CANT_MAKE_IT_REFUSAL.notHeld });
  });

  test("never over a line a facilitator has filled in: it is theirs", async () => {
    const marked = await call("rahul", registerRoute.POST, { groupId: B }, { body: { weekNumber: 3, marks: [{ uid: "farah", status: "present" }] }, course: true });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.deepEqual(await cantMake("farah", "w03"), { status: 409, body: { error: words.CANT_MAKE_IT_REFUSAL.marked } });
    assert.deepEqual(await canAfterAll("farah", "w03"), { status: 409, body: { error: words.CANT_MAKE_IT_REFUSAL.marked } });
    assert.deepEqual(stored(B, 3).records, { farah: "present" });
  });

  test("saying it twice changes nothing; taking it back clears their own line and nobody else's", async () => {
    assert.equal((await cantMake("chloe", "w03")).status, 200);
    at("2026-11-17T12:30:00Z");
    assert.equal((await cantMake("kofi", "w03")).status, 200);
    const first = stored(B, 3).excusedInAdvance.chloe;
    assert.deepEqual((await cantMake("chloe", "w03")).body.told, true);
    assert.equal(instant(stored(B, 3).excusedInAdvance.chloe).toISOString(), instant(first).toISOString(), "saying it again moved when they said it");

    const back = await canAfterAll("chloe", "w03");
    assert.deepEqual(back, { status: 200, body: { ok: true, told: false, message: words.savedWords(false) } });
    assert.deepEqual(stored(B, 3).records, { kofi: "excused" });
    assert.deepEqual(Object.keys(stored(B, 3).excusedInAdvance), ["kofi"]);
    // Taking back what is not there is no change either.
    assert.deepEqual((await canAfterAll("chloe", "w03")).body.told, false);
    assert.deepEqual(stored(B, 3).records, { kofi: "excused" });
  });
});

// ---------------------------------------------------------------------------
// 3. The register says it
// ---------------------------------------------------------------------------

/** The register, drawn from one caller's own answer, by the real grid with its hook handing it that answer. */
const grid = { attendance: null, h: createElement };
globalThis.__cantMakeItGrid = grid;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const stylesheets = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) stylesheets.add(specifier);
}
const ui = createLoader({
  stubs: new Map([
    ...[...stylesheets].map((specifier) => [specifier, CLASS_NAMES]),
    ["server-only", "export {};"],
    ["next/link", "export default ({ href, className, children }) => globalThis.__cantMakeItGrid.h('a', { href, className }, children);"],
    ["next/navigation", "export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {} });"],
    ["@/hooks/useHydrated", "export function useHydrated() { return true; }"],
    ["./useAttendance", "export default function useAttendance() { return globalThis.__cantMakeItGrid.attendance; }"],
  ]),
});
const AttendanceGrid = (await ui.loadTs(join("features", "courses", "AttendanceGrid.tsx"))).default;
const CantMakeIt = (await ui.loadTs(join("features", "courses", "weekly", "CantMakeIt.tsx"))).default;

function drawRegister(payload) {
  grid.attendance = {
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

describe("3. the register says it to the group's facilitators, the lead and admins", () => {
  test("for each session to come, a column yet or not, whose people said so, and beside their mark", async () => {
    assert.equal((await cantMake("chloe", "w03")).status, 200);
    assert.equal((await cantMake("farah", "w04")).status, 200);
    for (const who of ["rahul", "sofia", "claudia", "zach"]) {
      const answer = await registerAs(who);
      assert.equal(answer.status, 200, who);
      assert.deepEqual(
        answer.body.cantMakeIt,
        [
          { sessionKey: "w03", weekNumber: 3, occurrence: 1, dateKey: "2026-11-17", ended: false, uids: ["chloe"] },
          { sessionKey: "w04", weekNumber: 4, occurrence: 1, dateKey: "2026-11-24", ended: false, uids: ["farah"] },
        ],
        who,
      );
      assert.equal(answer.body.records.w03.chloe, "excused", who);
      // Week 4 is not a column yet: its register says nothing in the grid's marks.
      assert.equal(answer.body.sessions.some((session) => session.sessionKey === "w04"), false, who);
    }
    // Drawn for Rahul: a line a session over the table, by the names the register shows him, and
    // Chloe's cell says the excused mark is her own word.
    const drawn = drawRegister((await registerAs("rahul")).body);
    assert.ok(drawn.text.includes("Tue 17 Nov: Chloe Nguyen can’t make it."), drawn.text);
    assert.ok(drawn.text.includes("Tue 24 Nov: Farah Hussain can’t make it."), drawn.text);
    assert.match(drawn.html, new RegExp(`aria-label="Chloe Nguyen, week 3: Excused\\. ${words.TOLD_IN_ADVANCE}`));
    // Nobody else's cell says it.
    assert.doesNotMatch(drawn.html, /aria-label="(?:Farah Hussain|Kofi Asante), week 3: [^"]*They told us/);
  });

  test("a facilitator who fills in the line takes it over, and the register stops saying it", async () => {
    assert.equal((await cantMake("chloe", "w03")).status, 200);
    assert.equal((await cantMake("kofi", "w03")).status, 200);
    const markAs = (status) =>
      call("rahul", registerRoute.POST, { groupId: B }, { body: { weekNumber: 3, marks: [{ uid: "chloe", status }] }, course: true });
    const marked = await markAs("present");
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    // Her note goes with the mark it came with; Kofi's stays with his.
    assert.deepEqual(Object.keys(stored(B, 3).excusedInAdvance), ["kofi"]);
    const answer = await registerAs("rahul");
    assert.deepEqual(answer.body.cantMakeIt.map((entry) => entry.uids), [["kofi"]]);
    const drawn = drawRegister(answer.body);
    assert.doesNotMatch(drawn.text, /Chloe Nguyen can’t make it/);
    assert.ok(drawn.text.includes("Tue 17 Nov: Kofi Asante can’t make it."), drawn.text);
    // Tapped on to excused, the mark is still the facilitator's: she is asked
    // to tell them, and "I can make it after all" cannot clear it.
    assert.equal((await markAs("excused")).status, 200);
    assert.deepEqual((await registerAs("rahul")).body.cantMakeIt.map((entry) => entry.uids), [["kofi"]]);
    assert.equal(await ticketFor("chloe"), null);
    assert.deepEqual(await canAfterAll("chloe", "w03"), { status: 409, body: { error: words.CANT_MAKE_IT_REFUSAL.marked } });
    assert.equal(stored(B, 3).records.chloe, "excused");
  });

  test("once the session has ended, the line is gone and the mark stays excused", async () => {
    assert.equal((await cantMake("chloe", "w03")).status, 200);
    at("2026-11-17T20:30:00Z");
    const answer = await registerAs("rahul");
    assert.deepEqual(answer.body.cantMakeIt.map((entry) => [entry.sessionKey, entry.ended, entry.uids]), [["w03", true, ["chloe"]]]);
    const drawn = drawRegister(answer.body);
    assert.doesNotMatch(drawn.text, /can’t make it\./);
    assert.match(drawn.html, new RegExp(`aria-label="Chloe Nguyen, week 3: Excused\\. ${words.TOLD_IN_ADVANCE}`));
  });

  test("the people in the group never read it: the register is refused them as before", async () => {
    assert.equal((await cantMake("chloe", "w03")).status, 200);
    for (const who of ["chloe", "farah", "amara"]) assert.equal((await registerAs(who)).status, 403, who);
  });
});

// ---------------------------------------------------------------------------
// 4. Excused is never missing
// ---------------------------------------------------------------------------

describe("4. excused never counts as missing", () => {
  test("a run of absences stops at it once its session has happened, and not a moment before", async () => {
    // Freya: present, absent, and absent again on Monday's register: two in a row.
    assert.equal(rowOf(await listedAs(true), "freya").absentInARow, 2);
    // She tells us she can't make next Monday's.
    assert.equal((await cantMake("freya", "w04", { groupId: D })).status, 200);
    // Until that session happens, what she missed still stands.
    assert.equal(rowOf(await listedAs(true), "freya").absentInARow, 2);
    // Once it has, her latest mark is excused, and nothing is missed in a row.
    at("2026-11-24T09:00:00Z");
    const row = rowOf(await listedAs(true), "freya");
    assert.equal(row.absentInARow, 0);
    assert.deepEqual(row.cells.find((cell) => cell.weekNumber === 4), { weekNumber: 4, state: "mark", mark: "excused", saved: true });
  });

  test("on a session already a column of the grid, the same: the run stands until the session starts", async () => {
    // Hamza missed both of Group C's sessions; its third, a column this week, is tomorrow at 1pm.
    world.db.seed(registerPath(C, 1), register(C, 1, { hamza: "absent" }));
    world.db.seed(registerPath(C, 2), register(C, 2, { hamza: "absent" }));
    assert.equal(rowOf(await listedAs(true), "hamza").absentInARow, 2);
    assert.equal((await cantMake("hamza", "w03", { groupId: C })).status, 200);
    const before = rowOf(await listedAs(true), "hamza");
    assert.equal(before.absentInARow, 2);
    assert.deepEqual(before.cells.find((cell) => cell.weekNumber === 3), { weekNumber: 3, state: "mark", mark: "excused", saved: true });
    at("2026-11-18T13:00:00Z");
    assert.equal(rowOf(await listedAs(true), "hamza").absentInARow, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. The programme page
// ---------------------------------------------------------------------------

describe("5. the programme page offers it on the ticket of the next session", () => {
  test("to somebody taking part, says so once they have told us, and offers it back", async () => {
    assert.deepEqual(await ticketFor("chloe"), { groupId: B, sessionKey: "w03", day: "Tue 17 Nov", told: false });
    await w.asBrowser("chloe");
    const before = w.programmeHome("chloe", { cantMakeIt: await ticketFor("chloe") });
    assert.ok(before.text.includes("Tue 17 Nov, 6pm to 8pm Hallward B12 R S with Rahul and Sofia Add to calendar Can’t make it"), before.text);
    assert.match(before.html, /aria-label="Can’t make it on Tue 17 Nov"/);

    assert.equal((await cantMake("chloe", "w03")).status, 200);
    const told = await ticketFor("chloe");
    assert.deepEqual(told, { groupId: B, sessionKey: "w03", day: "Tue 17 Nov", told: true });
    const after = w.programmeHome("chloe", { cantMakeIt: told });
    assert.ok(after.text.includes(`${words.TOLD_US} ${words.CAN_MAKE_IT_AFTER_ALL}`), after.text);
  });

  test("to nobody else, and not once the session has started; then about the session after", async () => {
    for (const who of ["rahul", "zach", "claudia", "una", "sam", "nobody"]) assert.equal(await ticketFor(who), null, who);
    at("2026-11-17T18:30:00Z");
    assert.equal(await ticketFor("chloe"), null, "the session has started");
    at("2026-11-17T20:30:00Z");
    assert.deepEqual(await ticketFor("chloe"), { groupId: B, sessionKey: "w04", day: "Tue 24 Nov", told: false });
  });

  test("a line a facilitator has filled in leaves the ticket nothing to offer", async () => {
    await call("rahul", registerRoute.POST, { groupId: B }, { body: { weekNumber: 3, marks: [{ uid: "chloe", status: "present" }] }, course: true });
    assert.equal(await ticketFor("chloe"), null);
  });

  test("the control: one button, then the line and the way back; drawn locked as the member in a view-as session", () => {
    const view = { groupId: B, sessionKey: "w03", day: "Tue 17 Nov", told: false };
    const open = renderToStaticMarkup(createElement(CantMakeIt, { view }));
    assert.match(open, /<button type="button" class="calendarButton" aria-label="Can’t make it on Tue 17 Nov">Can’t make it<\/button>/);
    assert.match(open, /<p class="cantMakeItLine" role="status"><\/p>/, "the live line is there, empty, from the first render");
    const told = renderToStaticMarkup(createElement(CantMakeIt, { view: { ...view, told: true } }));
    assert.equal(textOf(told), `${words.TOLD_US} ${words.CAN_MAKE_IT_AFTER_ALL}`);
    const locked = renderToStaticMarkup(createElement(CantMakeIt, { view, locked: true }));
    assert.match(locked, /<button type="button" class="calendarButton" aria-label="Can’t make it on Tue 17 Nov" disabled="">/);
  });
});

// ---------------------------------------------------------------------------
// 6. The words
// ---------------------------------------------------------------------------

describe("6. the words", () => {
  test("no dash anywhere, and never mark in what the person reads", () => {
    const toThePerson = [
      words.CANT_MAKE_IT,
      words.cantMakeItLabel("Tue 17 Nov"),
      words.TOLD_US,
      words.CAN_MAKE_IT_AFTER_ALL,
      words.SAVING,
      words.savedWords(true),
      words.savedWords(false),
      ...Object.values(words.CANT_MAKE_IT_REFUSAL),
    ];
    for (const line of toThePerson) {
      assert.doesNotMatch(line, /[\u2013\u2014]/, line);
      assert.doesNotMatch(line, /\bmark/i, line);
    }
    for (const line of [words.registerCantMakeItLine("Tue 17 Nov", ["Kofi Asante"]), words.TOLD_IN_ADVANCE]) assert.doesNotMatch(line, /[\u2013\u2014]/, line);
    assert.equal(words.registerCantMakeItLine("Tue 17 Nov", ["Kofi Asante"]), "Tue 17 Nov: Kofi Asante can’t make it.");
    assert.equal(words.registerCantMakeItLine("Tue 17 Nov", ["Kofi Asante", "Sam Okoro"]), "Tue 17 Nov: Kofi Asante and Sam Okoro can’t make it.");
    assert.equal(
      words.registerCantMakeItLine("Tue 17 Nov", ["Ada", "Ben", "Cleo"]),
      "Tue 17 Nov: Ada, Ben and Cleo can’t make it.",
    );
  });
});
