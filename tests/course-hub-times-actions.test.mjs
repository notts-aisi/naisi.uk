/**
 * The Times view's two writes (board st-times, Q2 option B): a group's day
 * and start ("Change", and "Use for a group" on a group that exists), and a
 * new group ("Add a group", and "Use for a group" for a new one), as every
 * kind of caller, before Publish and after it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT  /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/time
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/groups
 *   src/lib/courses/groupTimes/
 *
 * ## What this guards
 *
 *  1. WHO: the programme's lead and admins act, and nobody else does (C7,
 *     2b): not another programme's lead, not the programme's reviewer, not
 *     the run's track lead, not a facilitator, not a member, not somebody
 *     signed out, not a view-as session. Every refusal writes nothing.
 *  2. THE BODY IS READ FIRST: a body that is not a time, a day, a name or a
 *     length is a 400 with a sentence, before any document is read.
 *  3. BEFORE PUBLISH HAS TOLD ANYBODY, CHANGE JUST CHANGES IT: the day and the
 *     start, and nothing else of the group (its length, room, link and
 *     facilitators stay). A dialog opened on another time is refused, and a
 *     change to the time it already has writes nothing.
 *  4. AFTER PUBLISH HAS TOLD SOMEBODY, IT IS REFUSED, pointing to Change a
 *     session: somebody placed in the group and emailed, or one of its
 *     facilitators emailed "You’re facilitating" (even once everybody told
 *     has moved out). A group nobody has been told of still changes. A press
 *     of Publish landing between the read and the write is caught.
 *  5. ADD A GROUP: the run editor's own shape, a length the picture can
 *     count, places a group may have, a name the run does not have yet, and
 *     no more groups than the board reads. Before and after Publish alike:
 *     nobody has been told of a group that did not exist.
 *  6. NOBODY IS EMAILED by either.
 *
 * Real: both routes, the gate (`loadProgrammeRun`), the libraries under them,
 * and #67's hand-over, board, allocate and Publish routes, which make the
 * world they are pressed in. Faked: see `tests/lib/handoverWorld.mjs`.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AGI,
  COURSE,
  GROUP,
  RUN,
  TAIS,
  applicationPath,
  groupDoc,
  loadJoin,
  makeWorld,
  namedSeed,
  programmeParams,
} from "./lib/handoverWorld.mjs";

/** A stylesheet as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const HANDLE = 'globalThis["__hubTimesActions"]';
/**
 * The Times view's page and controls, drawn on the server: Next's link and
 * router, the dialogs' frame (drawn open, with its title, its fields and
 * its buttons) and every stylesheet stood in. The rest is real.
 */
const UI_STUBS = [
  [
    "next/navigation",
    "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }\n" +
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }",
  ],
  ["next/link", `export default ({ href, className, children }) => ${HANDLE}.h('a', { href, className }, children);`],
  [
    "@/features/applications/editor/controls",
    `export function DialogFrame({ title, children, actions }) { const h = ${HANDLE}.h; return h('section', { 'data-dialog': title }, h('h2', null, title), children, h('footer', null, actions)); }`,
  ],
  ["./TimesPicture.module.css", CLASS_NAMES],
  ["./Select.module.css", CLASS_NAMES],
  ["@/features/applications/kit/kit.module.css", CLASS_NAMES],
  ["@/features/applications/editor/editor.module.css", CLASS_NAMES],
];

const made = makeWorld("__hubTimesActions", UI_STUBS);
const { world, reset, call, everything, formRoute } = made;
world.h = createElement;
const { press, place, publish } = await loadJoin(made);

const timeRoute = await formRoute("programmes", "[programmeId]", "groups", "[groupId]", "time");
const addRoute = await formRoute("programmes", "[programmeId]", "groups");
const words = await made.lib("courses", "groupTimes", "words.ts");
const rules = await made.lib("courses", "groupTimes", "rules.ts");
const { loadTimesPicture } = await made.lib("applications", "handover", "timesLoad.ts");
const { default: TimesPicture } = await made.loadTs(join("features", "applications", "times", "TimesPicture.tsx"));
const controls = await made.loadTs(join("features", "applications", "times", "TimesActions.tsx"));

/** A group's document as it is stored now. */
const group = (id) => world.db.read(`courseGroups/${id}`);

/** "Change": a group's day and start, from the slot the dialog was opened on. */
function change(who, groupId, to, from, options = {}) {
  return call(who, timeRoute.PUT, { ...programmeParams(options.programmeId ?? AGI), groupId }, {
    body: { weekday: to.weekday, start: to.start, from: { weekday: from.weekday, start: from.start } },
    viewAs: options.viewAs,
  });
}

/** Monday evening's own slot, as the dialog shows it when opened. */
const MONDAY = { weekday: 1, start: "18:00" };
const TUESDAY_7PM = { weekday: 2, start: "7pm" };

/** "Add a group". */
function add(who, body, options = {}) {
  return call(who, addRoute.POST, programmeParams(options.programmeId ?? AGI), { body, viewAs: options.viewAs });
}

const NEW_GROUP = { name: "Tuesday evening", weekday: 2, start: "19:00", minutes: 90, places: 8 };

/** The groups of the AGI run, by id. */
const groupsOnTheRun = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseGroups/") && world.db.read(path).runId === RUN.agi)
    .map((path) => path.slice("courseGroups/".length))
    .sort();

/** Hand AGI Strategy's people over and place them, the way an admin does. */
async function placed(placements) {
  const handed = await press("zach");
  assert.equal(handed.status, 200, JSON.stringify(handed.body));
  const answer = await place("zach", placements);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.placed, placements.length, JSON.stringify(answer.body));
}

/** Everybody who holds a place on AGI Strategy, placed in one group: Publish waits for all of them. */
const everybodyIn = (groupId) => ["amara", "bea", "dev", "tariq"].map((uid) => ({ uid, groupId }));

/** Publish, as the board presses it: the test first, then the press with its count. */
async function published(who = "zach") {
  const answer = await publish(who);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
}

beforeEach(() => {
  reset(namedSeed());
});

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. the programme's lead and admins act, and nobody else does", () => {
  test("Change: an admin and the lead change it; everybody else is refused and nothing is written", async () => {
    const answers = {};
    for (const who of ["tess", "lloyd", "yusuf", "amara", "nobody", null]) {
      const before = everything();
      const answer = await change(who, GROUP.monday, TUESDAY_7PM, MONDAY);
      answers[who ?? "signed out"] = [answer.status, answer.body.error];
      assert.equal(everything(), before, `${who}'s refused change wrote something`);
    }
    assert.deepEqual(answers, {
      // Leads Technical AI Safety: no role on AGI Strategy.
      tess: [404, "That programme is not on this form."],
      // Reviews AGI Strategy: told who may.
      lloyd: [403, "Only the programme’s lead and admins can change a group’s time."],
      // The run's track lead, named on nothing on the form.
      yusuf: [404, "That programme is not on this form."],
      amara: [404, "That programme is not on this form."],
      nobody: [404, "That programme is not on this form."],
      "signed out": [401, "Not signed in"],
    });

    const asLead = await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY);
    assert.equal(asLead.status, 200, JSON.stringify(asLead.body));
    assert.deepEqual([group(GROUP.monday).session.weekday, group(GROUP.monday).session.startTimeLocal], [2, "19:00"]);
    const asAdmin = await change("zach", GROUP.monday, MONDAY, { weekday: 2, start: "19:00" });
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
    assert.deepEqual([group(GROUP.monday).session.weekday, group(GROUP.monday).session.startTimeLocal], [1, "18:00"]);
  });

  test("Change: a facilitator of the group is refused, as is the lead of another programme for its own programme's run", async () => {
    world.db.poke(`courseGroups/${GROUP.thursday}`, { facilitatorUids: ["nobody"] });
    const before = everything();
    const facilitator = await change("nobody", GROUP.thursday, TUESDAY_7PM, { weekday: 4, start: "10:00" });
    assert.deepEqual([facilitator.status, facilitator.body.error], [404, "That programme is not on this form."]);
    // Tess leads Technical AI Safety, which names no run here: she is told so,
    // and cannot reach AGI Strategy's group through her own programme.
    const otherLead = await change("tess", GROUP.monday, TUESDAY_7PM, MONDAY, { programmeId: TAIS });
    assert.deepEqual(
      [otherLead.status, otherLead.body.error],
      [409, "This programme doesn’t name a course run yet, so it has no groups."],
    );
    assert.equal(everything(), before);
  });

  test("Add a group: an admin and the lead add one; everybody else is refused and nothing is written", async () => {
    world.db.poke(`courseGroups/${GROUP.thursday}`, { facilitatorUids: ["nobody"] });
    const answers = {};
    for (const who of ["tess", "lloyd", "yusuf", "amara", "nobody", null]) {
      const before = everything();
      const answer = await add(who, NEW_GROUP);
      answers[who ?? "signed out"] = [answer.status, answer.body.error];
      assert.equal(everything(), before, `${who}'s refused group wrote something`);
    }
    assert.deepEqual(answers, {
      tess: [404, "That programme is not on this form."],
      lloyd: [403, "Only the programme’s lead and admins can add a group."],
      yusuf: [404, "That programme is not on this form."],
      amara: [404, "That programme is not on this form."],
      nobody: [404, "That programme is not on this form."],
      "signed out": [401, "Not signed in"],
    });
    const asLead = await add("claudia", NEW_GROUP);
    assert.equal(asLead.status, 200, JSON.stringify(asLead.body));
    const asAdmin = await add("zach", { ...NEW_GROUP, name: "Wednesday evening", weekday: 3 });
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
    assert.equal(groupsOnTheRun().length, 5);
  });

  test("a view-as session is turned away before anything, by both", async () => {
    const before = everything();
    assert.equal((await change("zach", GROUP.monday, TUESDAY_7PM, MONDAY, { viewAs: true })).status, 403);
    assert.equal((await add("zach", NEW_GROUP, { viewAs: true })).status, 403);
    assert.equal(everything(), before);
  });

  test("a lead who no longer stands is refused as anybody else", async () => {
    world.db.poke("users/claudia", { suRecognised: false });
    const answer = await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY);
    assert.equal(answer.status, 404, JSON.stringify(answer.body));
    assert.equal((await add("claudia", NEW_GROUP)).status, 404);
  });
});

// ---------------------------------------------------------------------------
// 2. The body first
// ---------------------------------------------------------------------------

describe("2. a body that is not a request is a sentence, before anything is read", () => {
  test("Change", async () => {
    const cases = [
      [null, words.REFUSAL.body],
      [{ weekday: 7, start: "6pm", from: { weekday: 1, start: "18:00" } }, words.REFUSAL.weekday],
      [{ weekday: 2, start: "6", from: { weekday: 1, start: "18:00" } }, words.REFUSAL.start],
      [{ weekday: 2, start: "25:00", from: { weekday: 1, start: "18:00" } }, words.REFUSAL.start],
      [{ weekday: 2, start: "6pm" }, words.REFUSAL.from],
      [{ weekday: 2, start: "6pm", from: { weekday: 1, start: "teatime" } }, words.REFUSAL.from],
    ];
    for (const [body, error] of cases) {
      const reads = world.db.stats.reads;
      const answer = await call("claudia", timeRoute.PUT, { ...programmeParams(AGI), groupId: GROUP.monday }, { body });
      assert.deepEqual([answer.status, answer.body.error], [400, error], JSON.stringify(body));
      assert.equal(world.db.stats.reads, reads, `${JSON.stringify(body)} was read past`);
    }
  });

  test("Add a group", async () => {
    const cases = [
      [null, words.REFUSAL.body],
      [{ ...NEW_GROUP, name: "   " }, words.REFUSAL.name],
      [{ ...NEW_GROUP, name: "x".repeat(81) }, words.REFUSAL.nameLong],
      [{ ...NEW_GROUP, weekday: -1 }, words.REFUSAL.weekday],
      [{ ...NEW_GROUP, start: "noon" }, words.REFUSAL.start],
      [{ ...NEW_GROUP, minutes: 0 }, words.REFUSAL.length],
      [{ ...NEW_GROUP, minutes: 90.5 }, words.REFUSAL.length],
      [{ ...NEW_GROUP, places: 7.5 }, words.REFUSAL.places],
      [{ ...NEW_GROUP, places: "8" }, words.REFUSAL.places],
    ];
    for (const [body, error] of cases) {
      const reads = world.db.stats.reads;
      const answer = await add("claudia", body);
      assert.deepEqual([answer.status, answer.body.error], [400, error], JSON.stringify(body));
      assert.equal(world.db.stats.reads, reads, `${JSON.stringify(body)} was read past`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Before Publish has told anybody
// ---------------------------------------------------------------------------

describe("3. before Publish has told anybody, Change changes the day and the start and nothing else", () => {
  test("the day and the start move; the length, room, link, facilitators and weeks of its own stay", async () => {
    world.db.poke(`courseGroups/${GROUP.monday}`, { sessionOverrides: { w02: { location: "Room C1" } } });
    const was = group(GROUP.monday);
    await placed([{ uid: "amara", groupId: GROUP.monday }]);
    const answer = await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, {
      ok: true,
      changed: true,
      groupId: GROUP.monday,
      groupName: "Monday evening",
      meets: "Tuesdays at 7pm",
      message: "Monday evening now meets on Tuesdays at 7pm.",
    });
    const now = group(GROUP.monday);
    assert.deepEqual(now.session, { ...was.session, weekday: 2, startTimeLocal: "19:00" });
    for (const field of ["name", "capacity", "facilitatorUids", "memberCount", "sessionOverrides", "archived"]) {
      assert.deepEqual(now[field], field === "memberCount" ? 1 : was[field], field);
    }
    assert.equal(world.mail.length, 0, "a change emailed somebody");
  });

  test("a group with no time yet is given one", async () => {
    const answer = await change("claudia", GROUP.unset, { weekday: 3, start: "6:30pm" }, { weekday: 2, start: "" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([group(GROUP.unset).session.weekday, group(GROUP.unset).session.startTimeLocal], [3, "18:30"]);
  });

  test("a dialog opened on another time is refused, and nothing is written", async () => {
    const before = everything();
    const answer = await change("claudia", GROUP.monday, TUESDAY_7PM, { weekday: 1, start: "19:00" });
    assert.deepEqual([answer.status, answer.body.error], [409, words.REFUSAL.stale]);
    assert.equal(everything(), before);
  });

  test("the time it already has writes nothing and says so", async () => {
    const before = everything();
    const answer = await change("claudia", GROUP.monday, { weekday: 1, start: "6pm" }, MONDAY);
    assert.equal(answer.status, 200);
    assert.equal(answer.body.changed, false);
    assert.equal(everything(), before);
  });

  test("a group of another run, an archived group and one that is not there are refused", async () => {
    world.db.seed("courseGroups/tais-group__grp00009", groupDoc({ runId: RUN.tais, courseId: COURSE.tais, name: "TAIS" }));
    world.db.poke(`courseGroups/${GROUP.thursday}`, { archived: true });
    const before = everything();
    const other = await change("zach", "tais-group__grp00009", TUESDAY_7PM, MONDAY);
    assert.deepEqual([other.status, other.body.error], [404, words.REFUSAL.noGroup]);
    const archived = await change("zach", GROUP.thursday, TUESDAY_7PM, { weekday: 4, start: "10:00" });
    assert.deepEqual([archived.status, archived.body.error], [409, words.REFUSAL.archived]);
    const missing = await change("zach", "not-a-group__grp00000", TUESDAY_7PM, MONDAY);
    assert.deepEqual([missing.status, missing.body.error], [404, words.REFUSAL.noGroup]);
    assert.equal(everything(), before);
  });

  test("a programme with no run, and a run that has gone, say so", async () => {
    const stored = world.db.read(`courseRuns/${RUN.agi}`);
    await world.db.collection("courseRuns").doc(RUN.agi).delete();
    const gone = await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY);
    assert.deepEqual([gone.status, gone.body.error], [409, words.REFUSAL.runGone]);
    world.db.seed(`courseRuns/${RUN.agi}`, { ...stored, destroying: true });
    const destroying = await add("claudia", NEW_GROUP);
    assert.deepEqual([destroying.status, destroying.body.error], [409, words.REFUSAL.runGone]);
  });
});

// ---------------------------------------------------------------------------
// 4. After Publish has told somebody
// ---------------------------------------------------------------------------

describe("4. once Publish has told somebody when a group meets, its time is not changed here", () => {
  test("a group whose people Publish told is refused, pointing to Change a session; one nobody was told of still changes", async () => {
    await placed(everybodyIn(GROUP.monday));
    await published("zach");
    assert.ok(world.db.read(`courseEnrolments/${RUN.agi}__amara`).allocatedEmailAt, "Publish did not tell Amara");
    for (const who of ["claudia", "zach"]) {
      const before = everything();
      const told = await change(who, GROUP.monday, TUESDAY_7PM, MONDAY);
      assert.deepEqual(
        [told.status, told.body.error],
        [
          409,
          "Publish has told people when Monday evening meets, so its time can’t change here. To move one week’s session, use Change a session.",
        ],
        who,
      );
      assert.equal(everything(), before);
    }
    // Thursday morning has nobody in it, so Publish has told nobody its time.
    const untold = await change("claudia", GROUP.thursday, TUESDAY_7PM, { weekday: 4, start: "10:00" });
    assert.equal(untold.status, 200, JSON.stringify(untold.body));
  });

  test("a group whose facilitator Publish told stays told after everybody told in it has moved out", async () => {
    world.db.poke(`courseGroups/${GROUP.monday}`, { facilitatorUids: ["nobody"] });
    await placed(everybodyIn(GROUP.monday));
    await published("zach");
    assert.ok(
      world.db.read(`courseNudges/facilitating__${RUN.agi}__${GROUP.monday}__nobody`),
      "Publish did not tell the facilitator",
    );
    // Everybody moves to Thursday: each stamp goes with its move.
    const moved = await place("claudia", everybodyIn(GROUP.thursday));
    assert.equal(moved.body.placed, 4, JSON.stringify(moved.body));
    for (const uid of ["amara", "bea", "dev", "tariq"]) {
      assert.equal(world.db.read(`courseEnrolments/${RUN.agi}__${uid}`).allocatedEmailAt, undefined, uid);
    }
    const answer = await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    // Taken off the group, the facilitator is told nothing more of it, and nobody else was told.
    world.db.poke(`courseGroups/${GROUP.monday}`, { facilitatorUids: [] });
    assert.equal((await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY)).status, 200);
  });

  test("somebody told who has left the group's run is told nothing more about it", async () => {
    await placed(everybodyIn(GROUP.monday));
    await published("zach");
    assert.equal((await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY)).status, 409);
    // Monday's one facilitator is the programme's lead, whom Publish never
    // writes "You’re facilitating" to: once everybody told has left, nobody
    // still on the run was told its time.
    for (const uid of ["amara", "bea"]) world.db.poke(`courseEnrolments/${RUN.agi}__${uid}`, { status: "withdrawn" });
    for (const uid of ["dev", "tariq"]) world.db.poke(`courseEnrolments/${RUN.agi}__${uid}`, { status: "removed" });
    assert.equal((await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY)).status, 200);
  });

  test("a press of Publish that lands between the read and the write is caught, and nothing is written", async () => {
    await placed([{ uid: "amara", groupId: GROUP.monday }]);
    const before = everything();
    // Publish tells Amara while the change is deciding: the transaction reads again.
    world.db.beforeCommit = () => world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { allocatedEmailAt: new Date() });
    const answer = await change("claudia", GROUP.monday, TUESDAY_7PM, MONDAY);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.equal(group(GROUP.monday).session.startTimeLocal, "18:00");
    assert.notEqual(everything(), before, "the stand-in for Publish wrote nothing");
  });
});

// ---------------------------------------------------------------------------
// 5. Add a group
// ---------------------------------------------------------------------------

describe("5. Add a group: the run editor's own shape, and only what a group may be", () => {
  test("the new group is the run editor's: nobody in it, no facilitator, no room, its own length and places", async () => {
    const answer = await add("claudia", NEW_GROUP);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const { groupId } = answer.body;
    assert.match(groupId, /^autumn-2026-tuesday-evening__[a-z0-9]{8}$/);
    assert.deepEqual(answer.body, {
      ok: true,
      groupId,
      groupName: "Tuesday evening",
      meets: "Tuesdays at 7pm",
      message: "Tuesday evening is added. It meets on Tuesdays at 7pm.",
    });
    const stored = group(groupId);
    assert.deepEqual(Object.keys(stored).sort(), [
      "archived",
      "capacity",
      "courseId",
      "createdAt",
      "facilitatorUids",
      "memberCount",
      "name",
      "runId",
      "session",
      "sessionOverrides",
      "updatedAt",
    ]);
    assert.deepEqual(
      { ...stored, createdAt: null, updatedAt: null },
      {
        runId: RUN.agi,
        courseId: COURSE.agi,
        name: "Tuesday evening",
        facilitatorUids: [],
        capacity: 8,
        memberCount: 0,
        session: { weekday: 2, startTimeLocal: "19:00", durationMinutes: 90, location: "", meetingUrl: null, notes: "" },
        sessionOverrides: {},
        archived: false,
        createdAt: null,
        updatedAt: null,
      },
    );
    assert.ok(stored.createdAt instanceof Date && stored.updatedAt instanceof Date);
    assert.equal(world.mail.length, 0);
  });

  test("a length is one the group editor offers or one the run's groups have", async () => {
    world.db.poke(`courseGroups/${GROUP.thursday}`, { "session.durationMinutes": 75 });
    for (const minutes of [60, 75, 90, 120]) {
      const answer = await add("claudia", { ...NEW_GROUP, name: `Group of ${minutes}`, minutes });
      assert.equal(answer.status, 200, `${minutes}: ${JSON.stringify(answer.body)}`);
    }
    const before = everything();
    const odd = await add("claudia", { ...NEW_GROUP, name: "Odd", minutes: 45 });
    assert.deepEqual([odd.status, odd.body.error], [400, words.REFUSAL.length]);
    assert.equal(everything(), before);
  });

  test("places: none is no limit, and a group never holds more than a register can", async () => {
    const none = await add("claudia", { ...NEW_GROUP, places: null });
    assert.equal(none.status, 200);
    assert.equal(group(none.body.groupId).capacity, null);
    let before = everything();
    for (const places of [0, 41]) {
      const answer = await add("claudia", { ...NEW_GROUP, name: `Places ${places}`, places });
      assert.equal(answer.status, 400, JSON.stringify(answer.body));
      assert.equal(answer.body.error, rules.placesProblem(places, "admissions"));
    }
    assert.equal(rules.placesProblem(0, "admissions"), words.REFUSAL.places);
    assert.equal(everything(), before);
    // A run people join by themselves needs a number on every group.
    world.db.poke(`courseRuns/${RUN.agi}`, { enrolMode: "open" });
    before = everything();
    const open = await add("claudia", { ...NEW_GROUP, name: "Open", places: null });
    assert.deepEqual([open.status, open.body.error], [400, rules.placesProblem(null, "open")]);
    assert.equal(everything(), before);
  });

  test("a name the run's live groups have is refused, whatever its case and spacing; an archived group's is free", async () => {
    const before = everything();
    const taken = await add("claudia", { ...NEW_GROUP, name: "  monday   EVENING " });
    assert.deepEqual([taken.status, taken.body.error], [409, words.nameTakenWords("monday EVENING")]);
    assert.equal(everything(), before);
    world.db.poke(`courseGroups/${GROUP.monday}`, { archived: true });
    assert.equal((await add("claudia", { ...NEW_GROUP, name: "Monday evening" })).status, 200);
  });

  test("a run with as many groups as the board reads takes no more", async () => {
    for (let n = groupsOnTheRun().length; n < rules.MAX_GROUPS_PER_RUN; n += 1) {
      world.db.seed(`courseGroups/filler-${n}__grp${String(n).padStart(5, "0")}`, groupDoc({ name: `Filler ${n}`, archived: true }));
    }
    const before = everything();
    const answer = await add("claudia", NEW_GROUP);
    assert.deepEqual([answer.status, answer.body.error], [409, words.REFUSAL.tooMany]);
    assert.equal(everything(), before);
  });

  test("after Publish a group is still added: nobody has been told of a group that did not exist", async () => {
    await placed(everybodyIn(GROUP.monday));
    await published("zach");
    const answer = await add("claudia", NEW_GROUP);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    // And its time changes, as nobody is told of it until Publish is pressed again.
    const moved = await change("claudia", answer.body.groupId, { weekday: 3, start: "7pm" }, { weekday: 2, start: "19:00" });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
  });
});

// ---------------------------------------------------------------------------
// 6. The rules, as pure functions the dialogs ask too
// ---------------------------------------------------------------------------

describe("6. the suggestions the dialogs make come from the run's own groups", () => {
  test("the next group's name follows Group A to D, and is left to the lead otherwise", () => {
    assert.equal(rules.nextGroupName(["Group A", "Group B", "Group D", "Group C"]), "Group E");
    assert.equal(rules.nextGroupName(["group a"]), "Group B");
    assert.equal(rules.nextGroupName(["Group A", "Tuesday evening"]), "");
    assert.equal(rules.nextGroupName(["Group Z"]), "");
    assert.equal(rules.nextGroupName([]), "");
  });

  test("places are suggested only when every group has the same", () => {
    assert.equal(rules.sharedPlaces([8, 8, 8]), 8);
    assert.equal(rules.sharedPlaces([8, 6]), null);
    assert.equal(rules.sharedPlaces([null, null]), null);
    assert.equal(rules.sharedPlaces([]), null);
  });
});

// ---------------------------------------------------------------------------
// 7. The page hands its controls what the records say, and each dialog says it
// ---------------------------------------------------------------------------

/** Every element of a tree whose type is `type`, depth first. */
function findAll(node, type, out = []) {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, type, out);
    return out;
  }
  if (node.type === type) out.push(node);
  const children = node.props?.children;
  if (children !== undefined) findAll(children, type, out);
  // A server component's own output is not in the tree until it is called.
  if (typeof node.type === "function" && node.type !== type && !node.type.prototype?.isReactComponent) {
    try {
      const drawn = node.type(node.props);
      if (drawn && typeof drawn.then !== "function") findAll(drawn, type, out);
    } catch {
      // A client component's hooks cannot run outside a render: it is a leaf here.
    }
  }
  return out;
}

/** The setup the Times view hands its controls, as `who` opens it. */
async function setupFor(who) {
  const outcome = await loadTimesPicture(world.db, made.sessionOf(who), "autumn-2026__sm4llt3rm", AGI, undefined);
  assert.equal(outcome.status, "ok", JSON.stringify(outcome));
  const tree = TimesPicture({ view: outcome.view, views: null });
  const [provider] = findAll(tree, controls.TimesActionsProvider);
  assert.ok(provider, "the picture hands its controls nothing");
  return provider.props.setup;
}

/** One dialog drawn open inside the controls' own provider: its words, in order. */
function dialogText(setup, Dialog, props) {
  const html = renderToStaticMarkup(
    createElement(controls.TimesActionsProvider, { setup }, createElement(Dialog, { ...props, close() {} })),
  );
  return {
    html,
    text: html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

describe("7. the page hands its controls what the records say, and each dialog says it", () => {
  test("before Publish: every group can change, and a new group is offered the run's lengths, the counted one first in mind", async () => {
    await placed([{ uid: "amara", groupId: GROUP.monday }]);
    for (const who of ["claudia", "zach"]) {
      const setup = await setupFor(who);
      assert.deepEqual(
        setup.groups.map((each) => [each.name, each.weekday, each.start, each.minutes, each.told]),
        [
          ["Monday evening", 1, "18:00", 90, false],
          ["To be arranged", 2, "", 90, false],
          ["Thursday morning", 4, "10:00", 90, false],
        ],
        who,
      );
      assert.deepEqual([setup.lengths, setup.counted, setup.nextName, setup.places], [[60, 90, 120], 90, "", 8], who);
      // Numbers only: the picture's counts, and never anybody's week.
      assert.deepEqual(Object.keys(setup.counts).sort(), ["cells", "minutes", "rows", "said"]);
      assert.doesNotMatch(JSON.stringify(setup), /[0-9a-f]{12}/, "a painted week reached the controls");
    }
  });

  test("nobody has said when they are free yet: the groups can still be given a time, or added, and nobody is counted", async () => {
    for (const uid of ["amara", "dev", "tariq"]) {
      world.db.poke(applicationPath(uid), { "sent.availability.days": ["", "", "", "", "", "", ""] });
    }
    const outcome = await loadTimesPicture(world.db, made.sessionOf("claudia"), "autumn-2026__sm4llt3rm", AGI, undefined);
    const html = renderToStaticMarkup(createElement(TimesPicture, { view: outcome.view, views: null }));
    const said = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    assert.match(
      said,
      /None of the 4 people holding a place have said when they’re free\. Your 3 groups Monday evening Mon 6pm Change To be arranged No session time set Change Thursday morning Thu 10am Change Add a group$/,
    );
    assert.ok(!html.includes("<table"), "a grid was drawn for nobody");
    assert.ok(!said.includes("can make it"), "a group's line counted somebody");
    assert.ok(!said.includes("Best times"));
  });

  test("a group with a start and no length yet is handed its start, so its Change is not refused as stale", async () => {
    world.db.poke(`courseGroups/${GROUP.thursday}`, { "session.durationMinutes": 0 });
    const setup = await setupFor("claudia");
    const thursday = setup.groups.find((each) => each.id === GROUP.thursday);
    assert.equal(thursday.start, "10:00");
    const answer = await change("claudia", GROUP.thursday, TUESDAY_7PM, { weekday: thursday.weekday, start: thursday.start });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  });

  test("after Publish: the told group is marked, its Change says why and links to Change a session, and Use for a group leaves it off", async () => {
    await placed(everybodyIn(GROUP.monday));
    await published("zach");
    const setup = await setupFor("claudia");
    assert.deepEqual(
      setup.groups.map((each) => [each.name, each.told]),
      [["Monday evening", true], ["To be arranged", false], ["Thursday morning", false]],
    );
    const monday = setup.groups.find((each) => each.id === GROUP.monday);
    const told = dialogText(setup, controls.ChangeDialog, { group: monday });
    assert.equal(
      told.text,
      "Change Monday evening’s time Publish has told people when Monday evening meets, so its time can’t change here. " +
        "To move one week’s session, use Change a session. Change a session Close",
    );
    assert.match(told.html, /href="\/admin\/admissions\/forms\/autumn-2026__sm4llt3rm\/programmes\/agi-strategy\/groups\/sessions"/);
    assert.doesNotMatch(told.html, /<input|<select/, "a told group's dialog offers a field");

    const use = dialogText(setup, controls.UseDialog, { weekday: 1, start: "19:00", when: "Mon 7pm" });
    assert.match(use.text, /^Use Mon 7pm for a group Which group To be arranged, no time yet Thursday morning, now Thu 10am A new group /);
    assert.ok(use.text.includes(words.TOLD_LEFT_OUT), use.text);
    // On a group with no time yet it changes that group's time; on a new group it adds one.
    assert.ok(use.text.includes(words.EMAILS_NOBODY), use.text);
    assert.ok(!use.text.includes("Monday evening"), "Use for a group offers a told group");
    // A group with no time yet is the one it starts on.
    assert.match(use.html, new RegExp(`checked="" value="${GROUP.unset}"`));
    assert.equal([...use.html.matchAll(/checked=""/g)].length, 1);
  });

  test("Change on a group nobody was told of: its day and start, how many can make it, and that it emails nobody", async () => {
    const setup = await setupFor("claudia");
    const monday = setup.groups.find((each) => each.id === GROUP.monday);
    const open = dialogText(setup, controls.ChangeDialog, { group: monday });
    assert.match(
      open.text,
      /^Change Monday evening’s time Day Monday Tuesday Wednesday Thursday Friday Saturday Sunday Starts at Like 6pm or 6:30pm\. 2 of 3 can make it /,
    );
    assert.ok(open.text.includes(words.EMAILS_NOBODY));
    assert.match(open.text, /Cancel Change the time$/);
    assert.match(open.html, /value="6pm"/);
    assert.match(open.html, /<option value="1" selected="">Monday<\/option>/);
    // The button is held while the day and start are the ones it has.
    assert.match(open.html, /<button type="button" class="primary" disabled="">Change the time<\/button>/);
  });

  test("Add a group starts on the best time no group meets at, with the name and places the run's groups suggest", async () => {
    for (const [id, name] of [[GROUP.monday, "Group A"], [GROUP.thursday, "Group B"], [GROUP.unset, "Group C"]]) {
      world.db.poke(`courseGroups/${id}`, { name });
    }
    const setup = await setupFor("zach");
    assert.deepEqual([setup.nextName, setup.places], ["Group D", 8]);
    const open = dialogText(setup, controls.AddDialog, { suggested: { weekday: 1, start: 17 * 60 } });
    assert.match(open.html, /<option value="1" selected="">Monday<\/option>/);
    assert.match(open.html, /value="5pm"/);
    assert.match(open.html, /value="Group D"/);
    assert.match(open.html, /value="8"/);
    assert.match(open.html, /<option value="90" selected="">90 minutes<\/option>/);
    assert.match(open.text, /1 of 3 can make it/);
    assert.ok(open.text.includes(words.ADDS_EMAILS_NOBODY), "a new group's dialog says what adding it does");
    assert.ok(!open.text.includes(words.EMAILS_NOBODY), "a new group's dialog talks of changing a time");
    assert.match(open.text, /Cancel Add the group$/);
  });
});
