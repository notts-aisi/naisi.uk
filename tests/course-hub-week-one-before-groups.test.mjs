/**
 * Week 1 before groups go out (Q35 B): somebody holding a place may open week
 * 1 of the run their programme names once it is marked ready, and nothing
 * else of the run, until Publish tells them their group.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE DOOR, ONE FUNCTION (`weekOneDoorFor`), asked of everybody the brief
 *     names: somebody holding a place before the hand-over (by the form's
 *     outcome), after it and before placement, placed and not told, and told;
 *     week 1 not ready; somebody who gave the place back; somebody who left;
 *     the lead; a facilitator; an admin; no offer; an invitation not
 *     answered; a place on another programme; an account that does not
 *     stand; a view-as session.
 *  2. THE GATE (`getRunAccess`) carries the door's answer for anybody with no
 *     other way in, and never beside `canLearn`.
 *  3. THE OVERVIEW answers them week 1 and nothing else: no group, no
 *     session, no schedule, no other week, no due day, and st-week1-phone's
 *     line from the run's planned day (for an incubator's place, a line that
 *     names no group: its people are told of none).
 *  4. THEIR DOORS: ticks through week 1's door write their own row, in the
 *     shape the browser writes, and only for week 1's own items; reflections
 *     in week 1's boxes, never week 2's; their own rows read back for week 1
 *     only. Each refuses everybody the door does not open to, and nothing is
 *     written.
 *  5. WEEK 2 IS REFUSED TO ALL OF THEM before Publish, and everything else the
 *     member's pages call still answers as it did before they were placed.
 *  6. THE PAGES: the layout lets them in, the week page draws week 1 for them
 *     and sends every other week to week 1, the run's home and its progress
 *     page send them away.
 *  8. A REFUSAL REACHES THE PAGE IN THE ROUTE'S OWN WORDS: somebody who gave
 *     their place back with week 1 open in a tab ticks, or writes in a box,
 *     and the page's own client code (the tick hook and the box's write),
 *     answered by the real routes, says the route's sentence, never "check
 *     your connection"; only a request that got no answer names the
 *     connection, and a tick the browser writes itself and the rules refuse
 *     says to reload the page.
 *
 * Real: every route and page loaded, the door, the gate and the libraries
 * under them, the store. Faked: the session, the Admin SDK handle, the
 * view-as guard and marker, `next/navigation`, `next/link`, the client
 * components the pages hand their props to (each records what it was
 * handed), and the clock (before the run's first session).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { GROUP, RUN, groupSeed, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";
import { AGI, ROUND, applicationPath } from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import { makeWeekBlocksPageWorld, weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

/** Sat 24 Oct 2026, 1pm in London: decisions are out, and nobody has met. */
const NOW = new Date("2026-10-24T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const made = await makeGroupWorld("__weekOneBeforeGroups");
const { world, loadTs, reset, call, steps, ask, enrolmentPath } = made;

const route = (...parts) => loadTs(join("app", "api", "courses", "runs", "[runId]", ...parts, "route.ts"));
// Every tick goes through the one tick route, which asks week 1's door for a holder.
const ticksRoute = await route("ticks", "[itemId]");
const reflectionRoute = await route("reflections", "[promptId]");
const myExercisesRoute = await route("my-exercises");
const overviewRoute = await route("overview");
const { weekOneDoorFor } = await loadTs(join("lib", "courses", "weekOne", "door.ts"));
const markdownWrite = await loadTs(join("lib", "courses", "weekBlocks", "markdownWrite.ts"));
const paste = await loadTs(join("lib", "courses", "weekBlocks", "paste.ts"));

const W01 = `courseRuns/${RUN.agi}/weeks/w01`;
const W02 = `courseRuns/${RUN.agi}/weeks/w02`;

/** A week written as blocks, as the loader stores one after a paste: ids kept, This week's covers worked out. */
function pastedWeek(n, title, k) {
  const blocks = weekOneBlocks(k, "Before session 1, if you can");
  const markdown = markdownWrite.weekToMarkdown({ weekNumber: n, title, blocks });
  const read = paste.readPastedWeek({ markdown, weekNumber: n, stored: blocks, dayBeforeTime: null });
  if (read.problems.length > 0 || read.minted > 0) throw new Error(`week ${n} does not paste back: ${read.problems.join(" ")}`);
  return {
    weekNumber: n,
    title: read.title,
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks: read.blocks,
  };
}

/** The term with week 1 and week 2 written as blocks, published, and week 1 marked ready or not. */
function seed({ ready = true, groupsGoOutOn = "2026-10-28" } = {}) {
  const docs = groupSeed();
  // The world's answers to its old week 1's exercise belong to a week this
  // suite replaces: nobody here has been told, so nobody could have sent one.
  for (const path of Object.keys(docs)) if (path.startsWith("courseExerciseResponses/")) delete docs[path];
  docs[W01] = { ...pastedWeek(1, "Who keeps the lamps", "k1"), ...(ready ? { ready: true, readyAt: NOW, readyByUid: "claudia" } : {}) };
  docs[W02] = pastedWeek(2, "The lamp makers", "k2");
  docs[`courseRuns/${RUN.agi}`].groupsGoOutOn = groupsGoOutOn;
  return docs;
}

const sessionOf = (uid) => made.sessionOf(uid);
const door = (who) => weekOneDoorFor(world.courseDb, sessionOf(who), RUN.agi);
const why = async (who) => {
  const answer = await door(who);
  return answer.open ? "open" : answer.why;
};
const snapshot = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

const tick = (who, itemId, completed, options = {}) =>
  call(who, ticksRoute.PUT, { runId: RUN.agi, itemId }, { body: { weekId: "w01", completed }, ...options });
const reflect = (who, promptId, weekId, text, options = {}) =>
  call(who, reflectionRoute.PUT, { runId: RUN.agi, promptId }, { body: { weekId, text }, ...options });
const ownRows = (who, week) => call(who, myExercisesRoute.GET, { runId: RUN.agi }, { query: `?week=${week}` });
const overview = (who, options = {}) => call(who, overviewRoute.GET, { runId: RUN.agi }, options);

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(seed());
});

// ---------------------------------------------------------------------------
// 1. The door
// ---------------------------------------------------------------------------

describe("1. the door, as everybody it is asked of", () => {
  test("somebody holding a place, before the hand-over: open, by the form's outcome alone", async () => {
    assert.equal(world.db.read(`courseApplications/${RUN.agi}__amara`), undefined, "nobody is handed over yet");
    const answer = await door("amara");
    assert.equal(answer.open, true);
    assert.deepEqual(answer.place, {
      runId: RUN.agi,
      roundId: world.db.read(applicationPath("amara")).roundId,
      programmeId: answer.place.programmeId,
      kind: "fellowship",
      shortName: "AGI Strategy",
      groupsGoOutOn: "2026-10-28",
      firstWeek: { from: "2026-10-26", to: "2026-11-01" },
    });
    for (const who of ["dev", "bea", "tariq"]) assert.equal(await why(who), "open", who);
  });

  test("after the hand-over and before placement, and placed and not told: still open", async () => {
    const handed = await steps.handOver();
    assert.equal(handed.status, 200, JSON.stringify(handed.body));
    assert.ok(world.db.read(`courseApplications/${RUN.agi}__amara`), "amara is on the run's list");
    assert.equal(await why("amara"), "open");
    await steps.place([{ uid: "amara", groupId: GROUP.thursday }]);
    assert.equal(world.db.read(enrolmentPath("amara")).groupId, GROUP.thursday);
    assert.equal(await why("amara"), "open", "a placement Publish has not told opens week 1 alone");
  });

  test("told: the run's own gate lets them in, so the door is not theirs", async () => {
    await steps.published();
    for (const who of ["amara", "dev", "bea", "tariq"]) assert.equal(await why(who), "in-the-run", who);
  });

  test("week 1 not ready, not published or not written: shut, and the place is still said", async () => {
    reset(seed({ ready: false }));
    const answer = await door("amara");
    assert.deepEqual([answer.open, answer.why, answer.place?.shortName], [false, "not-ready", "AGI Strategy"]);
    world.db.poke(W01, { ready: true, published: false });
    assert.equal(await why("amara"), "not-ready", "a ready mark on an unpublished week opens nothing");
    const noWeek = seed();
    delete noWeek[W01];
    reset(noWeek);
    assert.equal(await why("amara"), "not-ready");
  });

  test("gave the place back, left, or was taken off: shut", async () => {
    assert.equal(await why("nina"), "no-place", "nina gave her place back before the hand-over");
    await steps.placed();
    world.db.poke(enrolmentPath("amara"), { status: "withdrawn", droppedOutAt: NOW });
    assert.equal(await why("amara"), "left", "somebody who left keeps nothing");
    world.db.poke(enrolmentPath("dev"), { status: "removed", droppedOutAt: NOW });
    assert.equal(await why("dev"), "left");
    // Giving the place back on the form after the hand-over shuts it as well.
    world.db.poke(applicationPath("bea"), { status: "withdrawn", attendance: { answer: "cant-make-it", answeredAt: NOW } });
    assert.equal(await why("bea"), "no-place");
  });

  test("no offer, an invitation not answered, and a place on another programme: no place here", async () => {
    assert.equal(await why("omar"), "no-place");
    assert.equal(await why("ines"), "no-place");
    assert.equal(await why("wen"), "no-place");
    assert.equal(await why("nobody"), "no-place");
  });

  test("the lead and the facilitators come in through the run's own gate; an admin holds no place", async () => {
    assert.equal(await why("claudia"), "in-the-run", "the lead facilitates the Monday group");
    assert.equal(await why("tess"), "in-the-run", "the Thursday group's facilitator");
    assert.equal(await why("zach"), "no-place");
    // A facilitator who also holds a place is the run's from the moment they are appointed.
    world.db.poke(`courseGroups/${GROUP.thursday}`, { facilitatorUids: ["tess", "tariq"] });
    assert.equal(await why("tariq"), "in-the-run");
  });

  test("an account that does not stand, and a view-as session, are shut before anything is read", async () => {
    world.db.poke("users/amara", { role: "pending" });
    assert.equal(await why("amara"), "no-standing");
    world.db.poke("users/amara", { role: "member" });
    world.viewAs = true;
    try {
      const reads = [];
      const collection = world.courseDb.collection;
      world.courseDb.collection = (path) => {
        reads.push(path);
        return collection(path);
      };
      try {
        assert.equal(await why("amara"), "view-as");
      } finally {
        world.courseDb.collection = collection;
      }
      assert.deepEqual(reads, [], "a view-as session read something");
    } finally {
      world.viewAs = false;
    }
  });

  test("a run no programme names, or one that is over, opens nothing", async () => {
    const other = await weekOneDoorFor(world.courseDb, sessionOf("amara"), RUN.other);
    assert.equal(other.open ? "open" : other.why, "no-programme");
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "cancelled" });
    assert.equal(await why("amara"), "run-shut");
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "applications-open", archived: true });
    assert.equal(await why("amara"), "run-shut");
  });
});

// ---------------------------------------------------------------------------
// 2. The gate
// ---------------------------------------------------------------------------

describe("2. the gate carries the door's answer, for anybody with no other way in", () => {
  test("a holder: no cohort access, and week 1's place", async () => {
    const access = await ask.access("amara");
    assert.equal(access.canLearn, false);
    assert.equal(access.enrolment, null);
    assert.equal(access.beforeGroups?.shortName, "AGI Strategy");
  });

  test("week 1 not ready: nothing", async () => {
    reset(seed({ ready: false }));
    assert.equal((await ask.access("amara")).beforeGroups, null);
  });

  test("told, facilitating or an admin: their own way in, and never the door beside it", async () => {
    await steps.published();
    for (const who of ["amara", "tess", "zach"]) {
      const access = await ask.access(who);
      assert.equal(access.canLearn, true, who);
      assert.equal(access.beforeGroups, null, who);
    }
  });

  test("everybody else: nothing", async () => {
    for (const who of ["nina", "omar", "ines", "nobody"]) {
      const access = await ask.access(who);
      assert.deepEqual([access.canLearn, access.beforeGroups], [false, null], who);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The overview
// ---------------------------------------------------------------------------

describe("3. the overview answers week 1 and nothing else", () => {
  test("for a holder, placed and not told: week 1 alone, no group, no session, the line with the day", async () => {
    await steps.placed();
    const answer = await overview("amara");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const body = answer.body;
    assert.deepEqual(body.weeks.map((week) => week.weekNumber), [1]);
    assert.deepEqual(body.weekSchedule, []);
    assert.deepEqual([body.group, body.groups, body.enrolment, body.ownAttendance, body.currentWeek], [null, [], null, null, null]);
    assert.deepEqual(body.forkedWeekIds, []);
    assert.deepEqual([body.run.startDate, body.run.weekPlan, body.run.totalWeeks], ["", [], 2]);
    assert.deepEqual(body.beforeGroups, { line: "Week 1 is open now. You’ll hear your group and when it meets on Wed 28 Oct." });
    assert.deepEqual(body.programme, { name: "AGI Strategy", kind: "fellowship", leadFirstName: "Claudia" });
    // No due day before the group: due dates wait for Publish.
    const tasks = body.weeks[0].thisWeek.rows.filter((row) => row.type === "task");
    assert.ok(tasks.length > 0);
    for (const row of tasks) assert.equal(row.due, null);
    // Nothing anywhere names their group, or the run's.
    const said = JSON.stringify(body);
    for (const name of [GROUP.thursday, GROUP.monday, "Thursday morning", "Monday evening", "Room A3", "Room B12"]) {
      assert.ok(!said.includes(name), `the answer carries ${name}`);
    }
  });

  test("the line without a day, when none is set or the day has passed", async () => {
    reset(seed({ groupsGoOutOn: null }));
    assert.equal(
      (await overview("amara")).body.beforeGroups.line,
      "Week 1 is open now. You’ll hear your group and when it meets once groups go out.",
    );
    reset(seed());
    mock.timers.setTime(new Date("2026-10-29T12:00:00Z").getTime());
    assert.equal(
      (await overview("amara")).body.beforeGroups.line,
      "Week 1 is open now. You’ll hear your group and when it meets once groups go out.",
    );
  });

  test("an incubator's place: week 1 is open, and the line names no group", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.kind`]: "incubator" });
    const body = (await overview("amara")).body;
    assert.deepEqual(body.weeks.map((week) => week.weekNumber), [1]);
    assert.deepEqual(body.beforeGroups, { line: "Week 1 is open now." });
    assert.doesNotMatch(JSON.stringify(body.beforeGroups), /group|meets/i);
  });

  test("week 1 not ready, gave the place back, no offer, signed out: refused as before", async () => {
    reset(seed({ ready: false }));
    assert.equal((await overview("amara")).status, 403);
    reset(seed());
    for (const who of ["nina", "omar", "nobody"]) assert.equal((await overview(who)).status, 403, who);
    assert.equal((await overview(null)).status, 401);
  });

  test("told, the overview is the whole run as before, with no line", async () => {
    await steps.published();
    const body = (await overview("amara")).body;
    assert.equal(body.beforeGroups, null);
    assert.ok(body.weekSchedule.length >= 1);
    assert.equal(body.group?.id, GROUP.thursday);
  });
});

// ---------------------------------------------------------------------------
// 4. Their doors
// ---------------------------------------------------------------------------

describe("4. ticks, reflections and their own rows, for a holder", () => {
  test("a tick through week 1's door writes their own row, as the browser would, and takes it back", async () => {
    const done = await tick("amara", "k1-s1", true);
    assert.deepEqual([done.status, done.body], [200, { ok: true, itemId: "k1-s1", completed: true }]);
    const row = world.db.read(`courseProgress/${RUN.agi}__amara__k1-s1`);
    assert.deepEqual(
      Object.keys(row).sort(),
      ["completed", "completedAt", "hasPublicComment", "itemId", "itemKind", "runId", "uid", "weekNumber"],
    );
    assert.deepEqual(
      [row.runId, row.uid, row.itemId, row.itemKind, row.weekNumber, row.completed, row.hasPublicComment],
      [RUN.agi, "amara", "k1-s1", "material", 1, true, false],
    );
    assert.ok(row.completedAt instanceof Date);
    const undone = await tick("amara", "k1-s1", false);
    assert.equal(undone.status, 200);
    assert.equal(world.db.read(`courseProgress/${RUN.agi}__amara__k1-s1`).completed, false);
    assert.equal("completedAt" in world.db.read(`courseProgress/${RUN.agi}__amara__k1-s1`), false);
  });

  test("a rating or a note already on the row is kept", async () => {
    world.db.seed(`courseProgress/${RUN.agi}__amara__k1-s2`, {
      runId: RUN.agi, uid: "amara", weekNumber: 1, itemKind: "material", itemId: "k1-s2", completed: false,
      hasPublicComment: false, rating: 4, privateNote: "Mine.",
    });
    assert.equal((await tick("amara", "k1-s2", true)).status, 200);
    const row = world.db.read(`courseProgress/${RUN.agi}__amara__k1-s2`);
    assert.deepEqual([row.completed, row.rating, row.privateNote], [true, 4, "Mine."]);
  });

  test("only week 1's own items: week 2's source, a reflection prompt and an id that is nothing are refused", async () => {
    const before = snapshot();
    for (const itemId of ["k2-s1", "k1-rp1", "nothing-here"]) {
      const answer = await tick("amara", itemId, true);
      assert.deepEqual([answer.status, answer.body.error], [404, "That isn’t on week 1 any more. Reload the page."], itemId);
    }
    assert.equal(snapshot(), before);
  });

  test("the tick door refuses everybody it does not open to, and writes nothing", async () => {
    reset(seed({ ready: false }));
    let before = snapshot();
    assert.deepEqual(
      [(await tick("amara", "k1-s1", true)).status, (await tick("amara", "k1-s1", true)).body.error],
      [403, "Week 1 isn’t open to you yet."],
    );
    assert.equal(snapshot(), before);
    reset(seed());
    before = snapshot();
    for (const who of ["nina", "omar", "ines", "nobody", "zach"]) {
      assert.equal((await tick(who, "k1-s1", true)).status, 403, who);
    }
    assert.equal(snapshot(), before);
    // The lead facilitates the Monday group and Tess the Thursday one: each takes part as themselves, as the reflection boxes admit them.
    assert.equal((await tick("claudia", "k1-s1", true)).status, 200);
    assert.equal((await tick("tess", "k1-s1", true)).status, 200);
    before = snapshot();
    assert.equal((await tick(null, "k1-s1", true)).status, 401);
    assert.deepEqual((await tick("amara", "k1-s1", true, { viewAs: true })).body, { error: "view-as" });
    assert.equal((await tick("amara", "k1-s1", "yes")).status, 400);
    assert.equal(snapshot(), before);
    // Told, she ticks through the same route by her seat now, and is answered as anybody placed is.
    await steps.published();
    assert.equal((await tick("amara", "k1-s1", true)).status, 200);
  });

  test("reflections: week 1's boxes, never week 2's; read back for week 1 only", async () => {
    const saved = await reflect("amara", "k1-rp1", "w01", "About thirty.");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const id = `${RUN.agi}__amara__w01__k1-rp1`;
    assert.deepEqual(
      [world.db.read(`courseExerciseResponses/${id}`).kind, world.db.read(`courseExerciseResponses/${id}`).text],
      ["reflection", "About thirty."],
    );
    const before = snapshot();
    const weekTwo = await reflect("amara", "k2-rp1", "w02", "Not yet.");
    assert.deepEqual(
      [weekTwo.status, weekTwo.body.error],
      [403, "Only somebody taking part in this programme can write in its reflection boxes."],
    );
    assert.equal(snapshot(), before);
    const mine = await ownRows("amara", 1);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.responses.map((row) => [row.exerciseId, row.kind, row.text]), [["k1-rp1", "reflection", "About thirty."]]);
    assert.equal((await ownRows("amara", 2)).status, 403, "week 2's rows are not theirs to read yet");
  });

  test("reflections and own rows refuse everybody the door does not open to", async () => {
    reset(seed({ ready: false }));
    assert.equal((await reflect("amara", "k1-rp1", "w01", "x")).status, 403);
    assert.equal((await ownRows("amara", 1)).status, 403);
    reset(seed());
    for (const who of ["nina", "omar", "nobody"]) {
      assert.equal((await reflect(who, "k1-rp1", "w01", "x")).status, 403, who);
      assert.equal((await ownRows(who, 1)).status, 403, who);
    }
  });

  test("what they wrote counts in week 1's This week on the overview", async () => {
    await reflect("amara", "k1-rp1", "w01", "About thirty.");
    const task = (await overview("amara")).body.weeks[0].thisWeek.rows.find((row) => row.type === "task");
    assert.deepEqual(task.written, ["k1-rp1"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Week 2, and everything else, before Publish
// ---------------------------------------------------------------------------

describe("5. week 2 is refused to all of them before Publish, and the rest of the run is shut", () => {
  test("placed and not told, week 1 ready: the run reads as before but for week 1", async () => {
    await steps.placed();
    for (const who of ["amara", "dev", "bea", "tariq"]) {
      assert.equal((await ownRows(who, 2)).status, 403, `${who} reads week 2`);
      assert.equal((await reflect(who, "k2-rp1", "w02", "x")).status, 403, `${who} writes in week 2`);
      assert.equal((await tick(who, "k2-s1", true)).status, 404, `${who} ticks week 2`);
      const groupId = who === "amara" || who === "tariq" ? GROUP.thursday : GROUP.monday;
      assert.equal((await ask.roster(who, groupId)).status, 403, `${who} reads the group`);
      assert.equal((await ask.comments(who)).status, 403, `${who} reads the run's comments`);
      assert.deepEqual(await ask.me(who), [], `${who} is shown the run on the hub`);
      const own = await ask.enrol(who);
      assert.deepEqual([own.status, own.body.enrolment], [200, null], `${who} is shown their seat`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The pages
// ---------------------------------------------------------------------------

describe("6. the pages under the run", () => {
  const record = (name) => `export default function ${name}() { return null; }`;
  const SESSION = "export async function getCurrentUser() { return globalThis.__weekOneBeforeGroups.user; }";
  const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const STYLESHEETS = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
  }
  const { loadTs: loadPage } = createLoader({
    stubs: new Map([
      ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
      ["server-only", "export {};"],
      ["firebase-admin/firestore", FIELD_VALUE_STUB],
      ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__weekOneBeforeGroups.courseDb; }"],
      ["@/lib/firebase/session", SESSION],
      [
        "@/lib/firebase/impersonation",
        "export async function assertNotImpersonating() { return null; }\n" +
          "export async function getImpersonator() { return null; }\n" +
          "export function markerIsLive() { return false; }",
      ],
      [
        "next/navigation",
        "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
          "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
      ],
      ["next/link", "export default function Link() { return null; }"],
      ["@/features/courses/WeekView", record("WeekView")],
      ["@/features/courses/weekly/WeekNotOpen", record("WeekNotOpen")],
      ["@/features/courses/RunHome", record("RunHome")],
      ["@/features/courses/ProgressBody", record("ProgressBody")],
    ]),
  });
  const LEARN = join("app", "(app)", "learn", "[runId]");
  let pages = null;
  const loaded = async () =>
    (pages ??= {
      layout: (await loadPage(join(LEARN, "layout.tsx"))).default,
      week: (await loadPage(join(LEARN, "weeks", "[n]", "page.tsx"))).default,
      home: (await loadPage(join(LEARN, "page.tsx"))).default,
      progress: (await loadPage(join(LEARN, "progress", "page.tsx"))).default,
    });

  async function open(who, page, params) {
    world.user = sessionOf(who);
    try {
      const element = await page({ params: Promise.resolve({ runId: RUN.agi, ...params }), children: null });
      return { to: null, element };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { to: err.to, element: null };
    }
  }

  test("the layout lets a holder in once week 1 is ready, and not before", async () => {
    const { layout } = await loaded();
    assert.equal((await open("amara", layout, {})).to, null);
    reset(seed({ ready: false }));
    assert.equal((await open("amara", layout, {})).to, "/learn");
    assert.equal((await open("nina", layout, {})).to, "/learn");
  });

  test("the week page draws week 1 for a holder as somebody taking part, and sends every other week to week 1", async () => {
    const { week } = await loaded();
    const one = await open("amara", week, { n: "1" });
    assert.equal(one.to, null);
    assert.equal(one.element?.type?.name, "WeekView");
    const props = one.element.props;
    assert.deepEqual(
      [props.runId, props.weekNumber, props.uid, props.viewerRole, props.sharedNotes],
      [RUN.agi, 1, "amara", "learner", null],
    );
    for (const n of ["2", "3", "01", "x"]) {
      assert.equal((await open("amara", week, { n })).to, `/learn/${RUN.agi}/weeks/1`, `week ${n}`);
    }
    reset(seed({ ready: false }));
    assert.equal((await open("amara", week, { n: "1" })).to, "/learn");
  });

  test("the run's home and its progress page send a holder away", async () => {
    const { home, progress } = await loaded();
    assert.equal((await open("amara", home, {})).to, "/learn");
    assert.equal((await open("amara", progress, {})).to, "/learn");
  });

  test("told, the week page is theirs as before", async () => {
    await steps.published();
    const { week } = await loaded();
    const two = await open("amara", week, { n: "2" });
    assert.equal(two.to, null, "a told member reaches week 2's page, which says when it opens");
  });
});

// ---------------------------------------------------------------------------
// 7. The week page, as a holder reads it
// ---------------------------------------------------------------------------

describe("7. week 1's page, drawn for somebody holding a place before groups go out", async () => {
  // The page's own world: every browser hook stood in, handing the page what
  // the server answered this holder in the world above.
  const page = await makeWeekBlocksPageWorld("__weekOneBeforeGroupsPage");
  const { normalizeCourseWeek } = await loadTs(join("lib", "firestore", "courses.ts"));

  async function drawWeekOne({ ticked = [] } = {}) {
    const answer = await overview("amara");
    assert.equal(answer.status, 200);
    page.ui.overview = answer.body;
    page.ui.weekDocs = { w01: normalizeCourseWeek("w01", world.db.read(W01)) };
    page.ui.ownRows = new Map();
    page.ui.ownRowsLoaded = true;
    page.ui.progress = new Map(ticked.map((id) => [id, { id, itemId: id, itemKind: "material", completed: true, weekNumber: 1 }]));
    const html = renderToStaticMarkup(
      createElement(page.components.WeekView, { runId: RUN.agi, weekNumber: 1, uid: "amara", viewerRole: "learner", sharedNotes: null }),
    );
    return { html, text: html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() };
  }

  test("the line, the count, ticks and boxes that take writing, and the way back to My programmes", async () => {
    const { html, text } = await drawWeekOne();
    assert.match(text, /Week 1 is open now\. You’ll hear your group and when it meets on Wed 28 Oct\./);
    assert.match(text, /0 of 1 done/);
    const boxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((match) => match[0]);
    assert.ok(boxes.length >= 2, "the sources have no ticks");
    for (const box of boxes) assert.doesNotMatch(box, /disabled/, "a tick does not take writing");
    const areas = [...html.matchAll(/<textarea[^>]*>/g)].map((match) => match[0]);
    assert.ok(areas.length >= 6, "the reflection boxes are not drawn");
    for (const area of areas) assert.doesNotMatch(area, /readOnly|readonly/, "a box does not take writing");
    assert.ok(html.includes('href="/learn"'), "no way back to My programmes");
    assert.ok(!html.includes(`href="/learn/${RUN.agi}"`), "a way to the run's home, which is not theirs yet");
    assert.ok(!text.includes("See your progress week by week"));
    assert.match(text, /Before your first session, if you can/);
  });

  test("a ticked source opens no rating or note: nobody it names reads one yet", async () => {
    const { text } = await drawWeekOne({ ticked: ["k1-s1"] });
    assert.ok(!text.includes("Rate it or leave a note"));
  });
});

// ---------------------------------------------------------------------------
// 8. A refusal reaches the page in the route's own words
// ---------------------------------------------------------------------------

/**
 * The week page's own client code, as the browser runs it: the tick hook
 * (`useMaterialTicks`), week 1's tick door (`tickWeekOneBeforeGroups`) and a
 * reflection box's write (`putReflection`). Stood in: the browser's database
 * (every write refused with the code `__weekOnePage.code` names, as the rules
 * refuse one), the person's live rows, and `fetch`, which the real routes
 * above answer as the person.
 */
globalThis.__weekOnePage = { code: "permission-denied" };
const browser = createLoader({
  stubs: [
    [
      "firebase/firestore",
      "export function doc() { return {}; }\n" +
        "export async function getDoc() { return { data: () => undefined }; }\n" +
        "export async function setDoc() { throw Object.assign(new Error('Missing or insufficient permissions.'), { code: globalThis.__weekOnePage.code }); }\n" +
        "export function serverTimestamp() { return 'serverTimestamp()'; }",
    ],
    ["@/lib/firebase/client", "export function getClientDb() { return {}; }"],
    ["@/features/courses/useRunProgress", "export function useRunProgress() { return { byItemId: new Map(), loading: false, error: null }; }"],
  ],
});
const { useMaterialTicks } = await browser.loadTs(join("features", "courses", "weekly", "useMaterialTicks.ts"));
const tickWords = await browser.loadTs(join("features", "courses", "weekly", "tickWords.ts"));
const { putReflection } = await browser.loadTs(join("features", "courses", "weekBlocks", "boxWrites.ts"));
const { REFLECTION_NOT_SAVED } = await browser.loadTs(join("lib", "courses", "memberPageWords.ts"));

/** `fetch` as the page makes it, answered by the real tick and reflection routes, as `who`. */
function answeredAs(who) {
  return async (url, init = {}) => {
    const path = new URL(String(url), "https://naisi.invalid").pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    const tickAt = /^\/api\/courses\/runs\/([^/]+)\/ticks\/([^/]+)$/.exec(path);
    const boxAt = /^\/api\/courses\/runs\/([^/]+)\/reflections\/([^/]+)$/.exec(path);
    let answer = null;
    if (tickAt) answer = await call(who, ticksRoute.PUT, { runId: decodeURIComponent(tickAt[1]), itemId: decodeURIComponent(tickAt[2]) }, { body });
    if (boxAt) answer = await call(who, reflectionRoute.PUT, { runId: decodeURIComponent(boxAt[1]), promptId: decodeURIComponent(boxAt[2]) }, { body });
    assert.ok(answer, `the page fetched ${path}, which nothing here answers`);
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
  };
}

/** No answer at all: what `fetch` does with the connection gone. */
const lost = async () => {
  throw new TypeError("Failed to fetch");
};
/** An answer with nothing to say: a page some proxy answered with. */
const blank = async () => new Response("<html><body>Bad gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html" } });

async function withFetch(impl, run) {
  const stub = mock.method(globalThis, "fetch", impl);
  try {
    return await run();
  } finally {
    stub.mock.restore();
  }
}

/** The ticks the week page holds for `who`, through the hook, as their week 1 page draws it. */
function weekPageTicks(who) {
  let ticks = null;
  function WeekOneTicks() {
    ticks = useMaterialTicks(RUN.agi, who, 1, true);
    return null;
  }
  renderToStaticMarkup(createElement(WeekOneTicks));
  return ticks;
}

/** Bea gives the place back on the application page, the way the reply does. */
const beaGivesHerPlaceBack = () =>
  world.db.poke(applicationPath("bea"), { status: "withdrawn", attendance: { answer: "cant-make-it", answeredAt: NOW } });

const boxWrite = (text) => putReflection({ runId: RUN.agi, promptId: "k1-rp1", weekId: "w01", text, keepalive: false });

describe("8. a refusal reaches the page in the route's own words", () => {
  test("a tick after giving the place back, with week 1 still open in a tab: put back, in the route's words", async () => {
    const ticks = weekPageTicks("bea");
    // Holding the place, Bea's tick goes through week 1's door and saves.
    assert.deepEqual(await withFetch(answeredAs("bea"), () => ticks.tick("material", "k1-s1", true)), { saved: true });
    assert.equal(world.db.read(`courseProgress/${RUN.agi}__bea__k1-s1`).completed, true);
    beaGivesHerPlaceBack();
    const before = snapshot();
    const refused = await withFetch(answeredAs("bea"), () => ticks.tick("material", "k1-s2", true));
    assert.deepEqual(refused, { saved: false, words: "Week 1 isn’t open to you yet." });
    assert.doesNotMatch(refused.words, /connection/i);
    assert.equal(snapshot(), before, "a refused tick wrote something");
    // The pages that only say that a tick did not save are told it did not.
    assert.equal(await withFetch(answeredAs("bea"), () => ticks.toggle("material", "k1-s2", true)), false);
  });

  test("every other refusal of week 1's door reaches the page as the route's own sentence", async () => {
    const ticks = weekPageTicks("amara");
    // Week 2's source, through week 1's door.
    assert.deepEqual(await withFetch(answeredAs("amara"), () => ticks.tick("material", "k2-s1", true)), {
      saved: false,
      words: "That isn’t on week 1 any more. Reload the page.",
    });
    // Week 1 no longer ready: the door shut for Amara too.
    world.db.poke(W01, { ready: false });
    assert.deepEqual(await withFetch(answeredAs("amara"), () => ticks.tick("material", "k1-s1", true)), {
      saved: false,
      words: "Week 1 isn’t open to you yet.",
    });
  });

  test("a reflection box after giving the place back is refused in the route's own sentence, under the box", async () => {
    // Holding the place, the box's own write saves.
    const row = await withFetch(answeredAs("bea"), () => boxWrite("About thirty."));
    assert.equal(row.text, "About thirty.");
    beaGivesHerPlaceBack();
    await assert.rejects(withFetch(answeredAs("bea"), () => boxWrite("About forty.")), (err) => {
      assert.equal(err.message, "Only somebody taking part in this programme can write in its reflection boxes.");
      return true;
    });
    assert.equal(world.db.read(`courseExerciseResponses/${RUN.agi}__bea__w01__k1-rp1`).text, "About thirty.");
  });

  test("only a request that got no answer, or an answer with nothing to say, names the connection", async () => {
    const ticks = weekPageTicks("amara");
    for (const impl of [lost, blank]) {
      assert.deepEqual(await withFetch(impl, () => ticks.tick("material", "k1-s1", true)), { saved: false, words: tickWords.TICK_NOT_SAVED });
      await assert.rejects(withFetch(impl, () => boxWrite("About thirty.")), (err) => {
        assert.equal(err.message, REFLECTION_NOT_SAVED, "the browser's own words for a lost request");
        return true;
      });
    }
    assert.equal(tickWords.TICK_NOT_SAVED, "That tick didn’t save, so it has been undone. Check your connection and try again.");
    assert.equal(REFLECTION_NOT_SAVED, "Your last change isn’t saved yet. Check your connection: it saves again as you type.");
  });

  test("every tick goes through the tick route: nothing is written from the browser, whoever ticks", async () => {
    // Placed and told, Amara's tick is the same request as a holder's, answered by her seat.
    await steps.published();
    const ticks = weekPageTicks("amara");
    assert.deepEqual(await withFetch(answeredAs("amara"), () => ticks.tick("material", "k1-s2", true)), { saved: true });
    assert.equal(world.db.read(`courseProgress/${RUN.agi}__amara__k1-s2`).completed, true);
    const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
    const hook = readFileSync(join(SRC, "features", "courses", "weekly", "useMaterialTicks.ts"), "utf8");
    assert.match(hook, /await tickThroughRoute\(\{ runId, weekNumber, itemId, next \}\);/);
    assert.doesNotMatch(hook, /setDoc|toggleProgressItem/, "a tick is written from the browser");
    // A refusal from the rules, which only a page opened before ticks moved can meet, still says to reload.
    assert.equal(tickWords.tickNotSavedWords({ code: "permission-denied" }), tickWords.TICK_REFUSED_RELOAD);
  });

  test("the week page says what the hook hands back, and the boxes write through the shared writes", () => {
    const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
    const code = (...parts) => readFileSync(join(SRC, ...parts), "utf8");
    const view = code("features", "courses", "WeekView.tsx");
    assert.equal([...view.matchAll(/ticks\.tick\(itemKind, itemId, next\)\.then\(\(outcome\) => \{/g)].length, 2, "both of the page's ticks");
    assert.equal([...view.matchAll(/throw new Error\(outcome\.words\);/g)].length, 2, "and both say the hook's words");
    assert.doesNotMatch(view, /ticks\.toggle\(|Check your connection/, "the week page says something of its own about a refused tick");
    for (const [file, write] of [["ReflectStop.tsx", "putReflection"], ["FillInCard.tsx", "putFillIn"]]) {
      const box = code("features", "courses", "weekBlocks", file);
      assert.match(box, new RegExp(`import \\{ ${write} \\} from "\\./boxWrites";`), file);
      assert.doesNotMatch(box, /\bfetch\(/, `${file} writes by a fetch of its own`);
      assert.match(box, /saver\.error\?\.message \|\| REFLECTION_NOT_SAVED/, `${file} says something other than the write's words`);
    }
  });
});
