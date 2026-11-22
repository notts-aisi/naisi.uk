/**
 * Archiving a group, and restoring one, through the one route that may
 * change `courseGroups.archived`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PATCH /api/courses/groups/[groupId]/archive
 *
 * On the sessions world (the AGI run's six taught weeks from Thu 29 Oct 2026;
 * Group B on Tuesdays at 6pm with four people in it and Nina, who left;
 * Rahul and Sofia facilitating; Group A on Thursdays, Group C on Wednesdays;
 * Yusuf the run's track lead, Claudia the programme's lead, Zach an admin;
 * the clock at Thu 19 Nov, 10am). On top of it, Group D: Mondays at 6pm,
 * nobody in it, Tom facilitating, so its weeks 1 to 3 have met and week 4
 * (Mon 23 Nov) is still to come.
 *
 * ## What this guards
 *
 *  1. WHO: an admin and the lead of the programme that names the run; never
 *     a course approver who leads nothing, the group's own facilitator, the
 *     run's track lead, a course drafter, a member or a view-as session.
 *     Refused before the body is read, and a group that is not there is the
 *     same 403 to all of them as one that is.
 *  2. ARCHIVING IS REFUSED, in one sentence with the way to put it right and
 *     with nothing written, on a run that is over (by its status, or by the
 *     clock with its status still running, which never says "completed"),
 *     for the last group of a run under way that still meets, while anybody
 *     still holds a place in the group, a freed place offered in its name is
 *     not answered, somebody moved from a week still to come is in it until
 *     then, a visit to one of its sessions is still to come (named, with the
 *     day, and the way through once it can no longer be called off), one of
 *     its sessions is given to somebody to cover, or a register of a session
 *     that has started, in a week somebody's place names for the group, is
 *     neither finished nor said not to have happened.
 *  3. ALLOWED once none of that holds: the write is `archived`,
 *     `archivedAt`, `archivedByUid` and `updatedAt`, and one History row;
 *     nothing else in the database moves and nobody is emailed.
 *  4. THE TRANSACTION decides again on what it reads.
 *  5. RESTORING writes `archived`, `restoredAt` and `updatedAt` and one
 *     History row; a facilitator who now sits in another group comes off
 *     through the one writer, with its own row; it is refused on a run being
 *     destroyed or over and while another live group has its name; a press
 *     for the state the group has writes nothing.
 *  6. THE ONE WRITER: no file in `src` or `scripts` writes `archived` to a
 *     group but the route, read with the compiler's parser.
 *  7. The older run editor's switch (an admin's alone now) and the group's
 *     page call the route.
 *  8. EVERY ROUTE BEHIND THE SIX ROWS refuses an archived group, an admin
 *     and the programme's lead alike, writing nothing.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { AGI, AWAY, CAST, ROUND, RUN, TUE_24, makeSessionsWorld, updatesSeed } from "./lib/sessionsWorld.mjs";
import { applicationPath, session, userDoc } from "./lib/applicationsSmallTerm.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const w = await makeSessionsWorld("__groupArchive");
const { world, everything } = w;
const route = await w.courseRoute("groups", "[groupId]", "archive");
const words = await w.loadTs("lib/courses/groupArchive/words.ts");
const plan = await w.loadTs("lib/courses/groupArchive/plan.ts");
const staffMove = await w.loadTs("lib/courses/staffMove/plan.ts");
const restoredLib = await w.loadTs("lib/courses/groupArchive/restored.ts");
const SIX_ROWS = {
  time: await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "time"),
  room: await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "room"),
  campus: await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "campus"),
  places: await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "places"),
  name: await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "name"),
  link: await w.courseRoute("groups", "[groupId]", "meeting-link"),
  facilitators: await w.courseRoute("groups", "[groupId]", "facilitators"),
  change: await w.courseRoute("groups", "[groupId]", "session", "change"),
  regular: await w.courseRoute("groups", "[groupId]", "session", "regular"),
  cover: await w.courseRoute("groups", "[groupId]", "attendance", "cover"),
  pace: await w.courseRoute("groups", "[groupId]", "pace"),
};

const B = "agi-autumn-2026-monday__grp00001";
const A = "agi-autumn-2026-thursday__grp00002";
const C = "agi-autumn-2026-tbc__grp00003";
const D = "agi-autumn-2026-spare__grp00009";

// An approver and a drafter, as the session hands them over: the world's cast
// holds nobody with a course key.
const keyed = (uid, name, key) => {
  const who = session(uid, "member", false, name);
  return { ...who, permissions: { ...who.permissions, [key]: true } };
};
CAST.paula = keyed("paula", "Paula Grant", "approveCourse");
CAST.dara = keyed("dara", "Dara Quinn", "draftCourse");

const groupD = (over = {}) => ({
  runId: RUN.agi,
  courseId: "agi-strategy-fellowship__c0urse01",
  name: "Group D",
  facilitatorUids: ["tom"],
  capacity: 8,
  memberCount: 0,
  archived: false,
  session: { weekday: 1, startTimeLocal: "18:00", durationMinutes: 90, location: "Room D1", meetingUrl: null, notes: "" },
  sessionOverrides: {},
  ...over,
});
const registerPath = (groupId, n) => `courseAttendance/${RUN.agi}__${groupId}__w${String(n).padStart(2, "0")}`;
const register = (groupId, n, over = {}) => ({
  runId: RUN.agi,
  groupId,
  weekNumber: n,
  records: {},
  held: true,
  pushedAt: new Date(`2026-11-0${n}T20:00:00Z`),
  pushedByUid: "tom",
  markedByUid: "tom",
  ...over,
});
/** Group D's three sessions that have met, each finished. */
const finishedD = () =>
  Object.fromEntries([1, 2, 3].map((n) => [registerPath(D, n), register(D, n)]));
const placePath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
/** Bea, in Group D for weeks 1 to 3 and moved to Group A from week 4: the weeks her place names for D. */
const beaInDUntilWeek4 = () => ({
  [placePath("bea")]: { ...updatesSeed()[placePath("bea")], groupsByWeek: [{ groupId: D, fromWeek: 1 }, { groupId: A, fromWeek: 4 }] },
});

function seed(over = {}) {
  const base = updatesSeed();
  base[`courseGroups/${D}`] = groupD();
  base["users/paula"] = userDoc(CAST.paula);
  base["users/dara"] = userDoc(CAST.dara);
  return { ...base, ...over };
}

beforeEach(() => w.reset(seed()));

const press = (who, groupId, body, options = {}) => w.call(who, route.PATCH, { groupId }, { body, course: true, ...options });
const archive = (who, groupId) => press(who, groupId, { archived: true });
const restore = (who, groupId) => press(who, groupId, { archived: false });
const stored = (groupId) => world.db.read(`courseGroups/${groupId}`);
/** What a press changed: the paths, and each document as it now is. */
const changedBy = (before, after) =>
  after.filter(([path, doc]) => JSON.stringify(before.find(([p]) => p === path)?.[1]) !== JSON.stringify(doc));
/** An account's display name as stored, which an admin is shown. */
const displayName = (uid) => world.db.read(`users/${uid}`)?.displayName;

/** The press is refused with exactly this sentence, and the database is as it was. */
async function refusedWith(who, groupId, body, sentence) {
  const before = everything();
  const answer = await press(who, groupId, body);
  assert.equal(answer.status, 409, JSON.stringify(answer.body));
  assert.equal(answer.body.error, sentence);
  assert.equal(everything(), before, "a refused press wrote something");
}

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who may archive or restore a group", () => {
  const CASES = [
    ["zach", 400, "an admin"],
    ["paula", 403, "an approveCourse holder who leads nothing"],
    ["yusuf", 403, "the run's track lead"],
    ["claudia", 400, "the lead of the programme that names the run"],
    ["rahul", 403, "a facilitator of the group"],
    ["tom", 403, "a facilitator of another group"],
    ["dara", 403, "a draftCourse holder on nothing"],
    ["tess", 403, "the lead of another programme"],
    ["amara", 403, "a member of the group"],
    ["nobody", 403, "a member on nothing"],
    [null, 401, "somebody signed out"],
  ];
  for (const [who, status, what] of CASES) {
    test(`${what}: ${status} before the body is read`, async () => {
      const before = everything();
      const answer = await press(who, B, {});
      assert.equal(answer.status, status, JSON.stringify(answer.body));
      if (status === 400) assert.equal(answer.body.error, words.ARCHIVE_REFUSAL.body);
      assert.equal(everything(), before);
    });
  }

  test("a view-as session is refused first, even an admin's", async () => {
    const answer = await press("zach", D, { archived: true }, { viewAs: true });
    assert.equal(answer.status, 403);
    assert.equal(stored(D).archived, false);
  });

  test("a group that is not there: the same 403 as one that is for anybody it would be asked of, 404 for an admin", async () => {
    w.reset(seed(finishedD()));
    for (const who of ["yusuf", "rahul", "paula", "tess", "amara"]) {
      const there = await archive(who, D);
      const missing = await archive(who, "no-such-group");
      assert.equal(there.status, 403, who);
      assert.deepEqual(missing, there, `${who}: a missing group is told apart from one that is there`);
    }
    assert.equal((await archive("zach", "no-such-group")).status, 404);
    assert.equal((await archive("zach", "a/b")).status, 404);
  });

  test("a course approver who leads nothing is refused even where the archive would go through", async () => {
    w.reset(seed(finishedD()));
    const before = everything();
    assert.equal((await archive("paula", D)).status, 403);
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    assert.equal((await restore("paula", D)).status, 403);
    w.reset(seed(finishedD()));
    assert.equal(everything(), before);
  });

  test("a group's own facilitator and the run's track lead are refused, even where the archive would go through", async () => {
    w.reset(seed(finishedD()));
    const before = everything();
    for (const who of ["tom", "yusuf"]) {
      const answer = await archive(who, D);
      assert.equal(answer.status, 403, `${who}: ${JSON.stringify(answer.body)}`);
      assert.equal(answer.body.error, "Forbidden");
    }
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    for (const who of ["tom", "yusuf"]) assert.equal((await restore(who, D)).status, 403, who);
    assert.equal(stored(D).archived, true);
    w.reset(seed(finishedD()));
    assert.equal(everything(), before);
  });

  test("a programme's lead on an account no longer approved is refused", async () => {
    w.reset(seed({ ...finishedD(), "users/claudia": userDoc(session("claudia", "rejected", true, "Claudia Reyes")) }));
    assert.equal((await archive("claudia", D)).status, 403);
    assert.equal(stored(D).archived, false);
  });
});

// ---------------------------------------------------------------------------
// 2. Refused while it would lose something
// ---------------------------------------------------------------------------

describe("2. archiving is refused while it would lose something", () => {
  test("people still in the group, counted as the Groups tab counts them, with the way to move them", async () => {
    // Amara, Dev, Ines and Omar; Nina left, and Rahul and Sofia's rows are a facilitator's.
    await refusedWith("zach", B, { archived: true }, "Group B still has 4 people in it. Move them to another group first, then archive it.");
    const answer = await archive("claudia", B);
    assert.deepEqual(answer.body.fix, { kind: "people" });
    assert.equal(words.stillHasPeopleWords("Group I", 1), "Group I still has 1 person in it. Move them to another group first, then archive it.");
  });

  test("people still in it, one of whom facilitates it too: take them off its facilitators first", async () => {
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "amara"] });
    await refusedWith(
      "zach",
      B,
      { archived: true },
      "Group B still has 4 people in it. Move them to another group first, then archive it. " +
        "One of them facilitates it too: take them off its facilitators on Facilitators before moving them.",
    );
  });

  const COMPLETED = "AGI Strategy’s run is completed, so its groups stay as they are for the record.";

  test("a run that is over by its status: every group, emptied or not, both ways", async () => {
    for (const [over, sentence] of [
      [{ status: "completed" }, COMPLETED],
      [{ status: "cancelled" }, "AGI Strategy’s run is cancelled, so its groups stay as they are for the record."],
      [{ archived: true }, "AGI Strategy’s run is archived, so its groups stay as they are for the record."],
    ]) {
      const run = { ...updatesSeed()[`courseRuns/${RUN.agi}`], ...over };
      w.reset(seed({ ...finishedD(), [`courseRuns/${RUN.agi}`]: run }));
      for (const who of ["zach", "claudia"]) {
        await refusedWith(who, B, { archived: true }, sentence);
        await refusedWith(who, D, { archived: true }, sentence);
      }
      w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }), [`courseRuns/${RUN.agi}`]: run }));
      await refusedWith("zach", D, { archived: false }, sentence);
    }
  });

  test("a run whose last session has ended, its status still running: said so, never completed", async () => {
    w.reset(seed(finishedD()));
    w.at("2026-12-20T10:00:00Z");
    assert.ok(!["completed", "cancelled"].includes(w.run().status) && !w.run().archived, "its status says nothing is over");
    const sentence = "AGI Strategy’s run has had its last session, so its groups stay as they are for the record.";
    await refusedWith("zach", B, { archived: true }, sentence);
    await refusedWith("claudia", D, { archived: true }, sentence);
    assert.doesNotMatch(sentence, /completed/);
  });

  test("the run's last group that still meets, with people in it or none", async () => {
    for (const other of [A, C, D]) world.db.poke(`courseGroups/${other}`, { archived: true });
    const sentence = "Group B is AGI Strategy’s only group, so it can’t be archived. To end the programme early, an admin cancels the cohort.";
    await refusedWith("claudia", B, { archived: true }, sentence);
    w.reset(seed(finishedD()));
    for (const other of [A, B, C]) world.db.poke(`courseGroups/${other}`, { archived: true });
    await refusedWith("zach", D, { archived: true }, sentence.replace("Group B", "Group D"));
    assert.equal(
      words.lastGroupWords("Group A", "Alignment"),
      "Group A is Alignment’s only group, so it can’t be archived. To end the programme early, an admin cancels the cohort.",
    );
  });

  test("a freed place offered in the group's name and not answered", async () => {
    const offered = (uid, over = {}) => ({
      ...world.db.read(applicationPath(uid)),
      result: { kind: "no-offer", programmeId: null, publishedAt: new Date("2026-10-09T13:20:00Z"), email: "sent", emailedAt: new Date("2026-10-09T13:20:00Z") },
      invitation: { programmeId: "agi-strategy", replyBy: "2026-11-25", response: null, respondedAt: null, lastReminderOn: null },
      freedPlace: { groupId: D, offeredAt: new Date("2026-11-18T10:00:00Z"), email: "sent", emailedAt: new Date("2026-11-18T10:00:00Z"), emailClaimedAt: null },
      status: "invited",
      ...over,
    });
    const at = { ...finishedD(), [applicationPath("wen")]: offered("wen") };
    w.reset(seed(at));
    await refusedWith("zach", D, { archived: true }, "Group D has 1 freed place offered and not answered yet. Archive it once that person has answered.");
    assert.equal(words.freedOffersWords("Group D", 2), "Group D has 2 freed places offered and not answered yet. Archive it once they have answered.");
    // Answered no, or withdrawn: nothing waits on the group.
    for (const over of [
      { invitation: { programmeId: "agi-strategy", replyBy: "2026-11-25", response: "declined", respondedAt: new Date("2026-11-19T09:00:00Z"), lastReminderOn: null } },
      { status: "withdrawn" },
    ]) {
      w.reset(seed({ ...finishedD(), [applicationPath("wen")]: offered("wen", over) }));
      assert.equal((await archive("zach", D)).status, 200, JSON.stringify(over));
    }
  });

  test("somebody moved to another group from a week still to come is in it until then", async () => {
    w.reset(
      seed({
        ...finishedD(),
        [placePath("bea")]: { ...updatesSeed()[placePath("bea")], groupsByWeek: [{ groupId: D, fromWeek: 1 }, { groupId: A, fromWeek: 6 }] },
      }),
    );
    await refusedWith(
      "zach",
      D,
      { archived: true },
      "Group D is still 1 person’s group for weeks 4 and 5, before their move to another group. Archive it once those sessions have met and their registers are finished.",
    );
  });

  /** Bea, of Group A, visiting Group D's week 5 session (Mon 30 Nov). */
  const beaVisitsD = () => ({
    ...finishedD(),
    [placePath("bea")]: { ...updatesSeed()[placePath("bea")], visits: [{ weekNumber: 5, groupId: D, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-18T10:00:00Z") }] },
  });

  test("a one-week visit to one of its sessions still to come: the visitor, the day, and their page", async () => {
    w.reset(seed(beaVisitsD()));
    const name = displayName("bea");
    await refusedWith(
      "zach",
      D,
      { archived: true },
      `${name} is visiting Group D’s week 5 session on Mon 30 Nov. Call the visit off on Bea’s page first, then archive the group.`,
    );
    assert.deepEqual((await archive("claudia", D)).body.fix, { kind: "person", uid: "bea", firstName: "Bea" });
  });

  test("a visit that can no longer be called off: the way through that is left", async () => {
    w.reset(seed(beaVisitsD()));
    // Fri 27 Nov: Bea's own Group A met on Thu 26 Nov for week 5, so the visit stands.
    w.at("2026-11-27T10:00:00Z");
    for (const n of [4]) world.db.seed(registerPath(D, n), register(D, n, { pushedAt: new Date("2026-11-23T20:00:00Z") }));
    const answer = await archive("zach", D);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.equal(
      answer.body.error,
      `${displayName("bea")} is visiting Group D’s week 5 session on Mon 30 Nov, and it’s too late to call the visit off. ` +
        "Archive the group once that session has met and its register is finished.",
    );
    assert.equal(answer.body.fix, null);
  });

  test("the visit's own deadline decides: with the visitor's own session called off, or their group archived, it can still be called off", async () => {
    const ordinary = `${displayName("bea")} is visiting Group D’s week 5 session on Mon 30 Nov. Call the visit off on Bea’s page first, then archive the group.`;
    // Bea's own Group A week 5 session (Thu 26 Nov) was called off: the host's session is the deadline.
    const calledOff = { w05: { kind: "cancelled", dateKey: "2026-11-26", reason: "Room flooded.", byUid: "claudia", at: new Date("2026-11-20T10:00:00Z") } };
    w.reset(seed({ ...beaVisitsD(), [registerPath(D, 4)]: register(D, 4, { pushedAt: new Date("2026-11-23T20:00:00Z") }) }));
    world.db.poke(`courseGroups/${A}`, { sessionChanges: calledOff });
    w.at("2026-11-27T10:00:00Z");
    let answer = await archive("zach", D);
    assert.deepEqual([answer.status, answer.body.error], [409, ordinary], "own session called off");
    assert.deepEqual(answer.body.fix, { kind: "person", uid: "bea", firstName: "Bea" });
    // Her own group archived: no session of its own that week, so the same.
    w.reset(seed({ ...beaVisitsD(), [registerPath(D, 4)]: register(D, 4, { pushedAt: new Date("2026-11-23T20:00:00Z") }) }));
    world.db.poke(`courseGroups/${A}`, { archived: true });
    w.at("2026-11-27T10:00:00Z");
    answer = await archive("zach", D);
    assert.deepEqual([answer.status, answer.body.error], [409, ordinary], "own group archived");
    assert.notEqual(answer.body.fix, null);
  });

  /** Group D's week 4 session (Mon 23 Nov, 6pm), given to Sofia to cover until the end of that day. */
  const givenToSofia = () => ({
    ...finishedD(),
    [registerPath(D, 4)]: {
      runId: RUN.agi,
      groupId: D,
      weekNumber: 4,
      records: {},
      held: true,
      cover: {
        kind: "given",
        byUid: "sofia",
        at: new Date("2026-11-18T10:00:00Z"),
        covering: ["tom"],
        grantedByUid: "claudia",
        grantedAt: new Date("2026-11-18T10:00:00Z"),
        until: new Date("2026-11-24T00:00:00Z"),
      },
    },
  });

  test("a session given to somebody to cover: Change this week, and nothing tells them", async () => {
    w.reset(seed(givenToSofia()));
    const name = displayName("sofia");
    const first = name.split(" ")[0];
    await refusedWith(
      "zach",
      D,
      { archived: true },
      `Group D’s week 4 session has been given to ${name} to cover. Move it or call it off under Change this week first, then archive the group. ` +
        `The site doesn’t tell ${first}, so let them know.`,
    );
    assert.deepEqual((await archive("claudia", D)).body.fix, { kind: "week", weekNumber: 4 });
  });

  test("a session given to cover that has started holds until midnight; a cover that has lapsed, or a session called off, is no reason", async () => {
    w.reset(seed(givenToSofia()));
    w.at("2026-11-23T19:00:00Z");
    const answer = await archive("zach", D);
    assert.equal(answer.status, 409);
    assert.equal(answer.body.error, `Group D’s week 4 session was given to ${displayName("sofia")} to cover, and it stays theirs until midnight. Archive the group after that.`);
    assert.equal(answer.body.fix, null);
    // The next morning the cover has lapsed, and nobody's place names week 4.
    w.reset(seed(givenToSofia()));
    w.at("2026-11-24T09:00:00Z");
    assert.equal((await archive("zach", D)).status, 200);
    // Called off under Change this week: the session is not one to cover.
    const calledOff = { w04: { kind: "cancelled", dateKey: "2026-11-23", reason: "Room flooded.", byUid: "claudia", at: new Date("2026-11-19T09:00:00Z") } };
    w.reset(seed({ ...givenToSofia(), [`courseGroups/${D}`]: groupD({ sessionChanges: calledOff }) }));
    assert.equal((await archive("zach", D)).status, 200);
  });

  test("an emptied or spare group nobody's place names archives with no register opened", async () => {
    const answer = await archive("zach", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  });

  test("an unfinished register's refusal opens that week's register", async () => {
    w.reset(seed(beaInDUntilWeek4()));
    const answer = await archive("zach", D);
    assert.equal(answer.status, 409);
    assert.equal(answer.body.fix.kind, "register");
    assert.equal(answer.body.fix.weekNumber, 1);
    assert.match(answer.body.fix.sessionKey, /w01/);
  });

  test("a register is asked about only for a week somebody's place names for the group, a visit included", async () => {
    w.reset(
      seed({
        [placePath("tariq")]: { ...updatesSeed()[placePath("tariq")], visits: [{ weekNumber: 2, groupId: D, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-01T10:00:00Z") }] },
      }),
    );
    await refusedWith(
      "zach",
      D,
      { archived: true },
      "Group D’s register for week 2 isn’t finished. Finish it, or say the session didn’t happen, then archive the group: " +
        "an unfinished register counts for nothing once a group is archived.",
    );
  });

  test("registers of sessions that have met: none opened", async () => {
    w.reset(seed(beaInDUntilWeek4()));
    await refusedWith(
      "zach",
      D,
      { archived: true },
      "Group D’s registers for weeks 1, 2 and 3 aren’t finished. Finish them, or say the sessions didn’t happen, then archive the group: " +
        "an unfinished register counts for nothing once a group is archived.",
    );
  });

  test("one register left a draft; one finished and one said not to have happened count as done", async () => {
    w.reset(
      seed({
        ...beaInDUntilWeek4(),
        [registerPath(D, 1)]: register(D, 1),
        [registerPath(D, 2)]: register(D, 2, { held: false, pushedAt: null }),
        [registerPath(D, 3)]: register(D, 3, { pushedAt: null }),
      }),
    );
    await refusedWith(
      "zach",
      D,
      { archived: true },
      "Group D’s register for week 3 isn’t finished. Finish it, or say the session didn’t happen, then archive the group: " +
        "an unfinished register counts for nothing once a group is archived.",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Allowed, and what it writes
// ---------------------------------------------------------------------------

describe("3. archiving once nothing is lost", () => {
  test("writes the field, when and by whom, updatedAt and one History row, and nothing else anywhere", async () => {
    w.reset(seed(finishedD()));
    const before = JSON.parse(everything());
    const answer = await archive("claudia", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, archived: true });
    const changed = changedBy(before, JSON.parse(everything()));
    const paths = changed.map(([path]) => path);
    assert.equal(paths.length, 2, paths.join(", "));
    assert.ok(paths.includes(`courseGroups/${D}`));
    const row = changed.find(([path]) => path.startsWith("courseAudit/"));
    assert.ok(row, "one History row");
    assert.equal(row[1].kind, "group-archived");
    assert.equal(row[1].groupId, D);
    assert.equal(row[1].actorUid, "claudia");
    assert.equal(row[1].detail, "Archived Group D.");
    assert.equal(row[1].emailed, 0);
    const was = before.find(([p]) => p === `courseGroups/${D}`)[1];
    const now = changed.find(([p]) => p === `courseGroups/${D}`)[1];
    assert.deepEqual(
      Object.keys(now).filter((key) => JSON.stringify(now[key]) !== JSON.stringify(was[key])).sort(),
      ["archived", "archivedAt", "archivedByUid", "updatedAt"],
    );
    assert.equal(now.archived, true);
    assert.equal(now.archivedByUid, "claudia");
    assert.equal(world.mail.length, 0, "archiving emails nobody");
  });

  test("a move or a visit in a week that has met is no reason to refuse", async () => {
    w.reset(
      seed({
        ...finishedD(),
        [placePath("bea")]: {
          ...updatesSeed()[placePath("bea")],
          groupsByWeek: [{ groupId: D, fromWeek: 1 }, { groupId: A, fromWeek: 3 }],
          visits: [{ weekNumber: 4, groupId: C, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-18T10:00:00Z") }],
        },
        [placePath("tariq")]: { ...updatesSeed()[placePath("tariq")], visits: [{ weekNumber: 2, groupId: D, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-01T10:00:00Z") }] },
      }),
    );
    const answer = await archive("claudia", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  });

  test("a session called off is not asked about", async () => {
    // Group D's week 3 (Mon 16 Nov) was called off through Change a session; weeks 1 and 2 are finished.
    const calledOff = { w03: { kind: "cancelled", dateKey: "2026-11-16", reason: "Room flooded.", byUid: "claudia", at: new Date("2026-11-15T10:00:00Z") } };
    // Bea's place names weeks 1 to 3 for Group D, so week 3 would be asked about if it had met.
    w.reset(
      seed({
        ...beaInDUntilWeek4(),
        [registerPath(D, 1)]: register(D, 1),
        [registerPath(D, 2)]: register(D, 2),
        [`courseGroups/${D}`]: groupD({ sessionChanges: calledOff }),
      }),
    );
    assert.ok(w.sessionsOf(D).find((each) => each.weekNumber === 3)?.cancelled, "week 3 reads as called off");
    const answer = await archive("zach", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  });

  test("a press for the state the group already has writes nothing", async () => {
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    const before = everything();
    const answer = await archive("zach", D);
    assert.equal(answer.status, 200);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 4. The transaction decides again
// ---------------------------------------------------------------------------

describe("4. the transaction decides on what it read", () => {
  test("somebody placed in the group between the first read and the write is answered, not archived over", async () => {
    w.reset(seed(finishedD()));
    world.db.beforeCommit = () => world.db.poke(placePath("bea"), { groupId: D });
    const answer = await archive("zach", D);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.equal(answer.body.error, "Group D still has 1 person in it. Move them to another group first, then archive it.");
    assert.equal(stored(D).archived, false);
  });

  test("a visit arranged between the two reads is answered, not archived over", async () => {
    w.reset(seed(finishedD()));
    world.db.beforeCommit = () =>
      world.db.poke(placePath("bea"), { visits: [{ weekNumber: 5, groupId: D, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-19T10:00:00Z") }] });
    const answer = await archive("zach", D);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.match(answer.body.error, /is visiting Group D’s week 5 session on Mon 30 Nov\./);
    assert.equal(stored(D).archived, false);
  });

  test("a register reopened between the two reads, for a week somebody's place names, is answered", async () => {
    w.reset(seed({ ...finishedD(), ...beaInDUntilWeek4() }));
    world.db.beforeCommit = () => world.db.poke(registerPath(D, 2), { pushedAt: null });
    const answer = await archive("zach", D);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.match(answer.body.error, /^Group D’s register for week 2 isn’t finished\./);
    assert.equal(stored(D).archived, false);
  });
});

// ---------------------------------------------------------------------------
// 5. Restoring, and a run being destroyed
// ---------------------------------------------------------------------------

describe("5. restoring", () => {
  test("writes the field, restoredAt, updatedAt and one History row, keeping when and by whom it was archived", async () => {
    const archivedAt = new Date("2026-11-02T10:15:00Z");
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true, archivedAt, archivedByUid: "claudia" }) }));
    const before = JSON.parse(everything());
    const answer = await restore("claudia", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const changed = changedBy(before, JSON.parse(everything()));
    assert.equal(changed.length, 2, changed.map(([path]) => path).join(", "));
    const was = before.find(([p]) => p === `courseGroups/${D}`)[1];
    const now = changed.find(([p]) => p === `courseGroups/${D}`)[1];
    assert.deepEqual(
      Object.keys(now).filter((key) => JSON.stringify(now[key]) !== JSON.stringify(was[key])).sort(),
      ["archived", "restoredAt", "updatedAt"],
    );
    assert.equal(now.archived, false);
    assert.equal(now.archivedByUid, "claudia", "who archived it is kept");
    const row = changed.find(([path]) => path.startsWith("courseAudit/"))[1];
    assert.equal(row.kind, "group-restored");
    assert.equal(row.detail, "Restored Group D.");
    assert.equal(world.mail.length, 0, "restoring emails nobody");
  });

  test("a facilitator who now sits in another group comes off through the one writer, with its usual History line", async () => {
    // Tariq holds a place in Group C; Tom holds none.
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true, facilitatorUids: ["tom", "tariq"] }) }));
    const seatBefore = world.db.read(placePath("tariq"));
    const before = JSON.parse(everything());
    const answer = await restore("zach", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(stored(D).archived, false);
    assert.deepEqual(stored(D).facilitatorUids, ["tom"]);
    assert.deepEqual(world.db.read(placePath("tariq")), seatBefore, "a learner's place is never touched");
    const rows = changedBy(before, JSON.parse(everything())).filter(([path]) => path.startsWith("courseAudit/")).map(([, doc]) => doc);
    assert.deepEqual(rows.map((row) => row.kind).sort(), ["facilitator-removed", "group-restored"]);
    const removed = rows.find((row) => row.kind === "facilitator-removed");
    assert.equal(removed.subjectUid, "tariq");
    assert.equal(world.mail.length, 0, "restoring emails nobody");
  });

  test("a facilitator who now holds a place in no group comes off too, and the question says so", async () => {
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true, facilitatorUids: ["tom", "bea"] }) }));
    world.db.poke(placePath("bea"), { groupId: null });
    const answer = await restore("zach", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(stored(D).facilitatorUids, ["tom"]);
    assert.equal(world.db.read(placePath("bea")).groupId, null, "their place is untouched");
    assert.equal(
      words.sitsElsewhereWords("Group F", [{ name: "Rahul Mehta", groupName: "" }], []),
      "Rahul Mehta now holds a place on the run in no group, so Group F comes back with no facilitator. Add one on Facilitators.",
    );
  });

  test("is refused while another group of the run that still meets has its name", async () => {
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    world.db.poke(`courseGroups/${C}`, { name: "group d" });
    await refusedWith("claudia", D, { archived: false }, "Another group is now called Group D. Rename that group first, then restore this one.");
    // An archived group of the same name is no reason.
    world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.equal((await restore("claudia", D)).status, 200);
  });

  test("both are refused on a run being destroyed", async () => {
    const run = { ...updatesSeed()[`courseRuns/${RUN.agi}`], destroying: true };
    w.reset(seed({ ...finishedD(), [`courseRuns/${RUN.agi}`]: run }));
    await refusedWith("zach", D, { archived: true }, words.ARCHIVE_REFUSAL.destroying);
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }), [`courseRuns/${RUN.agi}`]: run }));
    await refusedWith("zach", D, { archived: false }, words.ARCHIVE_REFUSAL.destroying);
  });

  test("the transaction decides again: a group given the name between the two reads is answered", async () => {
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    world.db.beforeCommit = () => world.db.poke(`courseGroups/${C}`, { name: "Group D" });
    const answer = await restore("zach", D);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.equal(stored(D).archived, true);
  });

  test("a body that does not say true or false is refused", async () => {
    for (const body of [{}, { archived: "yes" }, { archived: 1 }, null]) {
      const answer = await press("zach", D, body);
      assert.equal(answer.status, 400, JSON.stringify(body));
    }
  });
});

describe("the words", () => {
  test("weeks and lists", () => {
    assert.equal(words.weeksWords([2]), "week 2");
    assert.equal(words.weeksWords([2, 3]), "weeks 2 and 3");
    assert.equal(words.weeksWords([1, 2, 4]), "weeks 1, 2 and 4");
    assert.equal(words.groupName("  "), "Untitled group");
  });

  test("the design's words, as the page says them", () => {
    assert.equal(words.archiveLinkWords("Group C"), "Archive Group C…");
    assert.equal(words.archiveLineWords("Group C"), "Takes Group C out of allocation, lists and reminders. Its registers and history stay.");
    assert.equal(words.archiveQuestionTitle("Group E"), "Archive Group E?");
    assert.equal(
      words.archiveQuestionBody("Group E"),
      "Group E leaves the board, All groups and every reminder, and drops out of allocation. It stays on the run for the record, with its registers and history, and can be restored.",
    );
    assert.equal(words.NOBODY_IS_EMAILED, "Nobody is emailed.");
    assert.equal(words.archiveButtonWords("Group E"), "Archive Group E");
    assert.equal(words.keepButtonWords("Group E"), "Keep Group E");
    assert.equal(words.ARCHIVING, "Archiving…");
    assert.equal(words.archivedSaidWords("Group E"), "Group E is archived. Nobody was emailed.");
    assert.equal(words.OPEN_PEOPLE_IN_GROUPS, "Open People in groups");
    assert.equal(words.openRegisterWords(2), "Open week 2’s register");
    assert.equal(words.openPersonWords("Agnes"), "Open Agnes’s page");
    assert.equal(words.changeWeekWords(3), "Change week 3’s session");
    assert.equal(
      words.visitToComeWords({ visitorName: "Agnes Ilori", visitorFirstName: "Agnes", name: "Group E", weekNumber: 3, dayLabel: "Fri 20 Nov", callable: true }),
      "Agnes Ilori is visiting Group E’s week 3 session on Fri 20 Nov. Call the visit off on Agnes’s page first, then archive the group.",
    );
    assert.equal(
      words.archivedSentence("Group F", "Mon 2 Nov", "Maya Rao"),
      "Group F was archived on Mon 2 Nov by Maya Rao. It is out of allocation, lists and reminders. Its registers and history stay here.",
    );
    assert.equal(words.archivedSentence("Group F", "", ""), "Group F is archived. It is out of allocation, lists and reminders. Its registers and history stay here.");
    assert.equal(words.howMetTitle("Group F"), "How Group F met");
    assert.equal(words.NOTHING_CHANGES_WHILE_ARCHIVED, "Nothing here changes while the group is archived. Restore it first.");
    assert.equal(words.restoreLinkWords("Group F"), "Restore Group F…");
    assert.equal(words.restoreQuestionTitle("Group F"), "Restore Group F?");
    assert.equal(
      words.restoreQuestionBody("Group F", "Fridays, 11am to 1pm", ""),
      "Group F comes back on the board, All groups and reminders, as it was when it was archived: Fridays, 11am to 1pm, no room.",
    );
    assert.equal(
      words.sitsElsewhereWords("Group F", [{ name: "Rahul Mehta", groupName: "Group B" }], []),
      "Rahul Mehta now sits in Group B as one of its people, so Group F comes back with no facilitator. Add one on Facilitators.",
    );
    assert.equal(
      words.sitsElsewhereWords("Group F", [{ name: "Rahul Mehta", groupName: "Group B" }], ["Priya Shah"]),
      "Rahul Mehta now sits in Group B as one of its people, so Group F comes back with Priya Shah as its facilitator.",
    );
    assert.equal(words.sitsElsewhereWords("Group F", [], ["Priya Shah"]), "");
    assert.equal(words.KEEP_IT_ARCHIVED, "Keep it archived");
    assert.equal(words.restoreButtonWords("Group F"), "Restore Group F");
    assert.equal(words.nameTakenWords("Group F"), "Another group is now called Group F. Rename that group first, then restore this one.");
    assert.equal(words.restoredSaidWords("Group F"), "Group F is back. Nobody was emailed.");
    assert.equal(words.facilitatorArchivedTitle("Group F", "Mon 2 Nov"), "Group F was archived on Mon 2 Nov.");
    assert.equal(words.facilitatorArchivedTitle("Group F", ""), "Group F is archived.");
    assert.equal(words.facilitatorArchivedLine("Maya"), "Its registers are kept. Maya, the programme’s lead, can tell you more.");
    assert.equal(words.facilitatorArchivedLine(null), "Its registers are kept. An admin can tell you more.");
  });

  test("no dashes in the words", () => {
    const source = readFileSync(join(REPO, "src", "lib", "courses", "groupArchive", "words.ts"), "utf8");
    assert.doesNotMatch(source, /[\u2013\u2014]/);
  });

  test("a run that takes no move is the staff move's own answer", () => {
    for (const status of ["draft", "applications-open", "applications-closed", "running", "completed", "cancelled"]) {
      for (const archived of [false, true]) {
        const run = { status, archived };
        assert.equal(plan.runTakesNoMove(run), staffMove.runMoveRefusal(run, false) !== null, `${status}, archived ${archived}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The one writer
// ---------------------------------------------------------------------------

/**
 * EVERY WRITE OF `archived` TO A GROUP, read with the compiler's parser from
 * every file in `src` and `scripts`.
 *
 * A write is a call of `update`, `set`, `create`, `add`, `updateDoc`,
 * `setDoc` or `addDoc` whose data names `archived`: an object literal with
 * the key (or one held in a constant of the same file, or returned by a
 * function of it), a dotted-path pair, or an object the file assigns
 * `.archived` on. Its target is a group when the target, or a constant of
 * the file it is built from, names `courseGroups`; another collection when
 * it names one; and UNRESOLVED when it names neither (a parameter, a
 * document handed in). A group write and an unresolved write must each be
 * listed below with why; every listed file must still hold one.
 *
 * Not findings: a group BORN not archived (`archived: false` in a create or
 * a whole-document set, as the run editor and the fixtures make groups),
 * because it changes no group's state; and `scripts/rules-tests`, which
 * writes to an emulator through the rules precisely to show them refusing.
 */
const THROUGH_THE_CHECKS = {
  "src/app/api/courses/groups/[groupId]/archive/route.ts": "the archive route: its write follows the checks, in their transaction",
};
const NOT_A_GROUP = {
  "src/app/api/admissions/rounds/[roundId]/route.ts": "archives an admission round (`ref` is the round's own document)",
  "src/app/api/worksheets/circulations/[circulationId]/close/route.ts": "archives the tasks of a closed circulation",
  "src/lib/applications/editor/write.ts": "creates an application form, not archived",
  "src/lib/courses/explainers/schedule.ts": "archives an explainer's tasks when it is cancelled",
  "src/lib/courses/registerCorrection/chase.ts": "reopens the register follow-up task a correction chases",
  "src/lib/courses/sessionChange/didNotHappen.ts": "archives the register follow-up task of a session that did not happen",
};

const WRITE_CALLS = new Set(["update", "set", "create", "add", "updateDoc", "setDoc", "addDoc"]);
const BIRTHS = new Set(["set", "create", "add", "setDoc", "addDoc"]);

function* sourceFiles(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith(".d.ts")) yield full;
  }
}

const unwrap = (node) => {
  let n = node;
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)))) {
    n = n.expression;
  }
  return n;
};

/** Every write of `archived` in one file: `{ line, target: "group" | "unresolved", birth }`. */
function archivedWritesIn(file, text = readFileSync(file, "utf8")) {
  if (!text.includes("archived")) return [];
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const decls = new Map();
  const functions = new Map();
  const assignsArchived = new Set();
  const index = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!decls.has(node.name.text)) decls.set(node.name.text, []);
      decls.get(node.name.text).push(node.initializer);
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) functions.set(node.name.text, node.initializer);
    }
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      const named =
        (ts.isPropertyAccessExpression(left) && left.name.text === "archived") ||
        (ts.isElementAccessExpression(left) && ts.isStringLiteral(left.argumentExpression) && left.argumentExpression.text === "archived");
      if (named && ts.isIdentifier(left.expression)) assignsArchived.add(left.expression.text);
    }
    ts.forEachChild(node, index);
  };
  index(sf);
  const returnsOf = (fn) => {
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
    const out = [];
    const walk = (node) => {
      if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
      if (!ts.isFunctionLike(node)) ts.forEachChild(node, walk);
    };
    if (fn.body) ts.forEachChild(fn.body, walk);
    return out;
  };
  const resolve = (node, depth = 0) => {
    const n = unwrap(node);
    if (!n || depth >= 4) return [n];
    if (ts.isIdentifier(n) && decls.has(n.text)) return decls.get(n.text).flatMap((d) => resolve(d, depth + 1));
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && functions.has(n.expression.text)) {
      return returnsOf(functions.get(n.expression.text)).flatMap((r) => resolve(r, depth + 1));
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return returnsOf(n).flatMap((r) => resolve(r, depth + 1));
    return [n];
  };
  /** The values an object literal gives `archived`, as source text. */
  const archivedIn = (node) => {
    if (!node || !ts.isObjectLiteralExpression(node)) return [];
    return node.properties
      .filter((p) => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "archived")
      .map((p) => (ts.isPropertyAssignment(p) ? unwrap(p.initializer).getText() : "archived"));
  };
  const isOptions = (node) => {
    const n = unwrap(node);
    return Boolean(n && ts.isObjectLiteralExpression(n) && n.properties.length > 0 && n.properties.every((p) => p.name && ["merge", "mergeFields"].includes(p.name.getText())));
  };
  /** The target's text with the constants it is built from, so `groupRef` reads as what it names. */
  const targetText = (node, depth = 0) => {
    const n = unwrap(node);
    let out = n.getText();
    if (depth >= 4) return out;
    const ids = [];
    const collect = (m) => {
      if (ts.isIdentifier(m)) ids.push(m.text);
      ts.forEachChild(m, collect);
    };
    collect(n);
    for (const id of ids) for (const d of decls.get(id) ?? []) out += ` ${targetText(d, depth + 1)}`;
    return out;
  };

  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : null;
      if (name && WRITE_CALLS.has(name)) {
        const args = node.arguments;
        const first = args[0] ? unwrap(args[0]) : null;
        let target = null;
        let data = [];
        const values = [];
        if (!ts.isPropertyAccessExpression(callee)) {
          target = args[0];
          data = args[1] ? [args[1]] : [];
        } else if (first && ts.isStringLiteral(first)) {
          target = callee.expression;
          for (let i = 0; i < args.length; i += 2) {
            const key = unwrap(args[i]);
            if (ts.isStringLiteral(key) && key.text === "archived") values.push(args[i + 1]?.getText() ?? "?");
          }
        } else if (args.length === 1 || isOptions(args[1])) {
          target = callee.expression;
          data = [args[0]];
        } else {
          target = args[0];
          data = args[1] ? [args[1]] : [];
        }
        for (const d of data) {
          const u = unwrap(d);
          if (u && ts.isIdentifier(u) && assignsArchived.has(u.text)) values.push("assigned");
          for (const r of resolve(d)) values.push(...archivedIn(r));
        }
        if (values.length > 0 && target) {
          const named = targetText(target);
          const where = /courseGroups/.test(named) ? "group" : /["'`][A-Za-z]+[/"'`]/.test(named) ? "other" : "unresolved";
          const birth = BIRTHS.has(name) && values.every((v) => v === "false");
          if (where !== "other" && !(where === "group" && birth)) {
            found.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, target: where, values });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("6. nothing else writes a group's archived", () => {
  test("every write of archived in src and scripts is the route's, or listed with why it is not a group's", () => {
    const found = new Map();
    for (const top of ["src", "scripts"]) {
      for (const file of sourceFiles(join(REPO, top))) {
        const path = relative(REPO, file).split("\\").join("/");
        if (path.startsWith("scripts/rules-tests/")) continue;
        const writes = archivedWritesIn(file);
        if (writes.length > 0) found.set(path, writes);
      }
    }
    const listed = { ...THROUGH_THE_CHECKS, ...NOT_A_GROUP };
    const unlisted = [...found].filter(([path]) => !(path in listed));
    assert.deepEqual(
      unlisted.map(([path, writes]) => `${path}: ${writes.map((each) => `line ${each.line} (${each.target}: ${each.values.join(", ")})`).join("; ")}`),
      [],
      "A new write of archived to a group, or one this guard cannot tell is not a group's. A group's archived " +
        "changes only through PATCH /api/courses/groups/[groupId]/archive and its checks; anything else goes in NOT_A_GROUP with why.",
    );
    for (const path of Object.keys(listed)) {
      assert.ok(found.has(path), `${path} is listed but writes no archived any more: take it off the list`);
    }
    for (const path of Object.keys(NOT_A_GROUP)) {
      assert.ok(found.get(path).every((each) => each.target === "unresolved"), `${path} now writes archived to a group`);
    }
  });

  /**
   * THE BACKSTOP, for a writer the walk above cannot follow (a group document
   * built by a function in another module): every object literal with an
   * `archived` key whose value is not `false`, in a file that names
   * `courseGroups`, is listed here with what it is. A new one fails until
   * somebody says it is not a group's archived being written.
   */
  const ARCHIVED_VALUES_BESIDE_GROUPS = {
    "src/app/api/courses/groups/[groupId]/archive/route.ts": "the archive route's own answer and its one write, after the checks",
    "src/app/api/courses/me/route.ts": "a run's archived, read into the member hub's answer",
    "src/app/api/courses/runs/[runId]/archive/route.ts": "archives a run, not a group",
    "src/app/api/courses/runs/[runId]/overview/route.ts": "whether a session's group is still one of the run's, in the run home's view",
    "src/features/courses/courseMutations.ts": "the body the run editor sends to the archive route",
    "src/lib/courses/explainers/schedule.ts": "archives an explainer's tasks, and counts them",
    "src/lib/courses/facilitatingMenuRead.ts": "a run's archived, read into the facilitating menu",
    "src/lib/courses/placesAndName/words.ts": "the places and name routes' refusal sentences, keyed by why",
    "src/lib/courses/roomWords.ts": "a refusal sentence, keyed by why",
    "src/lib/courses/sessionChange/didNotHappen.ts": "archives the register follow-up task",
    "src/lib/firestore/courseDeletion.ts": "marks a run archived as its destroy begins",
    "src/lib/firestore/courseGroups.ts": "the group normaliser, reading the stored field",
    "src/lib/firestore/courses.ts": "a course status's label, and the run normaliser reading the stored field",
    "src/lib/scheduler/jobs/nextWeekEmail.ts": "archives a held next-week email's task",
  };

  test("the backstop: every archived value beside a group, in a file the walk might not follow, is listed with what it is", () => {
    const found = new Set();
    for (const top of ["src", "scripts"]) {
      for (const file of sourceFiles(join(REPO, top))) {
        const path = relative(REPO, file).split("\\").join("/");
        if (path.startsWith("scripts/rules-tests/")) continue;
        const text = readFileSync(file, "utf8");
        if (!text.includes("courseGroups") || !text.includes("archived")) continue;
        const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
        const visit = (node) => {
          if (ts.isObjectLiteralExpression(node)) {
            for (const p of node.properties) {
              const named = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "archived";
              if (named && !(ts.isPropertyAssignment(p) && unwrap(p.initializer).kind === ts.SyntaxKind.FalseKeyword)) found.add(path);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
    }
    assert.deepEqual([...found].filter((path) => !(path in ARCHIVED_VALUES_BESIDE_GROUPS)).sort(), [], "an archived value beside a group, not listed");
    assert.deepEqual(Object.keys(ARCHIVED_VALUES_BESIDE_GROUPS).filter((path) => !found.has(path)), [], "listed, and no longer there");
  });

  test("the guard sees the forms a writer takes", () => {
    const fixtures = [
      ['const ref = db.collection("courseGroups").doc(id); await ref.update({ archived: true });', "group"],
      ['await updateDoc(doc(db, "courseGroups", id), { archived, updatedAt });', "group"],
      ['const patch = { archived: true }; tx.update(db.collection("courseGroups").doc(id), patch);', "group"],
      ['const out = {}; out.archived = x; await db.collection("courseGroups").doc(id).update(out);', "group"],
      ['await db.collection("courseGroups").doc(id).update("archived", true);', "group"],
      ['const shape = () => ({ archived: true }); await db.collection("courseGroups").doc(id).set(shape(), { merge: true });', "group"],
      ["await snap.ref.update({ archived: true });", "unresolved"],
      ['await db.collection("tasks").doc(id).update({ archived: true });', null],
      ['await db.collection("courseGroups").doc(id).set({ name: "G", archived: false });', null],
      ['await db.collection("courseGroups").doc(id).update({ name: "G" });', null],
    ];
    for (const [source, expected] of fixtures) {
      assert.equal(archivedWritesIn("fixture.ts", source)[0]?.target ?? null, expected, source);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. The two ways in
// ---------------------------------------------------------------------------

describe("7. the run editor and the group's page call the route", () => {
  const read = (...parts) => readFileSync(join(REPO, "src", ...parts), "utf8");
  test("the run editor's switch keeps its words and calls the route", () => {
    const editor = read("features", "courses", "GroupEditor.tsx");
    for (const said of [
      'label="Archived"',
      'description="Archived groups stay on the run for the record but drop out of allocation."',
      '"Archiving group…"',
      '"Group archived"',
      '"Restoring group…"',
      '"Group restored"',
    ]) {
      assert.ok(editor.includes(said), said);
    }
    assert.match(editor, /await setGroupArchived\(group\.id, next\);/);
    // A course drafter and a course approver reach the editor and the route refuses them: the switch is disabled, and says who.
    assert.match(editor, /disabled=\{disabled \|\| !canArchive\}/);
    assert.match(editor, /\{!canArchive && <p className=\{styles\.hint\}>\{ARCHIVE_IS_AN_ADMINS\}<\/p>\}/);
    assert.equal(words.ARCHIVE_IS_AN_ADMINS, "Only an admin archives or restores a group here.");
    const runEditor = read("features", "courses", "RunEditor.tsx");
    assert.match(runEditor, /const canArchiveGroups = role === "admin";/);
    assert.match(runEditor, /canArchive=\{canArchiveGroups\}/);
    const mutations = read("features", "courses", "courseMutations.ts");
    assert.match(mutations, /\/api\/courses\/groups\/\$\{encodeURIComponent\(groupId\)\}\/archive/);
    assert.doesNotMatch(mutations, /out\.archived|archived: boolean;\s*\}>;/);
  });

  test("the group's page archives and restores through the same route", () => {
    const panel = read("features", "courses", "groupPage", "ArchiveGroup.tsx");
    assert.match(panel, /\/api\/courses\/groups\/\$\{encodeURIComponent\(groupId\)\}\/archive/);
    const page = read("features", "courses", "groupPage", "GroupPage.tsx");
    assert.match(page, /<ArchiveFoot groupName=\{view\.groupName\} onOpen=\{\(\) => open\(\{ kind: "archive" \}\)\} \/>/);
    assert.match(page, /<ArchivePanel/);
    assert.match(page, /<RestorePanel/);
    // After archiving, the Sessions view says it from the address.
    assert.match(page, /\?archived=\$\{encodeURIComponent\(view\.groupId\)\}/);
  });
});

// ---------------------------------------------------------------------------
// 8. Every route behind the six rows refuses an archived group
// ---------------------------------------------------------------------------

describe("8. nothing behind the six rows changes an archived group", () => {
  const programme = (groupId) => ({ roundId: ROUND, programmeId: AGI, groupId });
  /** Each route the live page's rows press, with a body it would take for Group B while it is live. */
  const PRESSES = [
    // Group D's: the time route changes a time only until Publish has told somebody it, and nobody is in D.
    ["Day and time, the programme's time route", (who) => w.call(who, SIX_ROWS.time.PUT, programme(D), { body: { weekday: 3, start: "18:00", from: { weekday: 1, start: "18:00" } } })],
    ["Day and time, a new regular time from a week", (who) => w.call(who, SIX_ROWS.regular.POST, { groupId: B }, { body: { fromWeek: 5, weekday: 3, time: "18:00", length: 120, room: "Hallward B12", preview: true }, course: true })],
    ["Change this week", (who) => w.call(who, SIX_ROWS.change.POST, { groupId: B }, { body: { reason: AWAY, week: 4, dateKey: TUE_24, kind: "cancel", tell: false }, course: true })],
    ["Room", (who) => w.call(who, SIX_ROWS.room.PUT, programme(B), { body: { room: "Portland A21" } })],
    ["Campus", (who) => w.call(who, SIX_ROWS.campus.PUT, programme(B), { body: { campus: "jubilee" } })],
    ["Meeting link", (who) => w.call(who, SIX_ROWS.link.POST, { groupId: B }, { body: { sessionKey: "w04", url: "https://meet.example/group-b-new", everyWeek: true }, course: true })],
    ["Facilitators", (who) => w.call(who, SIX_ROWS.facilitators.POST, { groupId: B }, { body: { uids: ["rahul"] }, course: true })],
    ["Places", (who) => w.call(who, SIX_ROWS.places.PUT, programme(B), { body: { places: 12 } })],
    ["Name", (who) => w.call(who, SIX_ROWS.name.PUT, programme(B), { body: { name: "Tuesday evenings" } })],
    // And the routes behind the live page's week cards and its other doors.
    ["Take the register in a facilitator's place", (who) => w.call(who, SIX_ROWS.cover.POST, { groupId: B }, { body: { weekNumber: 5 }, course: true })],
    [
      "The group's own pace",
      (who) => {
        const weeks = w.run().weekPlan;
        return w.call(who, SIX_ROWS.pace.PATCH, { groupId: B }, { body: { paceWeekPlan: [...weeks.slice(0, 5), { kind: "break", label: "Reading week" }, ...weeks.slice(5)] }, course: true });
      },
    ],
  ];

  test("each goes through on the live group, so the bodies are ones it takes", async () => {
    for (const [what, go] of PRESSES) {
      w.reset(seed());
      const answer = await go("zach");
      assert.equal(answer.status, 200, `${what}: ${answer.status} ${JSON.stringify(answer.body)}`);
    }
  });

  test("each is refused on the archived group, for an admin and the programme's lead, writing nothing", async () => {
    for (const [what, go] of PRESSES) {
      for (const who of ["zach", "claudia"]) {
        w.reset(seed());
        world.db.poke(`courseGroups/${B}`, { archived: true });
        world.db.poke(`courseGroups/${D}`, { archived: true });
        const before = everything();
        const answer = await go(who);
        assert.notEqual(answer.status, 200, `${what}, ${who}: ${JSON.stringify(answer.body)}`);
        assert.ok([400, 403, 409].includes(answer.status), `${what}, ${who}: ${answer.status}`);
        assert.equal(everything(), before, `${what}, ${who}: wrote something`);
        assert.equal(world.mail.length, 0, `${what}, ${who}: emailed`);
      }
    }
  });

  // Writing to an archived group is refused in tests/course-hub-facilitator-fellows.test.mjs, whose world loads the email route.
  test("covering a session and the pace say why, to an admin", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    for (const [what, sentence] of [
      ["Take the register in a facilitator's place", words.COVER_ARCHIVED],
      ["The group's own pace", words.PACE_ARCHIVED],
    ]) {
      const answer = await PRESSES.find(([each]) => each === what)[1]("zach");
      assert.deepEqual([answer.status, answer.body.error], [409, sentence], what);
    }
  });

  test("the meeting link and the facilitators say why, to an admin", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    const link = await PRESSES.find(([what]) => what === "Meeting link")[1]("zach");
    assert.deepEqual([link.status, link.body.error], [409, words.LINK_ARCHIVED]);
    const facilitators = await PRESSES.find(([what]) => what === "Facilitators")[1]("zach");
    assert.deepEqual([facilitators.status, facilitators.body.error], [409, words.FACILITATORS_ARCHIVED]);
  });
});

describe("startedBeforeRestore, the one question every job asks", () => {
  test("a session that started before the group was last restored, and nothing for a group never restored", () => {
    const restoredAt = new Date("2026-11-19T10:00:00Z");
    assert.equal(restoredLib.startedBeforeRestore({ restoredAt }, new Date("2026-11-16T18:00:00Z")), true);
    assert.equal(restoredLib.startedBeforeRestore({ restoredAt }, new Date("2026-11-23T18:00:00Z")), false);
    assert.equal(restoredLib.startedBeforeRestore({ restoredAt }, restoredAt), false);
    assert.equal(restoredLib.startedBeforeRestore({ restoredAt: null }, new Date("2026-11-16T18:00:00Z")), false);
    assert.equal(restoredLib.startedBeforeRestore({}, new Date("2026-11-16T18:00:00Z")), false);
    assert.equal(restoredLib.startedBeforeRestore({ restoredAt }, null), false);
  });

  test("the two jobs about sessions still to come ask it too", () => {
    for (const job of ["nextWeekEmail", "weekReminders"]) {
      const source = readFileSync(join(REPO, "src", "lib", "scheduler", "jobs", `${job}.ts`), "utf8");
      assert.match(source, /import \{ startedBeforeRestore \} from "@\/lib\/courses\/groupArchive\/restored";/, job);
      assert.match(source, /startedBeforeRestore\(group, /, job);
    }
  });

  test("registerOwed: none while archived, none for a session that started before the restore, and every other one", () => {
    const restoredAt = new Date("2026-11-19T10:00:00Z");
    const before = new Date("2026-11-16T18:00:00Z");
    const after = new Date("2026-11-23T18:00:00Z");
    assert.equal(restoredLib.registerOwed({ archived: true }, after), false);
    assert.equal(restoredLib.registerOwed({ archived: false, restoredAt }, before), false);
    assert.equal(restoredLib.registerOwed({ archived: false, restoredAt }, after), true);
    assert.equal(restoredLib.registerOwed({ archived: false }, before), true);
  });
});

/**
 * EVERY READER OF AN UNFINISHED REGISTER asks whether one is owed
 * (`registerOwed`), walked from the tree: a file that calls the chase's own
 * tests (`isRegisterUnmarked`, `followUpDueAt`, `isWithinFollowUpWindow`), the
 * Attendance tab's facts (`groupSessions`, which carry `owed`), or the group
 * page's ways to take a register (`coverChoicesOf`, `noticeWeekOf`). Each
 * either asks (calls `registerOwed` or reads `owed`), or is listed below with
 * why it asks nobody for a register. Both directions: a listed file must
 * still be a reader, and must not have started asking.
 */
const ASKS_FOR_NO_REGISTER = {
  "src/lib/courses/unmarkedRegisters.ts": "defines the chase's own tests; every caller asks",
  "src/app/api/courses/groups/[groupId]/attendance/push/route.ts": "takes a card off the board once a register is pushed; asks nobody for anything",
  "src/features/courses/groupPage/GroupPage.tsx": "asks through `weekRegisterFacts`, which carries each week's `owed` into `coverChoicesOf` (src/lib/courses/registerCover/pageModel.ts)",
  "src/lib/courses/personPage/load.ts": "one person's attendance record: reads each session's marks and whether it was held; offers no register to take",
  "src/lib/surveys/leadOverview.ts": "counts the sessions held for the reports' card; asks nobody for a register",
};

describe("every reader of an unfinished register asks whether one is owed", () => {
  const READS = /\b(?:isRegisterUnmarked|followUpDueAt|isWithinFollowUpWindow|groupSessions|coverChoicesOf|noticeWeekOf)\(/;
  const DEFINES = /export function (?:groupSessions|coverChoicesOf|noticeWeekOf)\(/;
  const ASKS = /\bregisterOwed\(|\.owed\b|owed === false/;
  const readers = new Map();
  for (const file of sourceFiles(join(REPO, "src"))) {
    const path = relative(REPO, file).split("\\").join("/");
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // A local function of the same name is not the Attendance tab's.
    if (/function groupSessions\(opened/.test(text)) continue;
    if (READS.test(text) || DEFINES.test(text)) readers.set(path, ASKS.test(text));
  }

  test("the walk finds the readers this guard knows by name", () => {
    for (const path of ["src/lib/courses/programmeOverview.ts", "src/lib/scheduler/jobs/registerReminders.ts", "src/lib/scheduler/jobs/unmarkedRegisters.ts"]) {
      assert.ok(readers.has(path), path);
    }
  });

  test("each asks, or is listed with why it asks nobody for a register", () => {
    const silent = [...readers].filter(([path, asks]) => !asks && !(path in ASKS_FOR_NO_REGISTER)).map(([path]) => path);
    assert.deepEqual(silent, [], "a reader of unfinished registers that never asks registerOwed: ask it, or list it with why");
    for (const path of Object.keys(ASKS_FOR_NO_REGISTER)) {
      assert.ok(readers.has(path), `${path} is listed but reads no register any more: take it off the list`);
      assert.equal(readers.get(path), false, `${path} asks registerOwed now: take it off the list`);
    }
  });
});
