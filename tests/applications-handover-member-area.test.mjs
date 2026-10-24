/**
 * What somebody the application form placed on a course run reads in their
 * own member area: nothing because of the hand-over, and then their group.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/courses/me
 *   the gate every page under /learn/[runId] asks (`getRunAccess`)
 *   the card `/learn` draws for one run (`RunCard`)
 *
 * ## What this guards
 *
 * An admin's hand-over writes a row on a course run for each person who
 * holds a place, for the allocation board to place people from. The member
 * area was built for people who applied to a run itself, and has always
 * drawn that person's own accepted or waitlisted row as a card ("Place
 * offered", "Waitlisted").
 *
 * A row from the form is not news for its owner. What became of their
 * application is said on their own application page and on the list of their
 * applications, and nowhere else, and what comes next for their kind of
 * programme is said there too (`docs/applications.md`, "One set of words for
 * an outcome"). So this file holds:
 *
 *  - THE ROW IS ANNOUNCED AS NOTHING. After a hand-over the person's member
 *    area lists nothing because of it: no card and no chip. That is so
 *    whatever the run's own applications page then does to the row (accepts
 *    it again, moves it to the run's waiting list, rejects it, annotates
 *    it), so the words of the run's own form ("offered", "Waitlisted") are
 *    never drawn for somebody who never used that form.
 *  - NOTHING OF THE APPLICATION IS READ. The route reads the collections it
 *    read before forms existed and none of the application system's, for
 *    the member and for an admin viewing the site as them alike.
 *  - THEN THEIR GROUP. Once an admin puts them in a group, the run and the
 *    group show and the run opens to them, before Publish and after it, as
 *    for anybody in a group. A seat is a seat, whatever they reply later.
 *  - NOBODY ELSE IS CHANGED. Somebody who applied to the run itself reads
 *    the card they always did.
 *
 * `tests/lib/handoverWorld.mjs` says what is real and what is stubbed.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AGI_HOLDERS,
  CAST,
  COURSE,
  GROUP,
  RUN,
  loadJoin,
  makeWorld,
  namedSeed,
} from "./lib/handoverWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const made = makeWorld();
const { world, reset, call } = made;
const join_ = await loadJoin(made);
const { press, reply, place, publish, me, rowPath, routes } = join_;
const runAccess = await made.lib("..", "features", "courses", "runAccess.ts");

const NOW = new Date("2026-10-24T10:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

beforeEach(() => {
  // The reply route's own limiter is real, and counts by account.
  mock.timers.setTime(Date.now() + 15 * 60_000);
  reset(namedSeed());
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

/** What the run's own applications page can do to one row, as an admin. */
const decide = (uid, action) =>
  call("zach", routes.decide.POST, { runId: RUN.agi, uid }, { body: { action }, course: true });
const annotate = (uid, body) =>
  call("zach", routes.notes.PATCH, { runId: RUN.agi, uid }, { body, course: true });

/** A row from the run's own form, for somebody who applied to the run itself. */
const ownRow = (uid, status) => ({
  runId: RUN.agi,
  courseId: COURSE.agi,
  uid,
  displayName: CAST[uid].displayName,
  status,
  availability: "",
});

// ---------------------------------------------------------------------------
// The card, drawn for real
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
const card = (entry) => renderToStaticMarkup(createElement(RunCard, { entry }));

/** Words the run's own application form speaks in, and the form's applicants never read here. */
const OLDER_FORMS_WORDS = /offered|waitlist|you[’']re in\b|accepted|rejected|unsuccessful|a place/i;

// ---------------------------------------------------------------------------
// The row is announced as nothing
// ---------------------------------------------------------------------------

describe("a row the hand-over wrote is announced as nothing", () => {
  test("after a hand-over the person's member area lists nothing, and the run does not open", async () => {
    for (const who of AGI_HOLDERS) assert.deepEqual(await me(who), [], `${who}, before`);
    await press();
    for (const who of AGI_HOLDERS) {
      assert.equal(world.db.read(rowPath(who)).status, "accepted");
      assert.deepEqual(await me(who), [], `${who} is told something because of the hand-over`);
      assert.equal((await access(who)).canLearn, false, who);
    }
    // Nobody who was not handed over reads anything either, whatever was decided about them.
    for (const who of ["nina", "ines", "omar", "wen", "nobody"]) assert.deepEqual(await me(who), [], who);
  });

  test("whatever the run's own applications page then does to the row, nothing is announced", async () => {
    await press();
    const steps = [
      ["moved to the run's waiting list", () => decide("tariq", "waitlist"), "waitlisted"],
      ["annotated, with a group preferred", () => annotate("tariq", { reviewerNotes: "Keen.", reviewerPreferredGroupId: GROUP.monday }), "waitlisted"],
      ["accepted again", () => decide("tariq", "accept"), "accepted"],
      ["rejected", () => decide("tariq", "reject"), "rejected"],
      ["accepted after that", () => decide("tariq", "accept"), "accepted"],
    ];
    for (const [what, act, status] of steps) {
      const answer = await act();
      assert.equal(answer.status, 200, `${what}: ${answer.body?.error}`);
      assert.equal(world.db.read(rowPath("tariq")).status, status, what);
      assert.deepEqual(await me("tariq"), [], `${what}: the member area announces it`);
    }
    // And nobody was written to about any of it: a row from the form carries no address.
    await new Promise((done) => setImmediate(done));
    assert.equal(world.mail.length, 0);
  });

  test("a status the run's own form would announce is announced for nobody from the form", async () => {
    await press();
    // Written straight to the store, so this does not depend on what the page offers today.
    for (const status of ["accepted", "waitlisted", "pending", "rejected", "withdrawn"]) {
      world.db.poke(rowPath("amara"), { status });
      assert.deepEqual(await me("amara"), [], status);
    }
  });

  test("a place given back changes nothing here: nothing was said before, and nothing is said after", async () => {
    await press();
    assert.deepEqual(await me("tariq"), []);
    assert.equal((await reply("tariq", { reply: "cant-make-it", reason: { kind: "times", other: "" } })).status, 200);
    assert.deepEqual(await me("tariq"), []);
    assert.equal((await reply("amara", { reply: "coming" })).status, 200);
    assert.deepEqual(await me("amara"), []);
  });

  test("somebody who applied to the run itself reads the card they always did", async () => {
    await press();
    world.db.seed(rowPath("nobody"), ownRow("nobody", "accepted"));
    world.db.seed(rowPath("omar"), ownRow("omar", "waitlisted"));
    const [offered] = await me("nobody");
    const [waiting] = await me("omar");
    assert.deepEqual([offered.runId, offered.membership, offered.roles], [RUN.agi, "offered", []]);
    assert.deepEqual([waiting.runId, waiting.membership, waiting.roles], [RUN.agi, "waitlisted", []]);
    assert.ok(card(offered).includes("Place offered"));
    assert.ok(card(waiting).includes("Waitlisted"));
    // The same rows with the form's mark on them say nothing.
    for (const who of ["nobody", "omar"]) {
      world.db.poke(rowPath(who), { fromForm: world.db.read(rowPath("amara")).fromForm });
      assert.deepEqual(await me(who), [], who);
    }
  });
});

// ---------------------------------------------------------------------------
// Nothing of the application is read
// ---------------------------------------------------------------------------

describe("the member area reads nothing of the application form", () => {
  /** Every collection one read of the member area opens, in order. */
  async function collectionsRead(who, options) {
    const reads = [];
    const collection = world.courseDb.collection;
    world.courseDb.collection = (path) => {
      reads.push(path);
      return collection(path);
    };
    try {
      await me(who, options);
    } finally {
      world.courseDb.collection = collection;
    }
    return reads;
  }

  test("it opens the collections it always did, and none of the application system's", async () => {
    await press();
    await place("zach", [{ uid: "dev", groupId: GROUP.monday }]);
    for (const who of ["amara", "dev", "nobody"]) {
      const reads = await collectionsRead(who);
      assert.ok(reads.includes("courseApplications") && reads.includes("courseEnrolments"), who);
      for (const path of reads) {
        assert.ok(!/^admission/.test(path), `${who}: the member area read ${path}`);
        assert.ok(["courseEnrolments", "courseRuns", "courseApplications", "courseGroups"].includes(path), `${who}: ${path}`);
      }
    }
  });

  test("in a view-as session it reads what it reads for the member, and answers the same", async () => {
    await press();
    await place("zach", [{ uid: "dev", groupId: GROUP.monday }]);
    for (const who of ["amara", "dev"]) {
      const own = await collectionsRead(who);
      const borrowed = await collectionsRead(who, { viewAs: true });
      assert.deepEqual(borrowed, own, who);
      assert.deepEqual(await me(who, { viewAs: true }), await me(who), who);
    }
  });

  test("the route asks nothing of the application system, and passes a row from the form over before its status", () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "api", "courses", "me", "route.ts");
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    assert.deepEqual(imports.filter((from) => /applications\//.test(from) || /impersonation/.test(from)), []);
    const passedOver = code.indexOf("if (app.fromForm !== null) continue;");
    const status = code.indexOf('if (app.status !== "accepted" && app.status !== "waitlisted") continue;');
    assert.ok(passedOver !== -1 && status !== -1 && passedOver < status, "the status of a row from the form is looked at");
    // Nothing a row from the form carries is sent on: the payload has no field for it.
    assert.ok(!/viaForm|fromForm\s*:/.test(code), "the hub is sent where a row came from");
  });
});

// ---------------------------------------------------------------------------
// Then their group
// ---------------------------------------------------------------------------

describe("once an admin puts them in a group, the run and the group show", () => {
  test("before Publish and after it, and the run opens to them", async () => {
    await press();
    await place("zach", [
      { uid: "amara", groupId: GROUP.thursday },
      { uid: "dev", groupId: GROUP.monday },
      { uid: "bea", groupId: GROUP.monday },
      { uid: "tariq", groupId: GROUP.thursday },
    ]);
    const before = await me("amara");
    assert.equal(before.length, 1);
    assert.deepEqual(
      [before[0].runId, before[0].membership, before[0].roles, before[0].groupName, before[0].courseTitle],
      [RUN.agi, "enrolled", ["learner"], "Thursday morning", "AGI Strategy Fellowship"],
    );
    assert.equal(world.mail.length, 0, "nobody has been emailed yet");
    const admitted = await access("amara");
    assert.deepEqual([admitted.canLearn, admitted.isEnrolled, admitted.run.id], [true, true, RUN.agi]);

    const published = await publish();
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.deepEqual(await me("amara"), before, "Publish changed what the member area lists");
    assert.equal((await access("amara")).canLearn, true);
  });

  test("the card is the one anybody in a group reads, with none of the run's own form's words", async () => {
    await press();
    await place("zach", [{ uid: "amara", groupId: GROUP.thursday }]);
    const [entry] = await me("amara");
    assert.deepEqual(Object.keys(entry).sort(), Object.keys((await memberOfTheRunItself())).sort(), "a field only somebody from the form is sent");
    const html = card(entry);
    assert.ok(html.includes("Learner") && html.includes("Thursday morning"), html);
    assert.ok(html.includes(`href="/learn/${RUN.agi}"`), html);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), OLDER_FORMS_WORDS);
    // The words this file looks for are the run's own form's, so the search is not empty.
    assert.match(card({ ...entry, roles: [], membership: "offered", groupName: null }), OLDER_FORMS_WORDS);
    assert.match(card({ ...entry, roles: [], membership: "waitlisted", groupName: null }), OLDER_FORMS_WORDS);

    /** What somebody who applied to the run itself and was placed is sent, for its shape. */
    async function memberOfTheRunItself() {
      world.db.seed(rowPath("nobody"), ownRow("nobody", "accepted"));
      await place("zach", [{ uid: "nobody", groupId: GROUP.monday }]);
      const [own] = await me("nobody");
      assert.equal(own.membership, "enrolled");
      return own;
    }
  });

  test("somebody not yet in a group still reads nothing, beside people who are", async () => {
    await press();
    await place("zach", [{ uid: "amara", groupId: GROUP.thursday }]);
    assert.equal((await me("amara")).length, 1);
    for (const who of ["dev", "bea", "tariq"]) {
      assert.deepEqual(await me(who), [], who);
      assert.equal((await access(who)).canLearn, false, who);
    }
  });

  test("once somebody is in a group they are on the run, whatever they reply later", async () => {
    await press();
    await place("zach", [{ uid: "tariq", groupId: GROUP.monday }]);
    await reply("tariq", { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    const shown = await me("tariq");
    assert.deepEqual([shown.length, shown[0].membership, shown[0].groupName], [1, "enrolled", "Monday evening"]);
  });

  test("when the form has been destroyed: nothing until they are placed, and their group once they are", async () => {
    await press();
    await place("zach", [{ uid: "dev", groupId: GROUP.monday }]);
    for (const path of world.db.paths()) {
      const [collection, id, more] = path.split("/");
      if (more === undefined && ["admissionRounds", "admissionApplications", "admissionDecisions"].includes(collection)) {
        await world.db.collection(collection).doc(id).delete();
      }
    }
    // The rows a hand-over wrote stay on the run, and still say nothing by themselves.
    assert.equal(world.db.read(rowPath("amara")).status, "accepted");
    assert.deepEqual(await me("amara"), []);
    const [placed] = await me("dev");
    assert.deepEqual([placed.membership, placed.groupName], ["enrolled", "Monday evening"]);
    // And the board can still place the rest.
    await place("zach", [{ uid: "amara", groupId: GROUP.thursday }]);
    assert.equal((await me("amara"))[0].groupName, "Thursday morning");
  });
});
