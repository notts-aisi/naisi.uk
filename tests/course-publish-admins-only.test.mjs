/**
 * ONLY AN ADMIN PUBLISHES A PROGRAMME'S GROUPS. Publish emails everybody on
 * the run their group, so its press and the test that unlocks it are an
 * admin's alone: a programme's lead and a run's track lead still place
 * people and still read Publish's own page, and are told one sentence where
 * the buttons are, which is also what the two routes refuse them with.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/runs/[runId]/allocation/publish/test
 *   POST /api/courses/runs/[runId]/allocation/publish
 *   GET  /api/courses/runs/[runId]/allocation/publish/preview   (still the lead's to read)
 *   GET  /api/courses/runs/[runId]/allocation                   (still the lead's to read)
 *   POST /api/courses/runs/[runId]/allocate                     (still the lead's to place)
 *
 * ## What this guards
 *
 *  1. EVERY CALLER, BOTH PRESSES. Signed out, a member on nothing, a member
 *     placed on the run, a facilitator, the lead of another programme, the
 *     run's track lead, the programme's lead, a view-as session, an admin and
 *     an admin who also leads the programme, each asked for the test and the
 *     press: only the two admins pass.
 *  2. ONE SENTENCE, AND NOTHING ABOUT THE PEOPLE READ FIRST. The lead and the
 *     track lead are refused with `PUBLISH_ONLY_ADMINS`, nothing is written
 *     or sent, and the run's application rows and enrolments are not asked
 *     for before the refusal.
 *  3. PLACING AND READING STAY AS THEY WERE. The lead still places people,
 *     reads the board's count and reads Publish's preview.
 *  4. AN ADMIN WHO ALSO LEADS PUBLISHES AS AN ADMIN.
 *  5. THE PAGES ASK THE SERVER. Publish's own page and the older board's page
 *     hand the Publish area whether an admin is looking, from the session,
 *     and the area draws the buttons for an admin alone.
 *
 * Real: every handler and the libraries under it. Stubbed: the session, the
 * Admin SDK handle, the view-as guard and the mail door
 * (`tests/lib/handoverWorld.mjs`).
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, RUN, formPath, leadSeed } from "./lib/leadWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(join(SRC, path), "utf8");

const made = makeWorld("__publishAdminsOnly");
const { world, reset, call, everything, courseRoute, lib } = made;
const join_ = await loadJoin(made);
const { routes, press, place } = join_;
const preview = await courseRoute("runs", "[runId]", "allocation", "publish", "preview");
const words = await lib("courses", "publishWords.ts");

// Tue 27 Oct 2026, 5:38pm in London.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-27T17:38:00Z") });

const run = { runId: RUN.agi };
const ONLY_ADMINS = "Only an admin publishes. Ask an admin when the groups are ready.";

/** The term after the hand-over, with four people placed by an admin. Publish not yet pressed. */
async function ready(seed = leadSeed()) {
  reset(seed, { now: () => new Date() });
  assert.equal((await press()).status, 200);
  const placed = await place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: C },
  ]);
  assert.equal(placed.body.placed, 4, JSON.stringify(placed.body));
}

/** Every collection the course routes' view of the store is asked for, in order, from now on. */
function watchCollections() {
  const asked = [];
  const db = world.courseDb;
  world.courseDb = new Proxy(db, {
    get(target, key) {
      if (key === "collection") {
        return (path) => {
          asked.push(path);
          return target.collection(path);
        };
      }
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return asked;
}

const testOf = (who, o = {}) => call(who, routes.publishTest.POST, run, { course: true, ...o });
const pressOf = (who, emails, o = {}) => call(who, routes.publish.POST, run, { body: { emails }, course: true, ...o });

// ---------------------------------------------------------------------------
// 1. Every caller
// ---------------------------------------------------------------------------

describe("1. every caller, both presses: only an admin passes", () => {
  /** [who, label, view-as, what the test and the press are answered] */
  const CALLERS = [
    [null, "somebody signed out", false, 401],
    ["nobody", "a member on nothing", false, 403],
    ["amara", "a member placed on the run", false, 403],
    ["rahul", "a facilitator of one of the run's groups", false, 403],
    ["tess", "the lead of another programme", false, 403],
    ["yusuf", "the run's track lead", false, 403],
    ["claudia", "the programme's lead", false, 403],
    ["claudia", "an admin viewing as the programme's lead", true, 403],
  ];

  for (const [who, label, viewAs, status] of CALLERS) {
    test(`${label}: the test and the press are refused, and nothing is sent or written`, async () => {
      await ready();
      const before = everything();
      const tested = await testOf(who, { viewAs });
      const pressed = await pressOf(who, 6, { viewAs });
      assert.deepEqual([tested.status, pressed.status], [status, status], JSON.stringify([tested.body, pressed.body]));
      assert.deepEqual(world.mail, [], `${label}: an email went`);
      assert.equal(everything(), before, `${label}: something was written`);
    });
  }

  test("an admin passes both: the test goes to their own address, and the press publishes", async () => {
    await ready();
    await join_.withoutNotes("zach");
    const tested = await testOf("zach");
    assert.equal(tested.status, 200, JSON.stringify(tested.body));
    assert.deepEqual([...new Set(world.mail.map((mail) => mail.to))], ["zach@example.com"]);
    const summary = (await join_.board("zach")).body.publish;
    assert.equal(summary.test.state, "fresh");
    const pressed = await pressOf("zach", summary.emails);
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.ok(world.db.read(`courseRuns/${RUN.agi}`).allocationPublishedAt);
  });
});

// ---------------------------------------------------------------------------
// 2. One sentence, nothing about the people read first
// ---------------------------------------------------------------------------

describe("2. the lead and the track lead are refused in one sentence, before the run's people are read", () => {
  for (const [who, label] of [
    ["claudia", "the programme's lead"],
    ["yusuf", "the run's track lead"],
  ]) {
    test(`${label}`, async () => {
      await ready();
      const asked = watchCollections();
      const tested = await testOf(who);
      const pressed = await pressOf(who, 6);
      assert.deepEqual([tested.status, tested.body.error], [403, ONLY_ADMINS]);
      assert.deepEqual([pressed.status, pressed.body.error], [403, ONLY_ADMINS]);
      // The watch sees the store: the run itself is read to know who staffs it.
      assert.ok(asked.includes("courseRuns"), `the watch saw nothing (${asked.join(", ")})`);
      for (const people of ["courseApplications", "courseEnrolments"]) {
        assert.ok(!asked.includes(people), `${label}: ${people} was read before the refusal (${asked.join(", ")})`);
      }
    });
  }

  test("the sentence is the one the Publish area draws in place of its buttons", () => {
    assert.equal(words.PUBLISH_ONLY_ADMINS, ONLY_ADMINS);
  });
});

// ---------------------------------------------------------------------------
// 3. Placing and reading
// ---------------------------------------------------------------------------

describe("3. the lead still places, reads the board's count and reads Publish's preview", () => {
  test("as before", async () => {
    await ready();
    const moved = await place("claudia", [{ uid: "amara", groupId: A }]);
    assert.equal(moved.body.placed, 1, JSON.stringify(moved.body));
    const asLead = (await join_.board("claudia")).body.publish;
    const asAdmin = (await join_.board("zach")).body.publish;
    assert.deepEqual([asLead.adminOnly, asLead.emails], [false, asAdmin.emails]);
    const shown = await call("claudia", preview.GET, run, { course: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal(shown.body.people.emails, asAdmin.people);
    assert.ok(!JSON.stringify(shown.body).includes("@example.com"), "the preview carries an address");
  });
});

// ---------------------------------------------------------------------------
// 4. An admin who also leads
// ---------------------------------------------------------------------------

describe("4. an admin who also leads the programme publishes as an admin", () => {
  test("the test and the press go", async () => {
    const seed = leadSeed();
    seed[formPath].programmes[AGI].leadUid = "zach";
    await ready(seed);
    const pressed = await join_.publish("zach");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.ok(world.mail.some((mail) => mail.to === "zach@example.com"), "no test reached the admin");
    assert.ok(world.db.read(`courseRuns/${RUN.agi}`).allocationPublishedAt);
    // And the lead who no longer leads it is refused as anybody else is.
    assert.equal((await pressOf("claudia", 0)).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 5. The pages
// ---------------------------------------------------------------------------

describe("5. whether an admin is looking comes from the server page, and only an admin is drawn the buttons", () => {
  test("Publish's own page and the older board's page read the session", () => {
    const publishPage = read("app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/publish/page.tsx");
    assert.match(publishPage, /<PublishGroups [^>]*admin=\{user\.role === "admin"\}/);
    assert.match(publishPage, /<PublishReadiness[\s\S]*?admin=\{user\.role === "admin"\}/);
    const olderPage = read("app/(app)/admin/courses/[courseId]/runs/[runId]/allocation/page.tsx");
    assert.match(olderPage, /getCurrentUser\(\)/);
    assert.match(olderPage, /<AllocationBoard [^>]*admin=\{user\?\.role === "admin"\}/);
  });

  test("the lead's way to Publish's page says the same words on the Overview and on People in groups", async () => {
    const board = await made.loadTs(join("features", "applications", "groups", "peopleInGroupsWords.ts"));
    const getReady = await lib("courses", "getReady", "words.ts");
    assert.equal(board.PUBLISH_GROUPS_LEAD, getReady.PUBLISH_LINK_LEAD);
    assert.equal(board.PUBLISH_GROUPS, getReady.STEP_LINK.publish);
  });

  test("both mounts hand the Publish area the answer, and the area draws the buttons for an admin alone", () => {
    assert.match(read("features/applications/groups/PublishGroups.tsx"), /<AllocationPublish[\s\S]*?admin=\{admin\}/);
    assert.match(read("features/courses/AllocationBoard.tsx"), /<AllocationPublish[\s\S]*?admin=\{admin\}/);
    const area = read("features/courses/AllocationPublish.tsx");
    // A required prop, so no mount can forget it.
    assert.match(area, /\n {2}admin: boolean;/);
    assert.match(area, /\{!admin \? \(\s*<p className=\{styles\.adminsPublish\}>\{PUBLISH_ONLY_ADMINS\}<\/p>\s*\) : summary\.adminOnly \? null : \(\s*<div className=\{styles\.actions\}>/);
  });
});
