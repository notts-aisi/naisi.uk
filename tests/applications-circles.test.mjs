/**
 * Circles, run for real through its routes: the run's groups as they are,
 * a suggestion over them, and "Apply N changes" sent through the site's own
 * routes.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET  /api/admissions/forms/[roundId]/programmes/[programmeId]/circles
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement
 *
 * ## The rules this guards
 *
 *  - ONLY AN ADMIN reads the circles, refused before anything is read, and
 *    the read writes nothing.
 *  - THE PEOPLE ARE THE RUN'S OWN LIST, as the allocate route places them:
 *    somebody holding a place who has not been handed over is named apart
 *    (`notOnList`), never offered as somebody to place. That was the
 *    `not-accepted` refusal of 29 October.
 *  - WHERE EACH PERSON SITS, whether Publish has told them, and who
 *    facilitates each group come from the run itself.
 *  - A SUGGESTION KEEPS EVERYBODY PLACED WHERE THEY ARE, and a told person
 *    even when the admin starts again.
 *  - APPLY SENDS ONLY THE DIFFERENCES: pressed once through the real routes,
 *    the run then matches the preview, and a second press would send
 *    nothing, a group the first press made included.
 *
 * Real: the routes, `src/lib/applications/arrange/`, the allocate, groups
 * and facilitators routes, and the screen's own reading of a preview
 * (`circlesModel.ts`). Faked: the store, the session, the view-as guard and
 * Claude, which is never asked here.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AGI, GROUP, RUN, loadJoin, makeWorld, namedSeed, programmeParams } from "./lib/handoverWorld.mjs";

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return true; }
export async function askClaudeForJson(input) {
  globalThis.__circlesClaude = true;
  (globalThis.__circlesAsked ??= []).push(input);
  return { ok: false, reason: "not here" };
}`;

const made = makeWorld("__circles", [["@/lib/ai/claude", CLAUDE_STUB]]);
const { world, reset, call, everything, formRoute, courseRoute, loadTs } = made;
const join = await loadJoin(made);
const circlesRoute = await formRoute("programmes", "[programmeId]", "circles");
const arrangementRoute = await formRoute("programmes", "[programmeId]", "arrangement");
const groupsRoute = await formRoute("programmes", "[programmeId]", "groups");
const timeRoute = await formRoute("programmes", "[programmeId]", "groups", "[groupId]", "time");
const facilitatorsRoute = await courseRoute("groups", "[groupId]", "facilitators");
const { changesBetween, placementOrder } = await loadTs("lib/applications/arrange/changes.ts");
const { draftOf, liveFacts } = await loadTs("features/applications/circles/circlesModel.ts");

const circles = async (who = "zach") => call(who, circlesRoute.GET, programmeParams(AGI));
const suggest = async (body = {}) =>
  call("zach", arrangementRoute.POST, programmeParams(AGI), { body: { askClaude: false, ...body } });
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;

beforeEach(() => {
  reset(namedSeed());
  globalThis.__circlesClaude = false;
  globalThis.__circlesAsked = [];
});

describe("who may read the circles", () => {
  test("nobody signed out, and nobody but an admin, before anything is read", async () => {
    assert.equal((await circles(null)).status, 401);
    for (const who of ["claudia", "yusuf", "lloyd", "amara"]) {
      const answer = await circles(who);
      assert.equal(answer.status, 403, who);
      assert.equal(answer.body.error, "Only an admin can open Circles.");
    }
  });

  test("an admin reads them, and nothing is written or asked of Claude", async () => {
    const before = everything();
    const answer = await circles();
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(everything(), before, "reading the circles wrote something");
    assert.equal(globalThis.__circlesClaude, false);
    const view = answer.body.circles;
    assert.equal(view.runId, RUN.agi);
    assert.equal(view.sent, true);
    // The run's groups, Monday first, the one with no time drawn without one.
    assert.deepEqual(
      view.groups.map((group) => [group.id, group.session?.startTimeLocal ?? null]),
      [
        [GROUP.monday, "18:00"],
        [GROUP.unset, null],
        [GROUP.thursday, "10:00"],
      ],
    );
    assert.deepEqual(view.groups[0].facilitators, [{ uid: "claudia", name: "Claudia", member: false }]);
  });
});

describe("the people are the run's own list", () => {
  test("before the hand-over nobody can be placed, and everybody holding a place is named apart", async () => {
    const { body } = await circles();
    assert.deepEqual(Object.keys(body.circles.people), []);
    assert.deepEqual(body.circles.notOnList.map((person) => person.uid).sort(), ["amara", "bea", "dev", "tariq"]);
  });

  test("after it, everybody handed over is on the screen, in no group yet", async () => {
    assert.equal((await join.press()).status, 200);
    const { body } = await circles();
    const { people, notOnList } = body.circles;
    assert.deepEqual(notOnList, []);
    assert.deepEqual(Object.keys(people).sort(), ["amara", "bea", "dev", "tariq"]);
    for (const person of Object.values(people)) {
      assert.equal(person.groupId, null);
      assert.equal(person.told, false);
    }
    // Their weeks reach the admin's chart; what each can make is the site's own reading.
    assert.deepEqual(body.circles.groups.find((group) => group.id === GROUP.monday).canMake, ["amara", "dev"]);
    assert.equal(people.bea.week.said, false);
  });

  test("where each sits, and whether Publish has told them, come from the run", async () => {
    await join.press();
    assert.deepEqual((await join.place("zach", [{ uid: "amara", groupId: GROUP.thursday }])).body.rejected, []);
    world.db.poke(seatPath("amara"), { allocatedEmailAt: new Date("2026-10-25T10:00:00Z") });
    world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: new Date("2026-10-25T10:00:00Z") });
    await join.place("zach", [{ uid: "dev", groupId: GROUP.monday }]);
    const { body } = await circles();
    const { people, groups, published } = body.circles;
    assert.equal(published, true);
    assert.deepEqual([people.amara.groupId, people.amara.told], [GROUP.thursday, true]);
    assert.deepEqual([people.dev.groupId, people.dev.told], [GROUP.monday, false], "dev is placed and not told yet");
    assert.deepEqual(groups.find((group) => group.id === GROUP.thursday).memberUids, ["amara"]);
  });
});

describe("each person's answer to Can you make this time?", () => {
  const WHY = "A lab on Thursday evenings this term.";
  const WOULD = "Monday or Wednesday after 5pm.";

  test("comes from their seat, for the group they sit in alone, and never reaches Claude", async () => {
    await join.press();
    await join.place("zach", [
      { uid: "amara", groupId: GROUP.thursday },
      { uid: "dev", groupId: GROUP.monday },
    ]);
    const told = new Date("2026-10-25T10:00:00Z");
    world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: told });
    world.db.poke(seatPath("amara"), {
      allocatedEmailAt: told,
      timeAnswer: { kind: "cant", reason: WHY, alternatives: WOULD, forGroupId: GROUP.thursday, at: told },
    });
    // An answer about a group dev is no longer in never shows.
    world.db.poke(seatPath("dev"), {
      allocatedEmailAt: told,
      timeAnswer: { kind: "yes", reason: null, alternatives: null, forGroupId: GROUP.thursday, at: told },
    });
    const { body } = await circles();
    assert.deepEqual(body.circles.people.amara.timeAnswer, { kind: "cant", reason: WHY, alternatives: WOULD });
    assert.equal(body.circles.people.dev.timeAnswer, null);

    // Asked for an arrangement with Claude, Claude is sent none of their words.
    await suggest({ askClaude: true });
    assert.ok(globalThis.__circlesAsked.length > 0, "Claude was not asked, so nothing was checked");
    for (const asked of globalThis.__circlesAsked) {
      const sent = JSON.stringify(asked);
      assert.ok(!sent.includes(WHY) && !sent.includes(WOULD), "a person's own words were sent to Claude");
    }
  });
});

describe("a suggestion keeps everybody placed where they are", () => {
  beforeEach(async () => {
    await join.press();
    // Amara could make Monday too; an admin put her on Thursday.
    await join.place("zach", [{ uid: "amara", groupId: GROUP.thursday }]);
  });

  const whereIn = (option, uid) => option.groups.find((group) => group.memberUids.includes(uid))?.id ?? null;

  test("in every option, and the people still to place are seated where they can go", async () => {
    const answer = await suggest();
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const { options } = answer.body.arrangement;
    assert.ok(options.length >= 1);
    for (const option of options) {
      assert.equal(whereIn(option, "amara"), GROUP.thursday, `option ${option.key} moved amara`);
      assert.equal(whereIn(option, "dev"), GROUP.monday, `option ${option.key} did not seat dev on Monday`);
    }
  });

  test("starting again may move the placed and untold, and never the told", async () => {
    const loose = (await suggest({ startAgain: true })).body.arrangement;
    assert.equal(loose.startAgain, true);
    world.db.poke(seatPath("amara"), { allocatedEmailAt: new Date("2026-10-25T10:00:00Z") });
    const told = (await suggest({ startAgain: true })).body.arrangement;
    for (const option of told.options) assert.equal(whereIn(option, "amara"), GROUP.thursday, "a told placement moved");
  });
});

describe("Apply sends only the differences", () => {
  /** What the screen would send for a preview, read off the circles as they are now. */
  const changesFor = async (option) => {
    const live = (await circles()).body.circles;
    const facts = liveFacts(live);
    const draft = draftOf(option, live);
    return { live, draft, changes: changesBetween(facts, draft) };
  };

  /** One press, through the routes the screen uses, in its order. Returns what each step answered. */
  const press = async ({ draft, changes }) => {
    const idOf = new Map(draft.map((group) => [group.key, group.id]));
    const answers = [];
    for (const group of changes.groups) {
      const made = await call("zach", groupsRoute.POST, programmeParams(AGI), {
        body: { name: group.name, weekday: group.session.weekday, start: group.session.startTimeLocal, minutes: group.session.durationMinutes, places: group.room },
      });
      answers.push(made);
      idOf.set(group.key, made.body.groupId);
    }
    for (const time of changes.times) {
      answers.push(
        await call("zach", timeRoute.PUT, { ...programmeParams(AGI), groupId: time.groupId }, {
          body: { weekday: time.session.weekday, start: time.session.startTimeLocal, from: time.from },
        }),
      );
    }
    if (changes.places.length > 0) {
      answers.push(
        await join.place(
          "zach",
          placementOrder(changes.places).map((place) => ({ uid: place.uid, groupId: place.to ? idOf.get(place.to) : null })),
        ),
      );
    }
    for (const each of changes.facilitators) {
      answers.push(await call("zach", facilitatorsRoute.POST, { groupId: idOf.get(each.key) }, { body: { uids: each.uids }, course: true }));
    }
    return answers;
  };

  test("a preview that moves one person, adds a group and gives a group a time is applied once, and then sends nothing", async () => {
    await join.press();
    await join.place("zach", [{ uid: "amara", groupId: GROUP.thursday }]);
    const live = (await circles()).body.circles;
    // The preview: amara to Monday beside nobody else, dev into a new Wednesday group, "To be arranged" on Tuesday.
    const option = {
      key: "A",
      title: "",
      pros: [],
      cons: [],
      preferred: true,
      size: 8,
      unplaced: [],
      nearUids: [],
      movedUids: [],
      groups: [
        { key: "A1", id: GROUP.monday, name: "Monday evening", session: live.groups[0].session, timeIsNew: false, room: 8, memberUids: ["amara"], facilitators: [], why: "", canMake: [], existing: null },
        { key: "A2", id: GROUP.thursday, name: "Thursday morning", session: live.groups[2].session, timeIsNew: false, room: 8, memberUids: [], facilitators: [], why: "", canMake: [], existing: null },
        { key: "A3", id: GROUP.unset, name: "To be arranged", session: { weekday: 2, startTimeLocal: "18:00", durationMinutes: 90 }, timeIsNew: true, room: 8, memberUids: [], facilitators: [], why: "", canMake: [], existing: null },
        { key: "A4", id: null, name: "Monday evening", session: { weekday: 3, startTimeLocal: "18:00", durationMinutes: 90 }, timeIsNew: true, room: 6, memberUids: ["dev"], facilitators: [{ uid: "dev", role: "lead", offered: false, why: "", bySite: true }], why: "", canMake: [], existing: null },
      ],
    };
    const first = await changesFor(option);
    // The new group's name is taken by Monday evening at another time, so it is given a free one.
    assert.equal(first.draft[3].name !== "Monday evening", true);
    assert.deepEqual(first.changes.places.map((place) => [place.uid, place.from, place.to]), [
      ["amara", GROUP.thursday, "A1"],
      ["dev", null, "A4"],
    ]);
    assert.equal(first.changes.times.length, 1);
    assert.equal(first.changes.groups.length, 1);
    assert.deepEqual(first.changes.facilitators, [], "somebody who did not offer was sent as a facilitator");
    assert.deepEqual(first.changes.toAsk, [{ uid: "dev", key: "A4" }]);
    assert.equal(first.changes.count, 4);

    for (const answer of await press(first)) assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const after = (await circles()).body.circles;
    assert.equal(after.people.amara.groupId, GROUP.monday);
    const made = after.groups.find((group) => group.name === first.draft[3].name);
    assert.ok(made, "the new group is not on the run");
    assert.deepEqual(made.memberUids, ["dev"]);
    assert.deepEqual(after.groups.find((group) => group.id === GROUP.unset).session?.startTimeLocal, "18:00");

    // The same preview again, as the screen holds it with the group the press made.
    const renamed = { ...option, groups: option.groups.map((group) => (group.key === "A4" ? { ...group, name: first.draft[3].name } : group)) };
    const second = await changesFor(renamed);
    assert.equal(second.draft[3].id, made.id, `the group the first press made was not recognised: ${JSON.stringify([made, second.draft[3]])}`);
    assert.equal(second.changes.count, 0, JSON.stringify(second.changes));
  });

  test("a suggestion applied as it came moves nobody already placed", async () => {
    await join.press();
    await join.place("zach", [{ uid: "amara", groupId: GROUP.thursday }]);
    const [option] = (await suggest()).body.arrangement.options;
    const { changes } = await changesFor(option);
    assert.ok(!changes.places.some((place) => place.uid === "amara"), "Apply would move amara");
    assert.ok(changes.places.some((place) => place.uid === "dev"), "dev is not seated");
  });
});
