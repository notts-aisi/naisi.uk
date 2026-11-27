/**
 * SEVERAL PEOPLE MOVED TOGETHER, OR NOBODY (Sun 22 Nov 2026): People in
 * groups' Select several, before the groups go out, through the allocate
 * route's `together` way.
 *
 *   POST /api/courses/runs/[runId]/allocate   { placements, together: true }
 *   src/features/applications/groups/peopleInGroupsWords.ts (the sentences)
 *
 * ## What this guards
 *
 *  1. EVERYBODY FITS: everybody moves in one press, each seat and each
 *     group's count written, nobody emailed.
 *  2. ONE CANNOT, AND NOBODY MOVES: a group without room for everybody
 *     chosen (counted over the whole request), an archived group, a
 *     facilitator who sits in the group they facilitate, somebody who no
 *     longer holds a place, and the groups gone out since the board was
 *     loaded. Each is a 409 naming who stopped it and why, and the whole
 *     store is exactly as it was.
 *  3. THE LIMIT: one transaction of at most 100 people; one over is refused
 *     before anything is read, and a preview cannot be asked together.
 *  4. TWO PRESSES AT ONCE: each is decided over what the other wrote, so a
 *     group never takes more than its room and neither press half happens.
 *  5. WITHOUT THE OPTION THE ROUTE IS WHAT IT WAS: it moves whoever fits
 *     and refuses the rest one by one.
 *  6. THE WORDS: the board's sentences for the bar, the list and each
 *     refusal, and Select several is not drawn once the groups have gone out.
 *
 * Built on `tests/lib/peopleWorld.mjs` (AGI Strategy after decision day:
 * Claudia leads it; Rahul and Sofia facilitate Group B, Sofia Group A, Tom
 * Group C, every group with room for 8), with the hand-over pressed and
 * nobody placed yet.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { A, B, C, RUN, makePeopleWorld, termSeed } from "./lib/peopleWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T12:00:00Z") });

const w = await makePeopleWorld("__moveTogetherSuite");
const words = await w.loadTs("features/applications/groups/peopleInGroupsWords.ts");
const boardParts = await w.loadTs("features/applications/groups/peopleInGroupsBoard.ts");
const { TOGETHER_LIMIT } = await w.loadTs("app/api/courses/runs/[runId]/allocate/route.ts");

async function world() {
  w.reset(termSeed());
  assert.equal((await w.join.press("zach")).status, 200);
  w.world.mail.length = 0;
}

const together = (who, placements, extra = {}) =>
  w.call(who, w.join.routes.allocate.POST, { runId: RUN.agi }, { body: { placements, together: true, ...extra }, course: true });
const to = (groupId, ...uids) => uids.map((uid) => ({ uid, groupId }));
const seatOf = (uid) => w.world.db.read(`courseEnrolments/${RUN.agi}__${uid}`);
const countOf = (groupId) => w.world.db.read(`courseGroups/${groupId}`).memberCount ?? 0;

/** A press that moves nobody: a 409 naming who stopped it, and not one document changed. */
async function refusedWhole(who, placements, stopped) {
  const before = w.everything();
  const answer = await together(who, placements);
  assert.equal(answer.status, 409, JSON.stringify(answer.body));
  assert.deepEqual(Object.keys(answer.body).sort(), ["error", "stopped"]);
  assert.deepEqual(answer.body.stopped, stopped);
  assert.equal(w.everything(), before, "a refused move of several wrote something");
  assert.equal(w.world.mail.length, 0);
  return answer;
}

// ---------------------------------------------------------------------------
// 1. Everybody fits
// ---------------------------------------------------------------------------

describe("1. everybody chosen fits", () => {
  test("the lead moves three people into Group C in one press, and nobody is emailed", async () => {
    await world();
    const answer = await together("claudia", to(C, "amara", "bea", "dev"));
    assert.deepEqual([answer.status, answer.body], [200, { ok: true, placed: 3, rejected: [] }]);
    for (const uid of ["amara", "bea", "dev"]) assert.equal(seatOf(uid).groupId, C, uid);
    assert.equal(countOf(C), 3);
    assert.equal(w.world.mail.length, 0);
  });

  test("moving people on, and back to To place, frees and counts each seat", async () => {
    await world();
    assert.equal((await together("claudia", to(C, "amara", "bea"))).status, 200);
    assert.equal((await together("claudia", to(B, "amara", "bea", "dev"))).status, 200);
    assert.deepEqual([countOf(C), countOf(B)], [0, 3]);
    assert.equal((await together("zach", to(null, "amara", "bea"))).status, 200);
    assert.deepEqual([seatOf("amara").groupId, seatOf("bea").groupId, countOf(B)], [null, null, 1]);
  });

  test("somebody already in the group counts no seat twice", async () => {
    await world();
    w.world.db.poke(`courseGroups/${C}`, { capacity: 2 });
    assert.equal((await together("claudia", to(C, "amara"))).status, 200);
    const answer = await together("claudia", to(C, "amara", "bea"));
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(countOf(C), 2);
  });
});

// ---------------------------------------------------------------------------
// 2. One cannot, and nobody moves
// ---------------------------------------------------------------------------

describe("2. one of them cannot be moved, so nobody is", () => {
  test("a group without room for everybody chosen, counting all of them", async () => {
    await world();
    w.world.db.poke(`courseGroups/${C}`, { capacity: 3 });
    assert.equal((await together("zach", to(C, "kofi"))).status, 200);
    await refusedWhole("claudia", to(C, "amara", "bea", "dev"), { uid: "dev", reason: "group-full", groupId: C, room: 2, wanting: 3 });
    assert.equal(seatOf("amara"), undefined, "Amara was moved although Dev was not");
  });

  test("a group that is not on the run", async () => {
    await world();
    await refusedWhole("claudia", [...to(C, "amara"), ...to("no-such-group__grp99999", "bea")], {
      uid: "bea",
      reason: "group-not-found",
      groupId: "no-such-group__grp99999",
    });
  });

  test("an archived group", async () => {
    await world();
    w.world.db.poke(`courseGroups/${C}`, { archived: true });
    await refusedWhole("claudia", to(C, "amara", "bea"), { uid: "amara", reason: "group-archived", groupId: C });
  });

  test("a facilitator who holds a place and sits in the group they facilitate", async () => {
    await world();
    w.world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "dev"] });
    assert.equal((await w.join.place("zach", to(C, "dev"))).status, 200);
    await refusedWhole("claudia", to(B, "amara", "dev"), { uid: "dev", reason: "facilitates-another-group", groupId: B });
    assert.equal(seatOf("dev").groupId, C);
  });

  // The run's track lead places the people who applied to the run itself, and
  // is served none of the rows the application form wrote. On a run that
  // holds both, a person in the request whose row is not served to the caller
  // is answered exactly as a uid with no accepted row, in every field,
  // wherever that person sits.
  test("as the run's track lead: a person whose row is not served to the caller is answered as a uid with no accepted row, wherever they sit", async () => {
    const ownRow = (uid) => ({ runId: RUN.agi, courseId: w.world.db.read(`courseRuns/${RUN.agi}`).courseId, uid, displayName: uid, status: "accepted", availability: "" });
    const ready = async () => {
      await world();
      for (const uid of ["nadia", "omar", "priya"]) w.world.db.seed(`courseApplications/${RUN.agi}__${uid}`, ownRow(uid));
      // Amara's row the form wrote, and she sits in Group C; Bea's too, and she sits in no group.
      assert.equal((await together("zach", to(C, "amara"))).status, 200);
      w.world.db.poke(`courseGroups/${C}`, { capacity: 3 });
    };
    await ready();
    assert.equal(w.world.db.read(`courseApplications/${RUN.agi}__amara`).fromForm?.programmeId !== undefined, true, "Amara's row is the form's");
    assert.equal((await together("yusuf", to(C, "nadia"))).status, 200, "the track lead places a row from the run's own form");
    // Group C now has room for one; Omar and Priya want it, then somebody the lead is not served or nobody at all.
    const asked = async (third) => {
      await ready();
      assert.equal((await together("yusuf", to(C, "nadia"))).status, 200);
      const before = w.everything();
      const answer = await together("yusuf", to(C, "omar", "priya", third));
      assert.equal(w.everything(), before, `${third}: a refused move of several wrote something`);
      assert.equal(w.world.mail.length, 0);
      return [answer.status, answer.body];
    };
    const sitsInC = await asked("amara");
    const sitsNowhere = await asked("bea");
    const noRow = await asked("nobody-at-all");
    assert.deepEqual(sitsInC, [409, { error: "Nobody was moved: one of them can’t be moved there.", stopped: { uid: "priya", reason: "group-full", groupId: C, room: 1, wanting: 2 } }]);
    assert.deepEqual(sitsNowhere, noRow);
    assert.deepEqual(sitsInC, noRow);
    // First in the request, each is the same refusal with its own uid and nothing else.
    const first = async (uid) => {
      await ready();
      const answer = await together("yusuf", to(C, uid, "omar"));
      return [answer.status, { ...answer.body, stopped: { ...answer.body.stopped, uid: "<asked>" } }];
    };
    const notServed = await first("amara");
    assert.deepEqual(notServed, [409, { error: "Nobody was moved: one of them can’t be moved there.", stopped: { uid: "<asked>", reason: "not-accepted", groupId: C } }]);
    assert.deepEqual(await first("bea"), notServed);
    assert.deepEqual(await first("nobody-at-all"), notServed);
  });

  test("somebody who no longer holds a place on the run", async () => {
    await world();
    w.world.db.poke(`courseApplications/${RUN.agi}__bea`, { status: "withdrawn" });
    await refusedWhole("claudia", to(A, "amara", "bea"), { uid: "bea", reason: "not-accepted", groupId: A });
  });

  test("the groups have gone out since the board was loaded", async () => {
    await world();
    w.world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: new Date("2026-11-17T11:00:00Z") });
    const answer = await refusedWhole("claudia", to(C, "amara", "bea"), { uid: null, reason: "published", groupId: null });
    assert.equal(answer.body.error, "Nobody was moved: the groups have gone out since the board was loaded.");
  });
});

// ---------------------------------------------------------------------------
// 3. The limit
// ---------------------------------------------------------------------------

describe("3. at most one transaction of people", () => {
  test("100 is taken and decided whole; 101 is refused before anything is read", async () => {
    await world();
    assert.equal(TOGETHER_LIMIT, 100);
    const strangers = Array.from({ length: TOGETHER_LIMIT - 1 }, (_, i) => `stranger-${i}`);
    await refusedWhole("claudia", to(C, "amara", ...strangers), { uid: "stranger-0", reason: "not-accepted", groupId: C });
    const before = w.everything();
    const over = await together("claudia", to(C, "amara", ...strangers, "one-more"));
    assert.deepEqual([over.status, over.body], [400, { error: "At most 100 people can be moved together." }]);
    assert.equal(w.everything(), before);
  });

  test("a move together cannot be previewed", async () => {
    await world();
    const before = w.everything();
    const answer = await together("claudia", to(C, "amara"), { preview: true });
    assert.deepEqual([answer.status, answer.body], [400, { error: "A move together can’t be previewed." }]);
    assert.equal(w.everything(), before);
  });

  test("the same person twice in one request is one placement, the last, as every press of the route reads it", async () => {
    await world();
    const answer = await together("claudia", [...to(C, "amara"), ...to(B, "amara")]);
    assert.deepEqual([answer.status, answer.body], [200, { ok: true, placed: 1, rejected: [] }]);
    assert.equal(seatOf("amara").groupId, B);
    assert.deepEqual([countOf(B), countOf(C)], [1, 0]);
  });
});

// ---------------------------------------------------------------------------
// 4. Two presses at once
// ---------------------------------------------------------------------------

describe("4. two presses at once", () => {
  test("into a group with room for two, one press moves its two and the other moves nobody", async () => {
    await world();
    w.world.db.poke(`courseGroups/${C}`, { capacity: 2 });
    const [first, second] = await Promise.all([
      together("claudia", to(C, "amara", "bea")),
      together("claudia", to(C, "dev", "tariq")),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409], JSON.stringify([first.body, second.body]));
    const inC = ["amara", "bea", "dev", "tariq"].filter((uid) => seatOf(uid)?.groupId === C);
    assert.equal(inC.length, 2, `Group C holds ${inC.join(", ")}`);
    assert.ok(
      (inC.includes("amara") && inC.includes("bea")) || (inC.includes("dev") && inC.includes("tariq")),
      "a press half happened",
    );
    assert.equal(countOf(C), 2);
  });
});

// ---------------------------------------------------------------------------
// 5. Without the option
// ---------------------------------------------------------------------------

describe("5. without `together` the route is what it was", () => {
  test("it moves whoever fits and refuses the rest one by one", async () => {
    await world();
    w.world.db.poke(`courseGroups/${C}`, { capacity: 2 });
    const answer = await w.join.place("claudia", to(C, "amara", "bea", "dev"));
    assert.deepEqual([answer.status, answer.body], [200, { ok: true, placed: 2, rejected: [{ uid: "dev", reason: "group-full" }] }]);
    assert.equal(countOf(C), 2);
  });

  test("after the groups have gone out a plain move is still made", async () => {
    await world();
    w.world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: new Date("2026-11-17T11:00:00Z") });
    const answer = await w.join.place("claudia", to(C, "amara"));
    assert.deepEqual([answer.status, answer.body.placed], [200, 1]);
  });
});

// ---------------------------------------------------------------------------
// 6. The words
// ---------------------------------------------------------------------------

describe("6. the board's words for a move of several", () => {
  test("the bar, the list and what a move came to", () => {
    assert.equal(words.SELECT_SEVERAL, "Select several");
    assert.equal(words.selectedWords(["Daniel", "Raj", "Tom"]), "3 selected: Daniel, Raj and Tom");
    assert.equal(words.selectedWords([]), "Nobody selected yet.");
    assert.deepEqual([words.MOVE_TO, words.CLEAR, words.DONE], ["Move to…", "Clear", "Done"]);
    assert.equal(words.moveChosenTitle(["Daniel", "Raj", "Tom"]), "Move Daniel, Raj and Tom to");
    assert.equal(words.moveOptionWords("Group A", 6, 8), "Group A · 6 of 8");
    assert.equal(words.roomForWords(2), "Room for 2");
    assert.equal(words.movedTogetherWords(["Daniel", "Raj", "Tom"], "Group B"), "Daniel, Raj and Tom are in Group B. Nobody was emailed.");
    assert.equal(words.movedTogetherWords(["Daniel"], "Group B"), "Daniel is in Group B. Nobody was emailed.");
    assert.equal(words.movedTogetherWords(["Daniel", "Raj"], null), "Daniel and Raj are no longer in a group. Nobody was emailed.");
  });

  test("the bar's sentence from what the route answered, the route's own words where it named nobody", () => {
    const nameOf = (uid) => ({ dev: "Dev Patel", bea: "Bea Lindqvist" })[uid] ?? "NAISI member";
    const columnName = (id) => ({ [C]: "Group C", [A]: "Group A" })[id] ?? "To place";
    const moved = words.movedTogetherWords(["Amara", "Bea"], "Group C");
    const say = (result) => boardParts.togetherOutcomeWords(result, moved, nameOf, columnName, C);
    assert.deepEqual(say({ ok: true }), { ok: true, text: "Amara and Bea are in Group C. Nobody was emailed." });
    assert.deepEqual(say({ ok: false, error: "x", stopped: { uid: "dev", reason: "group-full", groupId: C, room: 2, wanting: 3 } }), {
      ok: false,
      text: "Group C has room for 2 of the 3. Pick fewer, or another group.",
    });
    assert.deepEqual(say({ ok: false, error: "x", stopped: { uid: "bea", reason: "not-accepted", groupId: A } }), {
      ok: false,
      text: "Bea Lindqvist no longer holds a place on the run, so nobody was moved.",
    });
    assert.deepEqual(say({ ok: false, error: "x", stopped: { uid: null, reason: "published", groupId: null } }), {
      ok: false,
      text: "The groups have gone out since this page loaded, so nobody was moved.",
    });
    assert.deepEqual(say({ ok: false, error: "Failed to fetch", stopped: null }), { ok: false, text: "Failed to fetch" });
  });

  test("a single move's words know the two codes a move of several can stop on, so no code the route sends reaches the board bare", () => {
    assert.equal(words.notMovedWords("Pat Doe", "Group A", "changed"), "Pat Doe wasn’t moved: the board is out of date. Reload it to see where they are.");
    assert.equal(words.notMovedWords("Pat Doe", "Group A", "published"), "Pat Doe wasn’t moved: the groups have gone out since this page loaded.");
  });

  test("each refusal in one sentence naming who stopped it", () => {
    const say = (stop, name = "Daniel Park", group = "Group A") => words.stoppedTogetherWords(stop, name, group);
    assert.equal(say({ reason: "group-full", room: 2, wanting: 3 }), "Group A has room for 2 of the 3. Pick fewer, or another group.");
    assert.equal(say({ reason: "group-full", room: 0, wanting: 3 }), "Group A is full. Pick another group.");
    assert.equal(say({ reason: "group-archived" }), "Group A has been archived, so nobody was moved.");
    assert.equal(say({ reason: "group-not-found" }), "Group A is no longer on the run, so nobody was moved.");
    assert.equal(say({ reason: "facilitates-another-group" }), "Daniel Park facilitates another group and sits in it, so nobody was moved.");
    assert.equal(say({ reason: "not-accepted" }), "Daniel Park no longer holds a place on the run, so nobody was moved.");
    assert.equal(say({ reason: "published" }, ""), "The groups have gone out since this page loaded, so nobody was moved.");
    assert.equal(say({ reason: "changed" }), "Daniel Park can’t be moved this way, so nobody was moved.");
    for (const reason of ["group-full", "group-archived", "group-not-found", "facilitates-another-group", "not-accepted", "published", "changed"]) {
      const sentence = say({ reason, room: 2, wanting: 3 });
      assert.doesNotMatch(sentence, /[–—]/, `${reason} carries a dash`);
    }
  });
});
