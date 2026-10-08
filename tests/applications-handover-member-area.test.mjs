/**
 * What somebody the application form placed on a course run sees in their
 * own member area.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/courses/me
 *   the gate every page under /learn/[runId] asks (`getRunAccess`)
 *   the card `/learn` draws for one run (`RunCard`)
 *
 * ## What this guards
 *
 * After an admin's hand-over a person has a row on a course run saying they
 * hold a place. The member area was built for people who applied to a run
 * itself, and draws such a row as an offer. Somebody who came through the
 * form has already been told, and has already said whether they are coming,
 * so this file holds what THEY are shown:
 *
 *  - THE RUN SHOWS: a place first, then their group once they are in one,
 *    and the run opens to them from that moment.
 *  - THE WORDS ARE THE FORM'S. The card says they have a place and what is
 *    still to come. It never says "offered", never asks them to accept or
 *    apply, and never prints the run's own "Applications open".
 *  - ONLY WHILE IT IS TRUE. Somebody who gave their place back stops being
 *    told they have one, though nothing has taken their row away. It is
 *    read off their own application, by the reading their own page uses.
 *  - NOT IN A VIEW-AS SESSION. An admin who borrowed the member's session
 *    is not the applicant: the application is not read, and the card is not
 *    drawn.
 *  - ONLY EVER A PLACE. A row from the form that somebody has since moved
 *    to the run's own waiting list is not announced at all: that list goes
 *    with the run's own application form, and its words are not theirs.
 *  - A SEAT IS A SEAT. Once somebody is in a group they are on the run,
 *    whatever they reply later. Nothing here removes anybody.
 *
 * `tests/lib/handoverWorld.mjs` says what is real and what is stubbed.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CAST,
  COURSE,
  GROUP,
  RUN,
  loadJoin,
  makeWorld,
  namedSeed,
} from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const made = makeWorld();
const { world, reset } = made;
const join_ = await loadJoin(made);
const { press, reply, place, me, rowPath, routes } = join_;
const runAccess = await made.lib("..", "features", "courses", "runAccess.ts");

const NOW = new Date("2026-10-24T10:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

beforeEach(() => {
  // The reply route's own limiter is real, and counts by account.
  mock.timers.setTime(Date.now() + 15 * 60_000);
  reset(namedSeed());
});

// ---------------------------------------------------------------------------
// The run shows
// ---------------------------------------------------------------------------

describe("the run shows in the person's member area", () => {
  test("the person's member area shows the run: a place first, then their group", async () => {
    assert.deepEqual(await me("amara"), []);
    assert.equal((await access("amara")).canLearn, false);

    await press();
    const offered = await me("amara");
    assert.equal(offered.length, 1);
    assert.deepEqual(
      [offered[0].runId, offered[0].membership, offered[0].viaForm, offered[0].roles, offered[0].groupName, offered[0].courseTitle],
      [RUN.agi, "offered", true, [], null, "AGI Strategy Fellowship"],
    );
    // A place is not a seat yet, so the run itself does not open.
    assert.equal((await access("amara")).canLearn, false);

    await place("zach", [{ uid: "amara", groupId: GROUP.thursday }]);
    const enrolled = await me("amara");
    assert.deepEqual(
      [enrolled[0].runId, enrolled[0].membership, enrolled[0].viaForm, enrolled[0].roles, enrolled[0].groupName],
      [RUN.agi, "enrolled", true, ["learner"], "Thursday morning"],
    );
    const admitted = await access("amara");
    assert.deepEqual([admitted.canLearn, admitted.isEnrolled, admitted.run.id], [true, true, RUN.agi]);
    // And nobody else's does.
    assert.deepEqual(await me("nina"), []);
    assert.deepEqual(await me("omar"), []);
    assert.equal((await access("dev")).canLearn, false);
  });

  /** The gate every page under `/learn/[runId]` asks, as this person. */
  async function access(who) {
    world.user = { uid: who, role: world.db.read(`users/${who}`).role, suRecognised: false, permissions: CAST[who].permissions };
    world.course = true;
    try {
      return await runAccess.getRunAccess(RUN.agi);
    } finally {
      world.course = false;
    }
  }
});


// ---------------------------------------------------------------------------
// Only while it is true
// ---------------------------------------------------------------------------

describe("a place is drawn only while the person still holds it", () => {
  const WHY = { kind: "times", other: "" };

  test("nobody who was not handed over reads anything, whatever was decided about them", async () => {
    await press();
    for (const who of ["nina", "ines", "omar", "wen", "nobody"]) assert.deepEqual(await me(who), [], who);
  });

  test("when the form has been destroyed, the person still reads their place: the run outlives it", async () => {
    await press();
    for (const path of world.db.paths()) {
      const [collection, id, more] = path.split("/");
      if (more === undefined && ["admissionRounds", "admissionApplications", "admissionDecisions"].includes(collection)) {
        await world.db.collection(collection).doc(id).delete();
      }
    }
    const shown = await me("amara");
    assert.deepEqual([shown.length, shown[0].membership, shown[0].viaForm], [1, "offered", true]);
  });

  test("their own member area stops saying they have a place, though the row is still there", async () => {
    await press();
    assert.equal((await me("tariq")).length, 1);
    await reply("tariq", { reply: "cant-make-it", reason: WHY });
    assert.equal(world.db.read(rowPath("tariq")).status, "accepted");
    assert.deepEqual(await me("tariq"), []);
    // Somebody who said they are coming still reads their place.
    assert.equal((await reply("amara", { reply: "coming" })).status, 200);
    assert.equal((await me("amara")).length, 1);
  });

  test("in a view-as session the place is not drawn, and the member's application is not read", async () => {
    await press();
    const reads = [];
    const collection = world.courseDb.collection;
    world.courseDb.collection = (path) => {
      reads.push(path);
      return collection(path);
    };
    assert.deepEqual(await me("amara", { viewAs: true }), []);
    assert.ok(!reads.includes("admissionApplications"), "a view-as session read the member's application");
    assert.ok(!reads.includes("admissionRounds"));
    // The same request as the member reads it, and draws the place.
    reads.length = 0;
    assert.equal((await me("amara")).length, 1);
    assert.ok(reads.includes("admissionApplications"));
  });

  test("a row from the form is only ever a place: moved to the run's own waiting list, it says nothing here", async () => {
    await press();
    assert.equal((await me("tariq")).length, 1);
    const moved = await made.call(
      "zach",
      routes.decide.POST,
      { runId: RUN.agi, uid: "tariq" },
      { body: { action: "waitlist" }, course: true },
    );
    assert.equal(moved.status, 200, moved.body?.error);
    assert.equal(world.db.read(rowPath("tariq")).status, "waitlisted");
    // He still holds his place on the form, and the run's waiting list is not his to be told about.
    assert.deepEqual(await me("tariq"), []);
    assert.equal((await me("amara")).length, 1);

    // Somebody who applied to the run itself and was put on its waiting list reads that, as before.
    world.db.seed(rowPath("nobody"), {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid: "nobody",
      displayName: "Nell Carter",
      status: "waitlisted",
      availability: "",
    });
    const [own] = await me("nobody");
    assert.deepEqual([own.runId, own.membership, own.viaForm], [RUN.agi, "waitlisted", false]);
  });

  test("once somebody is in a group they are on the run, whatever they reply later", async () => {
    await press();
    await place("zach", [{ uid: "tariq", groupId: GROUP.monday }]);
    await reply("tariq", { reply: "cant-make-it", reason: WHY });
    const shown = await me("tariq");
    assert.deepEqual([shown.length, shown[0].membership, shown[0].groupName], [1, "enrolled", "Monday evening"]);
  });
});


// ---------------------------------------------------------------------------
// What the card says
// ---------------------------------------------------------------------------

const drawn = { createElement };
globalThis.__runCard = drawn;
const { loadTs: loadCard } = createLoader({
  stubs: new Map([
    ["./RunCard.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
    [
      "next/link",
      "export default function Link({ href, children }) {\n" +
        "  return globalThis.__runCard.createElement('a', { href }, children);\n" +
        "}",
    ],
    ["@/components/ui/Card", "export default function Card({ children }) { return globalThis.__runCard.createElement('article', null, children); }"],
    ["@/components/ui/Chip", "export default function Chip({ children }) { return globalThis.__runCard.createElement('span', { 'data-chip': '' }, children); }"],
    ["@/components/ui/ProgressRing", "export default function ProgressRing() { return null; }"],
  ]),
});
const { default: RunCard } = await loadCard(join("features", "courses", "RunCard.tsx"));

describe("what the member's own card says about a place the form gave", () => {
  const card = (entry) => renderToStaticMarkup(createElement(RunCard, { entry }));

  test("it says they have a place and what is still to come, and asks for nothing", async () => {
    await press();
    const [entry] = await me("amara");
    const html = card(entry);
    assert.ok(html.includes("You have a place"), html);
    assert.ok(html.includes("We’re putting groups together. Your group and when it meets will show here once they’re set, and we’ll email you too."));
    // The hub is not sent the run's start date, so the line is the one it has always shown before a run starts.
    assert.ok(html.includes("Starts soon"), html);
    for (const words of [/offered/i, /accept/i, /apply/i, /Applications open/, /session time/i, /waitlist/i, /<a /]) {
      assert.ok(!words.test(html), `the card says ${words}`);
    }
  });

  test("it never prints the run's own application status, whatever the run's dates", async () => {
    await press();
    for (const patch of [{ startDate: "" }, { startDate: "", status: "applications-closed" }]) {
      world.db.poke(`courseRuns/${RUN.agi}`, patch);
      const [entry] = await me("amara");
      const html = card(entry);
      assert.ok(html.includes("Starts soon"), html);
      assert.ok(!/Applications (open|closed)/.test(html), html);
    }
  });

  test("somebody who applied to a run itself reads the card they always did", () => {
    const html = card({
      runId: "r", courseId: "c", courseTitle: "Reading group", label: "Autumn 2026", academicYear: "2026/27",
      status: "applications-closed", roles: [], membership: "offered", archived: false, currentWeek: null,
      totalWeeks: 6, pacedByGroup: false, groupName: null, viaForm: false,
    });
    assert.ok(html.includes("Place offered"));
    assert.ok(html.includes("Applications closed"));
    assert.ok(!html.includes("You have a place"));
  });
});
