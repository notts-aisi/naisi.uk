/**
 * The notes a group's facilitators share (C30, board wk-fac-group's "Notes
 * for you and Sofia"): who writes one, what a note keeps, who is refused,
 * how the server reads them back, and what takes them away.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/notes      one note, from one of the group's facilitators
 *   readGroupNotes / readRunGroupNotes             the server's one reader
 *   destroyRunCascade, deleteCourseGroupNotes      a run that is destroyed, an account that is deleted
 *
 * ## What this guards
 *
 *  1. WHO WRITES. A live facilitator of the group, and nobody else: not the
 *     programme's lead, not an admin, not another group's facilitator, not a
 *     member of the group or of another group, not somebody signed out, not
 *     a view-as session. Every refusal writes nothing and sends nothing.
 *  2. WHAT A NOTE KEEPS. Its run, its group, its writer and its words,
 *     trimmed, with its day. An empty note, or one over the limit, is
 *     refused in a sentence a person can act on.
 *  3. THE READER. A group's notes newest first, each with its writer's
 *     names and day, never another group's or another run's.
 *  4. WHAT TAKES THEM AWAY. Destroying the run deletes every note of its
 *     groups and counts them first; deleting the writer's account deletes
 *     every note they wrote, and nobody else's.
 *
 * Real: the notes route, the reader, the run's destroy and the account's
 * sweep, against the in-memory store. Stubbed: the session, the Admin SDK
 * handle, the view-as guard and the mail door.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { A, B, C, NOW, RUN, attendanceSeed } from "./lib/hubAttendanceWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

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
const made = makeWorld("__groupNotes", [["firebase-admin/firestore", FIRESTORE]]);
const { world, reset, call, everything, courseRoute, loadTs } = made;
const notesRoute = await courseRoute("groups", "[groupId]", "notes");
const readers = await loadTs(join("lib", "courses", "groupNotes", "readers.ts"));
const words = await loadTs(join("lib", "courses", "facilitatorPageWords.ts"));
const accountDeletion = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
const { COURSE_GROUP_NOTE_LIMITS } = await loadTs(join("lib", "firestore", "courseGroupNotes.ts"));

mock.timers.enable({ apis: ["Date"], now: NOW });

const notes = () => world.db.paths().filter((path) => path.startsWith("courseGroupNotes/")).sort();
const write = (who, groupId, body, options = {}) => call(who, notesRoute.POST, { groupId }, { body, course: true, ...options });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(attendanceSeed(), { now: () => new Date() });
});

// ---------------------------------------------------------------------------
// 1. Who writes
// ---------------------------------------------------------------------------

describe("1. who writes a note on Group B", () => {
  test("its facilitator and its co-facilitator, and nobody else", async () => {
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "chloe", "amara", "nobody", null]) {
      const answer = await write(who, B, { body: `A note from ${who ?? "nobody signed in"}.` });
      said[who ?? "signed out"] = answer.status === 200 ? "wrote" : `${answer.status} ${answer.body.error}`;
    }
    assert.deepEqual(said, {
      rahul: "wrote",
      sofia: "wrote",
      // An admin reads the group's notes and writes none: told so in words.
      zach: `403 ${words.NOTE_REFUSAL.notYours}`,
      // The programme's lead reads them and writes none.
      claudia: "403 Forbidden",
      tess: "403 Forbidden",
      lloyd: "403 Forbidden",
      yusuf: "403 Forbidden",
      // Another group's facilitator, a member of the group, a member of another group.
      tom: "403 Forbidden",
      chloe: "403 Forbidden",
      amara: "403 Forbidden",
      nobody: "403 Forbidden",
      "signed out": "401 Not signed in",
    });
    assert.equal(notes().length, 2, "a refused press wrote a note");
    assert.deepEqual(world.mail, [], "a note emailed somebody");
  });

  test("every refusal writes nothing", async () => {
    const before = everything();
    for (const who of ["zach", "claudia", "tom", "chloe", null]) await write(who, B, { body: "Should not land." });
    await write("rahul", B, { body: "" });
    await write("rahul", B, { body: "Should not land." }, { viewAs: true });
    assert.equal(everything(), before);
  });

  test("a view-as session is refused first, even as the group's own facilitator", async () => {
    const answer = await write("rahul", B, { body: "Hello." }, { viewAs: true });
    assert.equal(answer.status, 403);
    assert.equal(answer.body.error, "view-as");
    assert.deepEqual(notes(), []);
  });

  test("a group that is not there is the same refusal as one that is not yours; an admin is told it is missing", async () => {
    assert.deepEqual([(await write("rahul", "no-such-group__grp99999", { body: "x" })).status], [403]);
    const asAdmin = await write("zach", "no-such-group__grp99999", { body: "x" });
    assert.deepEqual([asAdmin.status, asAdmin.body.error], [404, "Group not found"]);
  });

  test("an archived group's facilitator writes nothing on it", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await write("rahul", B, { body: "Late note." })).status, 403);
    assert.deepEqual(notes(), []);
  });

  test("a facilitator who no longer stands behind the role writes nothing", async () => {
    world.db.poke("users/rahul", { role: "pending" });
    assert.equal((await write("rahul", B, { body: "Hello." })).status, 403);
    assert.deepEqual(notes(), []);
  });

  test("a facilitator of one group writes on that group only", async () => {
    assert.equal((await write("tom", C, { body: "Group C went well." })).status, 200);
    assert.equal((await write("tom", B, { body: "Not my group." })).status, 403);
    assert.equal((await write("sofia", A, { body: "Group A went well." })).status, 200);
  });

  test("a run that is being destroyed takes no note", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal((await write("rahul", B, { body: "Hello." })).status, 404);
    assert.deepEqual(notes(), []);
  });
});

// ---------------------------------------------------------------------------
// 2. What a note keeps
// ---------------------------------------------------------------------------

describe("2. what a note keeps, and the notes it refuses", () => {
  test("its run, its group, its writer, its words trimmed and its moment", async () => {
    const answer = await write("sofia", B, { body: "  Chloe and Isaac carried week 2.\r\nTry smaller pairs for the first 20 minutes.  \n" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(Object.keys(answer.body).sort(), ["id", "ok"]);
    const stored = world.db.read(`courseGroupNotes/${answer.body.id}`);
    assert.deepEqual(
      { ...stored, createdAt: stored.createdAt.toISOString() },
      {
        runId: RUN.agi,
        groupId: B,
        authorUid: "sofia",
        body: "Chloe and Isaac carried week 2.\nTry smaller pairs for the first 20 minutes.",
        createdAt: NOW.toISOString(),
      },
    );
  });

  test("an empty note is refused in a sentence a person can act on", async () => {
    for (const body of [{ body: "" }, { body: "   \n  " }, {}]) {
      const answer = await write("rahul", B, body);
      assert.deepEqual([answer.status, answer.body.error], [400, "Write your note in the box first, then save it."], JSON.stringify(body));
    }
    assert.deepEqual(notes(), []);
  });

  test("a note over the limit is refused, saying the limit; one at it is kept", async () => {
    const over = await write("rahul", B, { body: "x".repeat(COURSE_GROUP_NOTE_LIMITS.body + 1) });
    assert.deepEqual([over.status, over.body.error], [400, "That note is too long: keep it to 2,000 characters."]);
    assert.equal((await write("rahul", B, { body: "x".repeat(COURSE_GROUP_NOTE_LIMITS.body) })).status, 200);
  });

  test("a body that is not a note's is refused before anything is read", async () => {
    for (const body of [{ body: 7 }, ["a note"], "a note"]) {
      const answer = await write("rahul", B, body);
      assert.equal(answer.status, 400, JSON.stringify(body));
      assert.equal(answer.body.error, words.NOTE_REFUSAL.body);
    }
    // Nobody signed in is told so before their body is read.
    assert.equal((await write(null, B, { body: "" })).status, 401);
  });
});

// ---------------------------------------------------------------------------
// 3. The reader
// ---------------------------------------------------------------------------

describe("3. the server's reader", () => {
  test("a group's notes, newest first, each with its writer and day, and no other group's or run's", async () => {
    mock.timers.setTime(new Date("2026-11-11T19:30:00Z").getTime());
    await write("sofia", B, { body: "Chloe and Isaac carried week 2." });
    mock.timers.setTime(new Date("2026-11-16T09:00:00Z").getTime());
    await write("rahul", B, { body: "Room change this week." });
    await write("sofia", A, { body: "Group A's note." });
    world.db.seed("courseGroupNotes/stray", { runId: "another-run", groupId: B, authorUid: "rahul", body: "Another run's.", createdAt: NOW });
    world.db.seed("courseGroupNotes/blank", { runId: RUN.agi, groupId: B, authorUid: "rahul", body: "   ", createdAt: NOW });

    const read = await readers.readGroupNotes(world.courseDb, { id: B, runId: RUN.agi });
    assert.deepEqual(
      read.map((note) => [note.writerFirstName, note.writerName, note.byline, note.body]),
      [
        ["Rahul", "Rahul Mehta", "Rahul · Mon 16 Nov", "Room change this week."],
        ["Sofia", "Sofia Rossi", "Sofia · Wed 11 Nov", "Chloe and Isaac carried week 2."],
      ],
    );

    const byGroup = await readers.readRunGroupNotes(world.courseDb, RUN.agi);
    assert.deepEqual([...byGroup.keys()].sort(), [A, B].sort());
    assert.deepEqual(byGroup.get(B).map((note) => note.body), ["Room change this week.", "Chloe and Isaac carried week 2."]);
    assert.deepEqual(byGroup.get(A).map((note) => note.body), ["Group A's note."]);
  });

  test("every read is one equality on one field", () => {
    const source = readFileSync(join(SRC, "lib", "courses", "groupNotes", "readers.ts"), "utf8");
    const queries = [...source.matchAll(/\.where\(([^)]*)\)/g)].map((m) => m[1]);
    assert.deepEqual(queries, ['"groupId", "==", group.id', '"runId", "==", runId']);
    assert.doesNotMatch(source, /orderBy/);
  });

  test("nothing hands a note to a browser: no GET on the route, and no client file imports the reader", () => {
    const route = readFileSync(join(SRC, "app", "api", "courses", "groups", "[groupId]", "notes", "route.ts"), "utf8");
    assert.doesNotMatch(route, /export (async )?function GET/);
    assert.match(readFileSync(join(SRC, "lib", "courses", "groupNotes", "readers.ts"), "utf8"), /^import "server-only";/);
  });
});

// ---------------------------------------------------------------------------
// 4. What takes them away
// ---------------------------------------------------------------------------

/**
 * The store, with `count()` on every query it hands out, answered by counting
 * what the query returns. Everything else is the store's own.
 */
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

describe("4. what takes the notes away", () => {
  beforeEach(async () => {
    await write("rahul", B, { body: "Rahul's note on B." });
    await write("sofia", B, { body: "Sofia's note on B." });
    await write("sofia", A, { body: "Sofia's note on A." });
    // Another run's note, which no cascade here may touch.
    world.db.seed("courseGroupNotes/elsewhere", { runId: "another-run", groupId: "another-group", authorUid: "sofia", body: "Elsewhere.", createdAt: NOW });
  });

  test("destroying the run counts its groups' notes, deletes every one, and no other run's", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`)));
    assert.equal(counts.groupNotes, 3);
    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.groupNotes, 3);
    assert.deepEqual(notes(), ["courseGroupNotes/elsewhere"]);
  });

  test("the notes drain with the run's leaves, before the groups they are about, and the dialog names them", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.indexOf("groupNotes") > -1 && order.indexOf("groupNotes") < order.indexOf("groups"));
    assert.match(table, /drainQuery\(db, COURSE_GROUP_NOTES_COLLECTION, byRunId\(COURSE_GROUP_NOTES_COLLECTION\), budget\)/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /groupNotes: \{\s*label: "Facilitators' notes on their groups",\s*fate: "destroyed",/);
  });

  test("deleting the writer's account deletes every note they wrote, on every run, and nobody else's", async () => {
    assert.equal(await accountDeletion.deleteCourseGroupNotes(world.courseDb, "sofia"), 3);
    const left = notes().map((path) => world.db.read(path));
    assert.deepEqual(left.map((note) => [note.authorUid, note.body]), [["rahul", "Rahul's note on B."]]);
    assert.equal(await accountDeletion.deleteCourseGroupNotes(world.courseDb, "chloe"), 0);
  });

  test("the account's cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*courseGroupNotesDeleted: number;/m);
    assert.match(source, /^\s*courseGroupNotesDeleted: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.courseGroupNotesDeleted = await deleteCourseGroupNotes\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
    assert.match(source, /deleteOwnedCourseRows\(db, COURSE_GROUP_NOTES_COLLECTION, uid, "authorUid"\)/);
  });
});
