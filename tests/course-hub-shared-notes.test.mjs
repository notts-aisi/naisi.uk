/**
 * The notes a group shares on its week pages (C29, board wk-week-phone's
 * "Notes shared with your group"): who writes one, what a note keeps, who
 * reads which group's notes, who deletes one, what the week page and the
 * programme's Attendance tab draw, what takes the notes away, and a run
 * anyone can join, which keeps the run's comments on each reading instead.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST   /api/courses/groups/[groupId]/shared-notes            one note, from the group's people or facilitators
 *   DELETE /api/courses/groups/[groupId]/shared-notes/[noteId]   one note, by the person who wrote it
 *   sharedNotesReadingOf, sharedNotesForWeekPage,
 *   sharedNotesForAttendance                                     the server's one reader, with its gate
 *   destroyRunCascade, deleteCourseGroupSharedNotes              a run destroyed, an account deleted
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/memberPagesWorld.mjs`
 * on `tests/lib/hubAttendanceWorld.mjs`), on Tue 17 Nov 2026 at noon:
 *  - Group B: Chloe, Farah and Kofi, told by Publish; Rahul and Sofia facilitate.
 *  - Group A: Amara, Dev, Bea and Tariq; Sam, who left on Fri 6 Nov; Sofia facilitates.
 *  - Group C: Hamza, and Una, placed and not told; Tom facilitates.
 *  - Group D: Freya and Yasmin; Grace facilitates.
 *  - Omar was taken off the run by staff. Claudia leads AGI Strategy, Yusuf is
 *    the run's track lead, Lloyd reviews it, Tess leads another programme,
 *    Zach is an admin, Nobody (an account on nothing) is on nothing.
 *
 * Real: both routes, the reader, the week page's server shell, the week page,
 * the notes' own component, the Attendance tab, the run's destroy and the
 * account's sweep, against the in-memory store. Stubbed: the session, the
 * Admin SDK handle, the view-as guard, the mail door, Next's navigation, the
 * stylesheets and the week page's browser data hooks.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { A, C, D, ROUND, AGI, attendanceSeed } from "./lib/hubAttendanceWorld.mjs";
import { B, NOW, RUN, makeMemberPagesWorld, memberSeed, textOf } from "./lib/memberPagesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const w = await makeMemberPagesWorld("__sharedNotes");
const { world, call, courseRoute, loadTs, everything } = w;
const addRoute = await courseRoute("groups", "[groupId]", "shared-notes");
const deleteRoute = await courseRoute("groups", "[groupId]", "shared-notes", "[noteId]");
const readers = await loadTs(join("lib", "courses", "sharedNotes", "readers.ts"));
const words = await loadTs(join("lib", "courses", "sharedNotes", "words.ts"));
const { COURSE_GROUP_SHARED_NOTE_LIMITS, runSharesGroupNotes } = await loadTs(join("lib", "firestore", "courseGroupSharedNotes.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const GroupSharedNotes = (await loadTs(join("features", "courses", "weekly", "GroupSharedNotes.tsx"))).default;

/**
 * The programme's Attendance tab, drawn in a world of its own: its page gate
 * reaches the session through a relative import, which this world stands in
 * for, as the lead's pages suite does. Same seed, same store shape.
 */
const TAB_KEY = "__sharedNotesTab";
globalThis.__sharedNotesTabUi = { h: createElement };
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const stylesheets = () => {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
};
const tab = makeWorld(TAB_KEY, [
  ["./session", `export async function getCurrentUser() { return globalThis[${JSON.stringify(TAB_KEY)}].user; }`],
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useSelectedLayoutSegment() { return 'attendance'; }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children }) => globalThis.__sharedNotesTabUi.h('a', { href, className }, children);",
  ],
  ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
  [
    "@/lib/firebase/client",
    ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
      .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
      .join("\n"),
  ],
  ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
]);
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const AttendancePage = (await tab.loadTs(join(TABS, "attendance", "page.tsx"))).default;

mock.timers.enable({ apis: ["Date"], now: NOW });

const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const notes = () => world.db.paths().filter((path) => path.startsWith("courseGroupSharedNotes/")).sort();
const stored = () => notes().map((path) => world.db.read(path));
const write = (who, groupId, body, options = {}) => call(who, addRoute.POST, { groupId }, { body, course: true, ...options });
const remove = (who, groupId, noteId, options = {}) => call(who, deleteRoute.DELETE, { groupId, noteId }, { course: true, ...options });
const said = (answer) => [answer.status, answer.body?.error ?? null];

/** The run, its live groups and the caller's session, as the pages hand them to the reader. */
function runAndGroups() {
  const run = normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
  const groups = [A, B, C, D].map((id) => normalizeCourseGroup(id, world.db.read(`courseGroups/${id}`)));
  return { run, groups };
}
const session = (who) => w.sessionOf(who);

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. Who writes
// ---------------------------------------------------------------------------

describe("1. who writes a note on Group B", () => {
  test("its people and its facilitators, and nobody else", async () => {
    const answers = {};
    for (const who of ["chloe", "farah", "kofi", "rahul", "sofia", "amara", "hamza", "una", "sam", "omar", "tom", "grace", "claudia", "zach", "yusuf", "lloyd", "tess", "nobody", null]) {
      const answer = await write(who, B, { body: `A note from ${who ?? "nobody"}.`, weekNumber: 3 });
      answers[who ?? "signed out"] = answer.status === 200 ? "wrote" : said(answer).join(" ");
    }
    assert.deepEqual(answers, {
      // The group's people, told by Publish.
      chloe: "wrote",
      farah: "wrote",
      kofi: "wrote",
      // Its facilitator and its co-facilitator.
      rahul: "wrote",
      sofia: "wrote",
      // A member of another group, of a third, and one placed there and not told yet.
      amara: "403 Forbidden",
      hamza: "403 Forbidden",
      una: "403 Forbidden",
      // Somebody who left, and somebody staff took off the run.
      sam: "403 Forbidden",
      omar: "403 Forbidden",
      // Another group's facilitators.
      tom: "403 Forbidden",
      grace: "403 Forbidden",
      // The programme's lead reads the notes and writes none.
      claudia: "403 Forbidden",
      // An admin reads them and writes none, and is told who may.
      zach: `403 ${words.SHARED_NOTE_REFUSAL.notYours}`,
      // The run's track lead, its reviewer, another programme's lead, somebody on nothing.
      yusuf: "403 Forbidden",
      lloyd: "403 Forbidden",
      tess: "403 Forbidden",
      nobody: "403 Forbidden",
      "signed out": "401 Not signed in",
    });
    assert.equal(notes().length, 5, "a refused press wrote a note");
    assert.deepEqual(world.mail, [], "a note emailed somebody");
  });

  test("a facilitator of two groups writes on each, and each note is on its own group", async () => {
    assert.equal((await write("sofia", A, { body: "For Group A.", weekNumber: 3 })).status, 200);
    assert.equal((await write("sofia", B, { body: "For Group B.", weekNumber: 3 })).status, 200);
    assert.deepEqual(
      stored().map((note) => [note.groupId, note.body]).sort(),
      [
        [A, "For Group A."],
        [B, "For Group B."],
      ].sort(),
    );
  });

  test("every refusal writes nothing", async () => {
    const before = everything();
    for (const who of ["amara", "una", "sam", "tom", "claudia", "zach", "yusuf", null]) {
      await write(who, B, { body: "Should not land.", weekNumber: 3 });
    }
    await write("chloe", B, { body: "", weekNumber: 3 });
    await write("chloe", B, { body: "Should not land.", weekNumber: 3 }, { viewAs: true });
    assert.equal(everything(), before);
  });

  test("a view-as session is refused first, even as one of the group's own people", async () => {
    const answer = await write("chloe", B, { body: "Hello.", weekNumber: 3 }, { viewAs: true });
    assert.deepEqual(said(answer), [403, "view-as"]);
    assert.deepEqual(notes(), []);
  });

  test("a group that is not there is the same refusal as one that is not yours; an admin is told it is missing", async () => {
    assert.deepEqual(said(await write("chloe", "no-such-group__grp99999", { body: "x", weekNumber: 3 })), [403, "Forbidden"]);
    assert.deepEqual(said(await write("zach", "no-such-group__grp99999", { body: "x", weekNumber: 3 })), [404, "Group not found"]);
  });

  test("an archived group takes no note, from its people or its facilitators", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    for (const who of ["chloe", "rahul"]) assert.equal((await write(who, B, { body: "Late note.", weekNumber: 3 })).status, 403, who);
    assert.deepEqual(notes(), []);
  });

  test("an account that no longer stands writes nothing, as a member or a facilitator", async () => {
    world.db.poke("users/chloe", { role: "pending" });
    world.db.poke("users/rahul", { role: "rejected" });
    for (const who of ["chloe", "rahul"]) assert.equal((await write(who, B, { body: "Hello.", weekNumber: 3 })).status, 403, who);
    assert.deepEqual(notes(), []);
  });

  test("somebody who left by themselves keeps Publish's stamp, as leaving does, and writes and reads nothing", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__sam`, { allocatedEmailAt: new Date("2026-10-28T18:00:00Z") });
    assert.deepEqual(said(await write("sam", A, { body: "After I left.", weekNumber: 3 })), [403, "Forbidden"]);
    assert.deepEqual(await readingOf("sam"), { all: false, reads: "", writes: "", own: null });
    assert.deepEqual(notes(), []);
  });

  test("a place that is not active writes nothing: a run completed reads, and does not write", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "completed" });
    assert.equal((await write("chloe", B, { body: "After the end.", weekNumber: 3 })).status, 403);
    assert.deepEqual(notes(), []);
  });

  test("a run that is being destroyed takes no note", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.deepEqual(said(await write("chloe", B, { body: "Hello.", weekNumber: 3 })), [404, "Group not found"]);
    assert.deepEqual(notes(), []);
  });

  test("a run anyone can join keeps no notes: even its own people are refused", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { enrolMode: "open" });
    for (const who of ["chloe", "rahul"]) {
      assert.deepEqual(said(await write(who, B, { body: "Hello.", weekNumber: 3 })), [404, "Group not found"], who);
    }
    assert.deepEqual(notes(), []);
  });
});

// ---------------------------------------------------------------------------
// 2. What a note keeps
// ---------------------------------------------------------------------------

describe("2. what a note keeps, and the notes it refuses", () => {
  test("its run, its group, its week, its writer, its words trimmed and its moment; the answer is its id", async () => {
    const answer = await write("chloe", B, {
      body: "  I found the second reading’s argument weaker than it looks.\r\nHappy to say why tonight.  \n",
      weekNumber: 3,
    });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(Object.keys(answer.body).sort(), ["id", "ok"]);
    const note = world.db.read(`courseGroupSharedNotes/${answer.body.id}`);
    assert.deepEqual(
      { ...note, createdAt: note.createdAt.toISOString() },
      {
        runId: RUN.agi,
        groupId: B,
        weekNumber: 3,
        authorUid: "chloe",
        body: "I found the second reading’s argument weaker than it looks.\nHappy to say why tonight.",
        createdAt: NOW.toISOString(),
      },
    );
  });

  test("an empty note is refused in a sentence a person can act on", async () => {
    for (const body of [{ body: "", weekNumber: 3 }, { body: "   \n  ", weekNumber: 3 }, { weekNumber: 3 }]) {
      assert.deepEqual(said(await write("chloe", B, body)), [400, "Write your note in the box first, then save it."], JSON.stringify(body));
    }
    assert.deepEqual(notes(), []);
  });

  test("a note over the limit is refused, saying the limit; one at it is kept", async () => {
    assert.equal(COURSE_GROUP_SHARED_NOTE_LIMITS.body, 1000);
    const over = await write("chloe", B, { body: "x".repeat(1001), weekNumber: 3 });
    assert.deepEqual(said(over), [400, "That note is too long: keep it to 1,000 characters."]);
    assert.equal((await write("chloe", B, { body: "x".repeat(1000), weekNumber: 3 })).status, 200);
  });

  test("the week is one of the group's own weeks", async () => {
    for (const weekNumber of [1, 6]) assert.equal((await write("chloe", B, { body: "Fine.", weekNumber })).status, 200, weekNumber);
    assert.deepEqual(said(await write("chloe", B, { body: "No such week.", weekNumber: 7 })), [400, "That week isn’t one of this programme’s weeks."]);
    for (const weekNumber of [0, -1, 2.5, "3", null, 61]) {
      assert.deepEqual(said(await write("chloe", B, { body: "Hello.", weekNumber })), [400, words.SHARED_NOTE_REFUSAL.body], String(weekNumber));
    }
    assert.equal(notes().length, 2);
  });

  test("a body that is not a note's is refused before anything is read", async () => {
    for (const body of [{ body: 7, weekNumber: 3 }, ["a note"], "a note"]) {
      assert.deepEqual(said(await write("chloe", B, body)), [400, words.SHARED_NOTE_REFUSAL.body], JSON.stringify(body));
    }
    assert.equal((await write(null, B, { body: "", weekNumber: 3 })).status, 401);
    // The body comes before the gate: somebody who may not write here is told about the body first.
    for (const who of ["amara", "claudia", "zach", "tom", "una"]) {
      assert.deepEqual(said(await write(who, B, { body: "   ", weekNumber: 3 })), [400, "Write your note in the box first, then save it."], who);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Who reads which group's notes
// ---------------------------------------------------------------------------

/** What `who` reads and writes on the run, as group letters. */
async function readingOf(who) {
  const { run, groups } = runAndGroups();
  const reading = await readers.sharedNotesReadingOf(world.courseDb, session(who), run, groups);
  const letter = (id) => ({ [A]: "A", [B]: "B", [C]: "C", [D]: "D" })[id];
  return {
    all: reading.all,
    reads: [...reading.reads].map(letter).sort().join(""),
    writes: [...reading.writes].map(letter).sort().join(""),
    own: reading.own ? letter(reading.own) : null,
  };
}

describe("3. who reads which group's notes", () => {
  test("the group's people their own group's, its facilitators each of theirs, the lead and admins every group's; nobody else any", async () => {
    const table = {};
    for (const who of ["chloe", "amara", "hamza", "una", "sam", "omar", "rahul", "sofia", "tom", "claudia", "zach", "yusuf", "lloyd", "tess", "nobody"]) {
      table[who] = await readingOf(who);
    }
    const none = { all: false, reads: "", writes: "", own: null };
    assert.deepEqual(table, {
      chloe: { all: false, reads: "B", writes: "B", own: "B" },
      amara: { all: false, reads: "A", writes: "A", own: "A" },
      hamza: { all: false, reads: "C", writes: "C", own: "C" },
      // Placed and not told: the run reads to her as it did before she was placed.
      una: none,
      // Left, and taken off by staff.
      sam: none,
      omar: none,
      rahul: { all: false, reads: "B", writes: "B", own: null },
      sofia: { all: false, reads: "AB", writes: "AB", own: null },
      tom: { all: false, reads: "C", writes: "C", own: null },
      claudia: { all: true, reads: "", writes: "", own: null },
      zach: { all: true, reads: "", writes: "", own: null },
      // The run's track lead, its reviewer, another programme's lead, somebody on nothing.
      yusuf: none,
      lloyd: none,
      tess: none,
      nobody: none,
    });
  });

  test("a place on a completed run reads its group's notes and writes none", async () => {
    world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "completed" });
    assert.deepEqual(await readingOf("chloe"), { all: false, reads: "B", writes: "", own: "B" });
  });

  test("an archived group is nobody's: not its facilitator's, not its people's", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.deepEqual(await readingOf("chloe"), { all: false, reads: "", writes: "", own: null });
    assert.deepEqual(await readingOf("sofia"), { all: false, reads: "A", writes: "A", own: null });
  });

  test("on a run anyone can join nobody reads any, the lead and admins included", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { enrolMode: "open" });
    for (const who of ["chloe", "rahul", "claudia", "zach"]) {
      assert.deepEqual(await readingOf(who), { all: false, reads: "", writes: "", own: null }, who);
    }
    assert.equal(runSharesGroupNotes({ enrolMode: "open" }), false);
    assert.equal(runSharesGroupNotes({ enrolMode: "admissions" }), true);
  });

  test("a group's notes come back newest first, each with its writer, day and week, and only to a reader of that group", async () => {
    at("2026-11-10T19:30:00Z");
    await write("rahul", B, { body: "Week 2 went well.", weekNumber: 2 });
    at("2026-11-17T09:00:00Z");
    await write("chloe", B, { body: "I found the second reading’s argument weaker than it looks.", weekNumber: 3 });
    await write("amara", A, { body: "Group A's own.", weekNumber: 3 });
    world.db.seed("courseGroupSharedNotes/stray", { runId: "another-run", groupId: B, weekNumber: 3, authorUid: "rahul", body: "Another run's.", createdAt: NOW });
    world.db.seed("courseGroupSharedNotes/blank", { runId: RUN.agi, groupId: B, weekNumber: 3, authorUid: "rahul", body: "   ", createdAt: NOW });
    world.db.seed("courseGroupSharedNotes/noweek", { runId: RUN.agi, groupId: B, authorUid: "rahul", body: "No week.", createdAt: NOW });

    const { run, groups } = runAndGroups();
    const asChloe = await readers.sharedNotesReadingOf(world.courseDb, session("chloe"), run, groups);
    const read = await readers.loadGroupSharedNotes(world.courseDb, session("chloe"), run, B, asChloe);
    assert.deepEqual(
      read.map((note) => [note.byline, note.weekNumber, note.body, note.writerName, note.mine]),
      [
        ["Chloe · Tue 17 Nov", 3, "I found the second reading’s argument weaker than it looks.", "Chloe Nguyen", true],
        ["Rahul · Tue 10 Nov", 2, "Week 2 went well.", "Rahul", false],
      ],
    );
    // Chloe is no reader of Group A's, and nobody of another run's.
    assert.equal(await readers.loadGroupSharedNotes(world.courseDb, session("chloe"), run, A, asChloe), null);
    const asYusuf = await readers.sharedNotesReadingOf(world.courseDb, session("yusuf"), run, groups);
    assert.equal(await readers.loadGroupSharedNotes(world.courseDb, session("yusuf"), run, B, asYusuf), null);
    assert.deepEqual([...(await readers.loadRunSharedNotes(world.courseDb, session("yusuf"), run, asYusuf)).keys()], []);
    // The lead reads every group's, and nothing of anybody's is hers.
    const asClaudia = await readers.sharedNotesReadingOf(world.courseDb, session("claudia"), run, groups);
    const everyGroup = await readers.loadRunSharedNotes(world.courseDb, session("claudia"), run, asClaudia);
    assert.deepEqual([...everyGroup.keys()].sort(), [A, B].sort());
    assert.deepEqual(everyGroup.get(B).map((note) => [note.body, note.mine]), [
      ["I found the second reading’s argument weaker than it looks.", false],
      ["Week 2 went well.", false],
    ]);
  });

  test("every read is one equality on one field, and none is ordered", () => {
    const source = readFileSync(join(SRC, "lib", "courses", "sharedNotes", "readers.ts"), "utf8");
    const queries = [...source.matchAll(/\.where\(([^)]*)\)/g)].map((m) => m[1]);
    assert.deepEqual(queries, ['"groupId", "==", groupId', '"runId", "==", run.id']);
    assert.doesNotMatch(source, /orderBy/);
    assert.match(source, /^import "server-only";/);
  });
});

// ---------------------------------------------------------------------------
// 4. Who deletes a note
// ---------------------------------------------------------------------------

describe("4. who deletes a note", () => {
  test("its writer, and nobody else: not the group's facilitators, not the lead, not an admin", async () => {
    const id = (await write("chloe", B, { body: "Mine.", weekNumber: 3 })).body.id;
    const answers = {};
    for (const who of ["farah", "rahul", "sofia", "amara", "tom", "claudia", "yusuf", "nobody", "zach", null]) {
      answers[who ?? "signed out"] = said(await remove(who, B, id)).join(" ");
    }
    assert.deepEqual(answers, {
      farah: "403 Forbidden",
      rahul: "403 Forbidden",
      sofia: "403 Forbidden",
      amara: "403 Forbidden",
      tom: "403 Forbidden",
      claudia: "403 Forbidden",
      yusuf: "403 Forbidden",
      nobody: "403 Forbidden",
      zach: `403 ${words.SHARED_NOTE_REFUSAL.notYoursToDelete}`,
      "signed out": "401 Not signed in",
    });
    assert.equal(notes().length, 1, "somebody else deleted it");
    assert.deepEqual(said(await remove("chloe", B, id)), [200, null]);
    assert.deepEqual(notes(), []);
  });

  test("a view-as session is refused first, even as its writer", async () => {
    const id = (await write("chloe", B, { body: "Mine.", weekNumber: 3 })).body.id;
    assert.deepEqual(said(await remove("chloe", B, id, { viewAs: true })), [403, "view-as"]);
    assert.equal(notes().length, 1);
  });

  test("a note not there, or not on that group, is one refusal; an admin is told it is missing", async () => {
    const id = (await write("chloe", B, { body: "Mine.", weekNumber: 3 })).body.id;
    assert.deepEqual(said(await remove("chloe", A, id)), [403, "Forbidden"]);
    assert.deepEqual(said(await remove("chloe", B, "no-such-note")), [403, "Forbidden"]);
    assert.deepEqual(said(await remove("zach", B, "no-such-note")), [404, "Note not found"]);
    assert.deepEqual(said(await remove("zach", A, id)), [404, "Note not found"]);
    assert.equal(notes().length, 1);
  });

  test("somebody who has left still deletes what they wrote, and nothing else", async () => {
    world.db.seed("courseGroupSharedNotes/sams", { runId: RUN.agi, groupId: A, weekNumber: 1, authorUid: "sam", body: "Before I left.", createdAt: NOW });
    world.db.seed("courseGroupSharedNotes/amaras", { runId: RUN.agi, groupId: A, weekNumber: 1, authorUid: "amara", body: "Amara's.", createdAt: NOW });
    assert.deepEqual(said(await remove("sam", A, "amaras")), [403, "Forbidden"]);
    assert.deepEqual(said(await remove("sam", A, "sams")), [200, null]);
    assert.deepEqual(notes(), ["courseGroupSharedNotes/amaras"]);
  });

  test("a writer whose account no longer stands deletes nothing", async () => {
    const id = (await write("chloe", B, { body: "Mine.", weekNumber: 3 })).body.id;
    world.db.poke("users/chloe", { role: "rejected" });
    assert.deepEqual(said(await remove("chloe", B, id)), [403, "Forbidden"]);
    assert.equal(notes().length, 1);
  });

  test("deleting emails nobody", async () => {
    const id = (await write("chloe", B, { body: "Mine.", weekNumber: 3 })).body.id;
    await remove("chloe", B, id);
    assert.deepEqual(world.mail, []);
  });
});

// ---------------------------------------------------------------------------
// 5. The week page
// ---------------------------------------------------------------------------

/** The week page's server shell for `who`, then the page itself drawn with what the shell handed it. */
async function weekAs(who, n = 3) {
  const shell = await w.weekShell(who, n);
  if (shell.component !== "WeekView") return { shell, text: "", html: "" };
  await w.asBrowser(who);
  const html = renderToStaticMarkup(createElement(w.components.WeekView, shell.props));
  return { shell, html, text: textOf(html) };
}

describe("5. the week page draws the group's notes in place of the run's comments", () => {
  test("Chloe: her group's notes as the board draws them, Add a note, and who sees them", async () => {
    at("2026-11-17T09:00:00Z");
    await write("chloe", B, { body: "I found the second reading’s argument weaker than it looks. Happy to say why tonight.", weekNumber: 3 });
    at(NOW.toISOString());
    const { shell, text, html } = await weekAs("chloe");
    assert.deepEqual(
      shell.props.sharedNotes.sections.map((section) => [section.heading, section.whoLine, section.canWrite, section.notes.length]),
      [["Notes shared with your group", "Everyone in Group B, your facilitators, Claudia and admins can see these.", true, 1]],
    );
    assert.ok(
      text.includes(
        "Notes shared with your group CN Chloe · Tue 17 Nov Delete Week 3: I found the second reading’s argument weaker than it looks. " +
          "Happy to say why tonight. Add a note Everyone in Group B, your facilitators, Claudia and admins can see these.",
      ),
      text,
    );
    // After the exercise, before the way on.
    assert.ok(text.indexOf("Exercise") < text.indexOf("Notes shared with your group"), "the notes come before the exercise");
    assert.ok(text.indexOf("Notes shared with your group") < text.indexOf("Week 2"), "the notes come after the way on");
    // No notes under a reading, and no box whose words the whole run would read.
    assert.doesNotMatch(text, /Cohort notes/);
    assert.doesNotMatch(html, /Visible to everyone on this run/);
    // A screen reader is told what Delete deletes.
    assert.match(html, /aria-label="Delete your note from Tue 17 Nov"/);
  });

  test("a note somebody else wrote offers no Delete; a reader with nothing to say is told so", async () => {
    await write("rahul", B, { body: "Room change this week.", weekNumber: 3 });
    const { text } = await weekAs("chloe");
    assert.ok(text.includes("R Rahul · Tue 17 Nov Week 3: Room change this week."), text);
    assert.doesNotMatch(text, /Delete/);
    w.reset();
    assert.ok((await weekAs("chloe")).text.includes("Notes shared with your group No notes yet. Add a note"));
  });

  test("Sofia facilitates two groups: a section for each, named, each with its own group's notes only", async () => {
    await write("amara", A, { body: "From Group A.", weekNumber: 3 });
    await write("chloe", B, { body: "From Group B.", weekNumber: 3 });
    const { shell, text } = await weekAs("sofia");
    assert.deepEqual(
      shell.props.sharedNotes.sections.map((section) => [section.heading, section.whoLine, section.notes.map((note) => note.body)]),
      [
        ["Notes shared with Group A", "Everyone in Group A, its facilitators, Claudia and admins can see these.", ["From Group A."]],
        ["Notes shared with Group B", "Everyone in Group B, its facilitators, Claudia and admins can see these.", ["From Group B."]],
      ],
    );
    assert.ok(text.includes("Notes shared with Group A AO Amara · Tue 17 Nov Week 3: From Group A. Add a note"), text);
    assert.ok(text.includes("Notes shared with Group B CN Chloe · Tue 17 Nov Week 3: From Group B. Add a note"), text);
  });

  test("an admin on the week page is handed no group's notes: the lead and admins read them on Attendance", async () => {
    await write("chloe", B, { body: "From Group B.", weekNumber: 3 });
    const { shell, text } = await weekAs("zach");
    assert.deepEqual(shell.props.sharedNotes, { sections: [] });
    assert.doesNotMatch(text, /Notes shared with|From Group B|Cohort notes/);
  });

  test("nobody reaches a week page who reads no group's notes there: the lead, the track lead, Una, Sam, Omar", async () => {
    for (const who of ["claudia", "yusuf", "una", "sam", "omar"]) {
      const { shell } = await weekAs(who);
      assert.notEqual(shell.component, "WeekView", who);
    }
  });

  test("a completed place reads its group's notes with no box to add one", async () => {
    await write("rahul", B, { body: "Thanks, all.", weekNumber: 6 });
    world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "completed" });
    const { shell, text } = await weekAs("chloe");
    assert.equal(shell.props.sharedNotes.sections[0].canWrite, false);
    assert.ok(text.includes("Week 6: Thanks, all."), text);
    assert.doesNotMatch(text, /Add a note/);
  });

  test("a run anyone can join keeps its comments on each reading exactly as before", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { enrolMode: "open" });
    const { shell, text } = await weekAs("chloe");
    assert.equal(shell.props.sharedNotes, null);
    assert.doesNotMatch(text, /Notes shared with/);
    assert.equal((text.match(/Cohort notes/g) ?? []).length, 3, "one under each of the week's three readings");
    // The box for a comment the whole run reads is still there once a reading is ticked.
    w.ui.progress = new Map([["w3r1", { id: `${RUN.agi}__chloe__w3r1`, completed: true, itemId: "w3r1" }]]);
    const ticked = renderToStaticMarkup(createElement(w.components.WeekView, shell.props));
    assert.match(ticked, /Add a reflection/);
    assert.match(ticked, /Visible to everyone on this run/);
    assert.equal((textOf(ticked).match(/Cohort notes/g) ?? []).length, 3);
  });

  test("a run with no live group keeps its comments on each reading too", async () => {
    for (const id of [A, B, C, D]) world.db.poke(`courseGroups/${id}`, { archived: true });
    const { shell, text } = await weekAs("zach");
    assert.equal(shell.props.sharedNotes, null);
    assert.equal((text.match(/Cohort notes/g) ?? []).length, 3);
  });

  test("on a run with groups a reading's reflection keeps its rating and private note, without the run's comment box", async () => {
    const { shell } = await weekAs("chloe");
    await w.asBrowser("chloe");
    w.ui.progress = new Map([["w3r1", { id: `${RUN.agi}__chloe__w3r1`, completed: true, itemId: "w3r1", rating: 4, publicComment: "Written before.", privateNote: "Mine." }]]);
    const html = renderToStaticMarkup(createElement(w.components.WeekView, shell.props));
    assert.match(html, /Edit your reflection/);
    // The rating and the private note, exactly as they were.
    assert.match(html, /How useful was this\?/);
    assert.match(html, /Private note<span[^>]*> · Only facilitators and admins see this<\/span>/);
    assert.doesNotMatch(html, /Cohort notes/);
    assert.doesNotMatch(html, /Visible to everyone on this run/);
  });
});

// ---------------------------------------------------------------------------
// 6. The notes' own component, and the Attendance tab
// ---------------------------------------------------------------------------

/** One note as the reader hands it on. */
function view(over = {}) {
  return {
    id: "n1",
    groupId: B,
    weekNumber: 3,
    writerUid: "chloe",
    writerName: "Chloe Nguyen",
    writerFirstName: "Chloe",
    dateKey: "2026-11-17",
    byline: "Chloe · Tue 17 Nov",
    body: "Line one.\nLine two, <b>not markup</b>.",
    mine: false,
    ...over,
  };
}
const drawSection = (section, weekNumber = 3) =>
  renderToStaticMarkup(createElement(GroupSharedNotes, { section, weekNumber }));

describe("6. the notes' own component, and the programme's Attendance tab", () => {
  test("a note's words are text, with their line breaks, never markup", () => {
    const html = drawSection({ groupId: B, heading: "Notes shared with your group", whoLine: "Who.", canWrite: false, notes: [view()] });
    assert.match(html, /Week 3: Line one.\nLine two, &lt;b&gt;not markup&lt;\/b&gt;./);
    assert.doesNotMatch(html, /<b>not markup<\/b>/);
  });

  test("Add a note only for a reader who may write, and only on a week's page", () => {
    const section = { groupId: B, heading: "Notes shared with your group", whoLine: "Who.", canWrite: true, notes: [] };
    assert.match(drawSection(section), /Add a note/);
    assert.doesNotMatch(drawSection({ ...section, canWrite: false }), /Add a note/);
    assert.doesNotMatch(drawSection(section, null), /Add a note/);
  });

  test("Delete only on the reader's own notes", () => {
    const html = drawSection({
      groupId: B,
      heading: "Notes shared with your group",
      whoLine: "Who.",
      canWrite: true,
      notes: [view({ id: "mine", mine: true }), view({ id: "theirs", writerUid: "farah", writerName: "Farah Hussain", writerFirstName: "Farah", mine: false })],
    });
    assert.equal((html.match(/>Delete</g) ?? []).length, 1);
  });

  /** The tab as `who` sees it, over the main world's notes. */
  async function attendanceAs(who) {
    tab.reset(memberSeed(), { now: () => new Date() });
    for (const uid of ["claudia", "lloyd", "tess"]) tab.world.db.poke(`users/${uid}`, { admissionsReviewer: true });
    for (const path of notes()) tab.world.db.seed(path, world.db.read(path));
    tab.world.user = { ...tab.sessionOf(who), admissionsReviewer: tab.world.db.read(`users/${who}`)?.admissionsReviewer === true };
    const element = await AttendancePage({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) });
    return textOf(renderToStaticMarkup(element));
  }

  test("the lead reads every group's notes under the grid, named, with herself in the sentence and no way to add one", async () => {
    await write("chloe", B, { body: "From Group B.", weekNumber: 3 });
    await write("amara", A, { body: "From Group A.", weekNumber: 2 });
    const text = await attendanceAs("claudia");
    assert.ok(
      text.includes("Notes shared with Group A AO Amara · Tue 17 Nov Week 2: From Group A. Everyone in Group A, its facilitators, you and admins can see these."),
      text,
    );
    assert.ok(
      text.includes("Notes shared with Group B CN Chloe · Tue 17 Nov Week 3: From Group B. Everyone in Group B, its facilitators, you and admins can see these."),
      text,
    );
    assert.doesNotMatch(text, /Add a note|Delete/);
    // A group with no notes has no card.
    assert.doesNotMatch(text, /Notes shared with Group C|Notes shared with Group D/);
  });

  test("the sections the tab is handed offer the lead and an admin no way to add a note", async () => {
    await write("chloe", B, { body: "From Group B.", weekNumber: 3 });
    const { run, groups } = runAndGroups();
    for (const who of ["claudia", "zach"]) {
      const sections = await readers.sharedNotesForAttendance(world.courseDb, session(who), run, groups, "Claudia");
      assert.deepEqual(sections.map((section) => [section.groupId, section.canWrite]), [[B, false]], who);
    }
    // Anybody else is handed nothing at all.
    for (const who of ["chloe", "rahul", "yusuf"]) {
      assert.deepEqual(await readers.sharedNotesForAttendance(world.courseDb, session(who), run, groups, "Claudia"), [], who);
    }
  });

  test("an admin reads them there too, with the lead named", async () => {
    await write("chloe", B, { body: "From Group B.", weekNumber: 3 });
    const text = await attendanceAs("zach");
    assert.ok(text.includes("Notes shared with Group B CN Chloe · Tue 17 Nov Week 3: From Group B. Everyone in Group B, its facilitators, Claudia and admins can see these."), text);
  });
});

// ---------------------------------------------------------------------------
// 7. What takes the notes away
// ---------------------------------------------------------------------------

// The account's sweep imports `FieldPath` beside `FieldValue`.
const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);
const gone = makeWorld("__sharedNotesGone", [["firebase-admin/firestore", FIRESTORE]]);
const goneAdd = await gone.courseRoute("groups", "[groupId]", "shared-notes");
const accountDeletion = await gone.loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await gone.loadTs(join("lib", "firestore", "courseDeletion.ts"));
const goneRun = await gone.loadTs(join("lib", "firestore", "courses.ts"));
const goneNotes = () => gone.world.db.paths().filter((path) => path.startsWith("courseGroupSharedNotes/")).sort();

/** The store, with `count()` on every query it hands out, answered by counting what the query returns. */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("7. what takes the notes away", () => {
  beforeEach(async () => {
    gone.reset(attendanceSeed(), { now: () => new Date() });
    const add = (who, groupId, body) => gone.call(who, goneAdd.POST, { groupId }, { body: { body, weekNumber: 3 }, course: true });
    assert.equal((await add("chloe", B, "Chloe's on B.")).status, 200);
    assert.equal((await add("rahul", B, "Rahul's on B.")).status, 200);
    assert.equal((await add("sofia", A, "Sofia's on A.")).status, 200);
    assert.equal((await add("sofia", B, "Sofia's on B.")).status, 200);
    // Another run's note, which nothing here may touch.
    gone.world.db.seed("courseGroupSharedNotes/elsewhere", { runId: "another-run", groupId: "another-group", weekNumber: 1, authorUid: "sofia", body: "Elsewhere.", createdAt: NOW });
  });

  test("destroying the run counts its groups' notes, deletes every one, and no other run's", async () => {
    gone.world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(gone.world.courseDb);
    const run = goneRun.normalizeCourseRun(RUN.agi, gone.world.db.read(`courseRuns/${RUN.agi}`));
    const counts = await courseDeletion.countRunDestroyTargets(db, run);
    assert.equal(counts.groupSharedNotes, 4);
    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.groupSharedNotes, 4);
    assert.deepEqual(goneNotes(), ["courseGroupSharedNotes/elsewhere"]);
  });

  test("the notes drain with the run's leaves, before the groups they are shared with, and the dialog names them", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.indexOf("groupSharedNotes") > -1 && order.indexOf("groupSharedNotes") < order.indexOf("groups"));
    assert.match(table, /COURSE_GROUP_SHARED_NOTES_COLLECTION,\s*byRunId\(COURSE_GROUP_SHARED_NOTES_COLLECTION\),\s*budget,/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /groupSharedNotes: \{\s*label: "Notes shared with each group",\s*fate: "destroyed",/);
  });

  test("deleting the writer's account deletes every note they wrote, on every run, and nobody else's", async () => {
    assert.equal(await accountDeletion.deleteCourseGroupSharedNotes(gone.world.courseDb, "sofia"), 3);
    assert.deepEqual(
      goneNotes().map((path) => gone.world.db.read(path)).map((note) => [note.authorUid, note.body]).sort(),
      [
        ["chloe", "Chloe's on B."],
        ["rahul", "Rahul's on B."],
      ],
    );
    assert.equal(await accountDeletion.deleteCourseGroupSharedNotes(gone.world.courseDb, "farah"), 0);
  });

  test("the account's cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*courseGroupSharedNotesDeleted: number;/m);
    assert.match(source, /^\s*courseGroupSharedNotesDeleted: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.courseGroupSharedNotesDeleted = await deleteCourseGroupSharedNotes\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
    assert.match(source, /deleteOwnedCourseRows\(db, COURSE_GROUP_SHARED_NOTES_COLLECTION, uid, "authorUid"\)/);
  });
});

// ---------------------------------------------------------------------------
// 8. Every file that addresses the notes, and every caller of their reader
// ---------------------------------------------------------------------------

/**
 * THE TREE. A note is read only on the server, through the one reader, by a
 * page that has asked it who the reader is; written only by the add route;
 * deleted only by the delete route and the two cascades. So every file under
 * `src` that addresses `courseGroupSharedNotes` is listed here with what it
 * does, and every caller of the reader's page functions is one of the two
 * pages. A new file fails this section until somebody decides what it is.
 */
const ADDRESSERS = {
  "lib/firestore/courseGroupSharedNotes.ts": "the record: its shape, its limit, its normaliser and the run's one question",
  "lib/courses/sharedNotes/readers.ts": "the one reader, server-only, with its gate",
  "app/api/courses/groups/[groupId]/shared-notes/route.ts": "the one writer: the group's people and its facilitators",
  "app/api/courses/groups/[groupId]/shared-notes/[noteId]/route.ts": "deletes a note for the person who wrote it",
  "lib/firestore/courseDeletion.ts": "destroying the run counts the notes and drains them",
  "lib/firestore/accountDeletion.ts": "deleting an account deletes the notes it wrote",
};
const READER_CALLERS = {
  "app/(app)/learn/[runId]/weeks/[n]/page.tsx": "the week page's server shell: the reader's own groups",
  "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance/page.tsx":
    "the programme's Attendance tab: its lead and admins",
};
const inSrc = (path) => relative(SRC, path).split(sep).join("/");

describe("8. every file that addresses the notes, and every caller of their reader, is listed", () => {
  const files = [...walkSource(SRC)].map((path) => [inSrc(path), readFileSync(path, "utf8")]);
  assert.ok(files.length > 500, `the walk found only ${files.length} files: it is not reading the tree`);

  test("the files that address courseGroupSharedNotes are the record, the reader, the two routes and the two deletions", () => {
    const addressing = files
      .filter(([, code]) => /COURSE_GROUP_SHARED_NOTES_COLLECTION|["'`]courseGroupSharedNotes["'`]/.test(code))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(addressing, Object.keys(ADDRESSERS).sort());
  });

  test("the reader is called by the two pages and nothing else, and no client file reaches it", () => {
    const callers = files
      .filter(([file, code]) => file !== "lib/courses/sharedNotes/readers.ts" && /\b(?:sharedNotesForWeekPage|sharedNotesForAttendance|sharedNotesReadingOf|loadGroupSharedNotes|loadRunSharedNotes)\s*\(/.test(code))
      .map(([file]) => file)
      .sort();
    // The add route asks the reader's write gate, and nothing that reads.
    assert.deepEqual(callers, Object.keys(READER_CALLERS).sort());
    for (const [file, code] of files) {
      if (!/^\s*["']use client["'];?/.test(code)) continue;
      assert.doesNotMatch(code, /from "@\/lib\/courses\/sharedNotes\/readers"/, `${file} is a client file and imports the reader`);
    }
  });

  test("one route writes a note and one deletes one; nothing hands a note to a browser", () => {
    for (const [file, code] of files) {
      if (!(file in ADDRESSERS)) continue;
      const writes = /COURSE_GROUP_SHARED_NOTES_COLLECTION\)\.doc\(\);|\.collection\(COURSE_GROUP_SHARED_NOTES_COLLECTION\)[^;]*\.(?:set|update|add|create)\(/.test(code);
      assert.equal(writes, file === "app/api/courses/groups/[groupId]/shared-notes/route.ts", `${file}: ${writes ? "writes a note" : "writes none"}`);
    }
    for (const file of Object.keys(ADDRESSERS).filter((path) => path.startsWith("app/api/"))) {
      assert.doesNotMatch(files.find(([path]) => path === file)[1], /export (async )?function GET/, `${file} has a GET`);
    }
  });
});
