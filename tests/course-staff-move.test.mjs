/**
 * MOVING SOMEBODY TO ANOTHER GROUP FOR GOOD, MID-TERM, from their page under
 * the programme, and their weeks following.
 *
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/move
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. THE WEEK IS THE SERVER'S (`src/lib/courses/staffMove/week.ts`): a move
 *     is from the week of the old group's next session still to come (a
 *     session that has started counts as met), offered only when the new
 *     group has a session that week that has not started; each group in its
 *     own week numbers. Every case of the two groups' sessions, a session in
 *     progress, groups out of step both ways, the old group finished, the new
 *     group with no session, a move before anybody has met.
 *  2. WHO MAY: an admin or the programme's lead (a lead who facilitates one of
 *     the groups too, both ways round); a reviewer is told it is not theirs;
 *     a track lead, a facilitator, a member and somebody signed out are
 *     refused; a view-as session never.
 *  3. EVERY REFUSAL, one sentence each, writes nothing.
 *  4. THE PREVIEW EQUALS THE SAVE, and the save answers 409 with the new
 *     facts on a changed week and on a changed count.
 *  5. THE TRANSACTION: the group, the record, both counts, `toldGroupId`, the
 *     markers gone, `allocatedEmailAt` untouched; one history row on each
 *     group, the reason for the lead and admins only.
 *  6. THE EMAILS: each variation's exact words, who gets them, none to the
 *     presser or to somebody without standing, sent after the commit, a
 *     failed send reported and the move kept.
 *  9. A REAL PUBLISH AFTER A MOVE sends nothing about the person; a board
 *     move, as the control, sends its three announcements; a move from week
 *     1 (no record) then a board move back is announced afresh; a second
 *     staff move back a week later sends its own three emails and Publish
 *     then sends nothing; the board refuses a place with a record and Remove
 *     still works. And the moved person's own programme page: their next
 *     session is the new group's week they join from, and the schedule shows
 *     each week from the group they were in.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/hubAttendanceWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Group A meets on Thursdays at 6pm
 * (Sofia) and has met three times; Group B on Tuesdays at 6pm (Rahul and
 * Sofia) meets tonight for week 3; Group C on Wednesdays at 1pm (Tom) meets
 * tomorrow for week 3; Group D on Mondays at 6pm (Grace) met yesterday for
 * week 3. Claudia leads the programme.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__staffMove");
const { world, call } = w;
const moveRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "move");
const words = await w.loadTs(join("lib", "courses", "staffMove", "words.ts"));
const week = await w.loadTs(join("lib", "courses", "staffMove", "week.ts"));
const { resolveSessions } = await w.loadTs(join("lib", "courses", "sessions.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const history = await w.loadTs(join("lib", "courses", "groupHistory", "load.ts"));
const allocationPublish = await w.loadTs(join("lib", "courses", "allocationPublish.ts"));
const audienceLib = await w.loadTs(join("lib", "courses", "updates", "audience.ts"));
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const short = (response) => [response.status, response.body?.error ?? null];
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

const move = (who, uid, body, options = {}) =>
  call(who, moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, viewAs: options.viewAs, course: true });
const preview = (who, uid, toGroupId) => move(who, uid, { toGroupId, preview: true });
/** A press made the way the page makes one: the preview's week and count sent back. */
async function press(who, uid, toGroupId, reason) {
  const shown = await preview(who, uid, toGroupId);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const body = { toGroupId, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails };
  if (reason !== undefined) body.reason = reason;
  return { shown: shown.body.preview, saved: await move(who, uid, body) };
}

/** A snapshot of every document, to prove a refusal wrote nothing. */
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  // The counts the board keeps, as allocation leaves them.
  for (const [groupId, count] of [
    [A, 4],
    [B, 3],
    [C, 2],
    [D, 2],
  ]) {
    world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
});

// ---------------------------------------------------------------------------
// 1. The week rule
// ---------------------------------------------------------------------------

describe("1. the week a move is from", () => {
  const run = () => normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
  const sessionsOf = (groupId) => resolveSessions(run(), normalizeCourseGroup(groupId, read(`courseGroups/${groupId}`)));
  const ruleFor = (from, to) => week.moveWeekOf({ oldSessions: sessionsOf(from), newSessions: sessionsOf(to), now: new Date() });

  test("both met this week: from the next week, which neither has met", () => {
    // Group A met on Thu 12 Nov for week 3 and Group D on Mon 16 Nov.
    const rule = ruleFor(A, D);
    assert.equal(rule.ok, true);
    assert.equal(rule.weekNumber, 4);
    assert.equal(rule.newSession.dateKey, "2026-11-23");
    assert.equal(rule.oldSession.dateKey, "2026-11-19");
  });

  test("old met and new not: from the next week; the new group's week 3 still to come is not given to them", () => {
    // Group A has met week 3; Group B meets for week 3 tonight.
    const rule = ruleFor(A, B);
    assert.deepEqual([rule.ok, rule.weekNumber, rule.newSession.dateKey], [true, 4, "2026-11-24"]);
  });

  test("new met and old not: refused, with when to come back", () => {
    // Group B meets for week 3 tonight; Group A met for week 3 on Thu 12 Nov.
    const rule = ruleFor(B, A);
    assert.equal(rule.ok, false);
    assert.equal(rule.refusal.kind, "new-has-met");
    assert.equal(rule.refusal.weekNumber, 3);
    assert.equal(rule.refusal.oldSession.dateKey, "2026-11-17");
  });

  test("neither met this week: from this week, and they skip the old group's session", () => {
    // Group C meets tomorrow for week 3, Group B tonight.
    const rule = ruleFor(C, B);
    assert.deepEqual([rule.ok, rule.weekNumber, rule.newSession.dateKey, rule.oldSession.dateKey], [true, 3, "2026-11-17", "2026-11-18"]);
  });

  test("a session in progress counts as met", () => {
    at("2026-11-17T18:30:00Z");
    // Group B's week 3 is under way: a move out of it is from week 4.
    assert.deepEqual([ruleFor(B, C).ok, ruleFor(B, C).weekNumber], [true, 4]);
    // And into it: Group B has started week 3, so Group C's people can't join it for that week.
    assert.equal(ruleFor(C, B).refusal.kind, "new-has-met");
  });

  test("groups out of step, both ways: each group in its own week numbers", () => {
    // Out of step one way: Group A (ahead, week 3 met) to Group B (week 3 tonight): week 4, not B's week 3.
    assert.equal(ruleFor(A, B).weekNumber, 4);
    // And the other: Group C (week 3 tomorrow) to Group D (week 3 met yesterday): refused for week 3.
    assert.deepEqual([ruleFor(C, D).refusal.kind, ruleFor(C, D).refusal.weekNumber], ["new-has-met", 3]);
    // Synthetic groups whose numbers differ in the same calendar week.
    const s = (weekNumber, iso) => ({
      weekNumber,
      weekId: `w0${weekNumber}`,
      occurrence: 1,
      sessionKey: `w0${weekNumber}`,
      slotStartKey: iso.slice(0, 10),
      dateKey: iso.slice(0, 10),
      session: { weekday: 1, startTimeLocal: iso.slice(11, 16), durationMinutes: 60, location: "", meetingUrl: null, notes: "" },
      cancelled: false,
    });
    // The old group is at week 4 next (Wed), the new one, a week behind, holds its week 3 on Thu and week 4 the Thu after.
    const ahead = [s(3, "2026-11-11T13:00"), s(4, "2026-11-18T13:00")];
    const lagging = [s(2, "2026-11-12T13:00"), s(3, "2026-11-19T13:00"), s(4, "2026-11-26T13:00")];
    const one = week.moveWeekOf({ oldSessions: ahead, newSessions: lagging, now: new Date() });
    assert.deepEqual([one.ok, one.weekNumber, one.newSession.dateKey], [true, 4, "2026-11-26"]);
    // The other way round: the old group is behind (week 3 next, Thu 19), the new one has met week 3 (Wed 11).
    const other = week.moveWeekOf({ oldSessions: lagging, newSessions: ahead, now: new Date() });
    assert.deepEqual([other.ok, other.refusal.kind, other.refusal.weekNumber], [false, "new-has-met", 3]);
  });

  test("the old group finished: nothing to move them from", () => {
    at("2027-01-10T12:00:00Z");
    assert.equal(ruleFor(A, B).refusal.kind, "old-has-none-left");
  });

  test("the new group with no session that week: refused", () => {
    // Group B's week 4 is called off, keeping pace.
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w04: { kind: "cancelled", reason: "Reading week", dateKey: "2026-11-24", byUid: "claudia", at: new Date() } },
    });
    assert.equal(sessionsOf(B).find((session) => session.weekNumber === 4).cancelled, true);
    assert.deepEqual([ruleFor(A, B).refusal.kind, ruleFor(A, B).refusal.weekNumber], ["new-has-none", 4]);
    world.db.poke(`courseGroups/${B}`, { sessionChanges: {} });
    // A group with no day and time holds no session it can be dated by.
    world.db.poke(`courseGroups/${B}`, { session: { ...read(`courseGroups/${B}`).session, startTimeLocal: "" } });
    assert.deepEqual([ruleFor(A, B).refusal.kind, ruleFor(A, B).refusal.weekNumber], ["new-has-none", 4]);
  });

  // The rule's promise is that no session still to come is left with the old
  // group. Three edges of it, on synthetic sessions (the clock is Tue 17 Nov
  // at noon), and the two refusals through the route in the world's words.
  describe("its edges", () => {
    const s = (weekNumber, iso, over = {}) => ({
      weekNumber,
      weekId: `w0${weekNumber}`,
      occurrence: over.occurrence ?? 1,
      sessionKey: `w0${weekNumber}${(over.occurrence ?? 1) > 1 ? `-${over.occurrence}` : ""}`,
      slotStartKey: iso.slice(0, 10),
      dateKey: iso.slice(0, 10),
      session: { weekday: 1, startTimeLocal: iso.slice(11, 16), durationMinutes: 60, location: "", meetingUrl: null, notes: "" },
      cancelled: over.cancelled ?? false,
    });
    const newGroup = [s(3, "2026-11-12T17:00"), s(4, "2026-11-19T17:00"), s(5, "2026-11-26T17:00"), s(6, "2026-12-03T17:00")];
    const rule = (oldSessions) => week.moveWeekOf({ oldSessions, newSessions: newGroup, now: new Date() });

    test("a week the old group met out of order, still to come: refused until after it", () => {
      // Week 4 moved to Fri 20 Nov, after week 5 met on Mon 16 Nov.
      const out = rule([s(3, "2026-11-04T13:00"), s(4, "2026-11-20T15:00"), s(5, "2026-11-16T13:00"), s(6, "2026-11-25T13:00")]);
      assert.equal(out.ok, false);
      assert.equal(out.refusal.kind, "old-still-to-come");
      assert.deepEqual([out.refusal.session.weekNumber, out.refusal.session.dateKey], [4, "2026-11-20"]);
      assert.equal(
        words.oldStillToComeWords({ firstName: "Leo", fromName: "Group C", weekNumber: 4, dateKey: "2026-11-20", startTimeLocal: "15:00" }),
        "Group C still has a week 4 session to come (Fri 20 Nov, 3pm). Move Leo after that session.",
      );
    });

    test("a second session of a week whose first has started, still to come: refused until after it", () => {
      const out = rule([s(3, "2026-11-10T13:00"), s(4, "2026-11-16T13:00"), s(4, "2026-11-18T13:00", { occurrence: 2 }), s(5, "2026-11-23T13:00")]);
      assert.equal(out.ok, false);
      assert.equal(out.refusal.kind, "old-still-to-come");
      assert.deepEqual([out.refusal.session.weekNumber, out.refusal.session.occurrence, out.refusal.session.dateKey], [4, 2, "2026-11-18"]);
    });

    test("no session with a time at all: nothing to move from", () => {
      const undated = [3, 4, 5].map((n) => ({ ...s(n, "2026-11-18T13:00"), dateKey: "", slotStartKey: "", session: { ...s(n, "2026-11-18T13:00").session, startTimeLocal: "" } }));
      assert.deepEqual(rule(undated).refusal, { kind: "old-has-none-set" });
      assert.deepEqual(rule([]).refusal, { kind: "old-has-none-set" });
      assert.equal(words.oldHasNoneSetWords("Leo", "Group C"), "Group C has no sessions set, so there is nothing to move Leo from.");
    });

    test("an undated week between the last week met and the next dated one stays with the old group, as the rule is written", () => {
      // Week 3 met; week 4 has no time; week 5 is dated and still to come: the move is from week 5, and week 4,
      // with no session to go to anywhere, stays with the old group. Left as it is, and said in the docs.
      const undated = { ...s(4, "2026-11-18T13:00"), dateKey: "", slotStartKey: "", session: { ...s(4, "2026-11-18T13:00").session, startTimeLocal: "" } };
      const out = rule([s(3, "2026-11-10T13:00"), undated, s(5, "2026-11-24T13:00")]);
      assert.deepEqual([out.ok, out.weekNumber, out.newSession.dateKey], [true, 5, "2026-11-26"]);
    });

    test("the group they are in now no longer meets: its own sentence", () => {
      assert.equal(words.oldNoLongerMeetsWords("Leo", "Group C"), "Group C no longer meets, so there is nothing to move Leo from.");
      assert.equal(words.oldNoLongerMeetsWords("", "Group C"), "Group C no longer meets, so there is nothing to move them from.");
    });

    test("the old group's week 4 called off, keeping pace: from week 5, though the new group meets in week 4", () => {
      const out = rule([s(3, "2026-11-11T13:00"), s(4, "2026-11-18T13:00", { cancelled: true }), s(5, "2026-11-25T13:00")]);
      assert.deepEqual([out.ok, out.weekNumber, out.newSession.dateKey], [true, 5, "2026-11-26"]);
    });

    test("through the route: a group with no time set is refused in one sentence, and nothing is written", async () => {
      // Group D, Freya's, with no time: no session can be dated.
      world.db.poke(`courseGroups/${D}`, { session: { ...read(`courseGroups/${D}`).session, startTimeLocal: "" } });
      const before = everything();
      const unset = await preview("claudia", "freya", C);
      assert.deepEqual(short(unset), [409, "Group D has no sessions set, so there is nothing to move Freya from."]);
      const pressed = await move("claudia", "freya", { toGroupId: C, weekNumber: 4, emailCount: 3 });
      assert.deepEqual(short(pressed), [409, "Group D has no sessions set, so there is nothing to move Freya from."]);
      assert.equal(everything(), before, "the refusal wrote nothing");
    });
  });

  test("a move before anybody has met is from week 1", () => {
    at("2026-10-20T12:00:00Z");
    assert.deepEqual([ruleFor(A, B).ok, ruleFor(A, B).weekNumber], [true, 1]);
  });

  test("the weeks that come with them: from the week they joined to the week before", () => {
    assert.deepEqual(week.weeksThatCome(1, 4), [1, 2, 3]);
    assert.deepEqual(week.weeksThatCome(2, 4), [2, 3]);
    assert.deepEqual(week.weeksThatCome(1, 1), []);
    assert.deepEqual(week.weeksThatCome(5, 4), []);
  });
});

// ---------------------------------------------------------------------------
// 2. Who may
// ---------------------------------------------------------------------------

describe("2. who may", () => {
  test("an admin and the programme's lead are answered the preview", async () => {
    for (const who of ["zach", "claudia"]) {
      const shown = await preview(who, "freya", C);
      assert.equal(shown.status, 200, `${who}: ${JSON.stringify(shown.body)}`);
      assert.deepEqual(Object.keys(shown.body).sort(), ["ok", "preview"]);
      assert.equal(shown.body.preview.weekNumber, 4);
    }
  });

  test("a reviewer is told it is not theirs; a track lead, a facilitator, a member, another lead and nobody are refused", async () => {
    const before = everything();
    assert.deepEqual(short(await preview("lloyd", "freya", C)), [403, words.MOVE_REFUSAL.notYours]);
    for (const who of ["yusuf", "rahul", "tom", "amara", "tess", "nobody"]) {
      assert.deepEqual(short(await preview(who, "freya", C)), [404, words.MOVE_REFUSAL.noProgramme], who);
      assert.deepEqual(short(await move(who, "freya", { toGroupId: C, weekNumber: 4, emailCount: 3 })), [404, words.MOVE_REFUSAL.noProgramme], who);
    }
    assert.equal((await preview(null, "freya", C)).status, 401);
    assert.equal(everything(), before, "nothing was written");
  });

  test("a view-as session is turned away before anything is read", async () => {
    const before = everything();
    const answer = await move("zach", "freya", { toGroupId: C, weekNumber: 4, emailCount: 3 }, { viewAs: true });
    assert.equal(answer.status, 403);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a lead who facilitates one of the two groups may still move people, both ways round, and is never emailed", async () => {
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "claudia"] });
    // Out of the group they facilitate: Hamza, Group C to Group B, from week 3.
    const out = await press("claudia", "hamza", B);
    assert.equal(out.saved.status, 200, JSON.stringify(out.saved.body));
    assert.equal(seat("hamza").groupId, B);
    // Into it: Freya, Group D to Group C, from week 4.
    const into = await press("claudia", "freya", C);
    assert.equal(into.saved.status, 200, JSON.stringify(into.saved.body));
    assert.equal(seat("freya").groupId, C);
    assert.ok(!world.mail.some((message) => message.to === "claudia@example.com"), "the presser is never emailed");
  });
});

// ---------------------------------------------------------------------------
// 3. Every refusal writes nothing
// ---------------------------------------------------------------------------

describe("3. every refusal, one sentence, nothing written", () => {
  async function refused(uid, toGroupId, expected, status = 409) {
    const before = everything();
    const answer = await preview("zach", uid, toGroupId);
    assert.deepEqual(short(answer), [status, expected], `${uid} to ${toGroupId}`);
    const saved = await move("zach", uid, { toGroupId, weekNumber: 4, emailCount: 3 });
    assert.deepEqual(short(saved), [status, expected], `${uid} to ${toGroupId}, pressed`);
    assert.equal(everything(), before, "nothing was written");
    assert.equal(world.mail.length, 0);
  }

  test("not an active learner's place in a group", async () => {
    await refused("sam", B, words.MOVE_REFUSAL.noPlace, 404);
    await refused("omar", B, words.MOVE_REFUSAL.noPlace, 404);
    await refused("nobody", B, words.MOVE_REFUSAL.noPlace, 404);
  });

  test("a place not told its group yet", async () => {
    await refused("una", B, words.notToldWords("Una"));
    assert.equal(
      words.notToldWords("Leo"),
      "Leo hasn’t been told a group yet. Groups that haven’t gone out are changed in Arrange and told at Publish.",
    );
  });

  test("somebody who facilitates a group on the run", async () => {
    world.db.poke(`courseGroups/${D}`, { facilitatorUids: ["grace", "hamza"] });
    await refused("hamza", B, words.facilitatesWords("Hamza", "Group D"));
  });

  test("a group missing, archived, of another run, or theirs", async () => {
    await refused("freya", "no-such-group", words.MOVE_REFUSAL.noGroup, 404);
    world.db.poke(`courseGroups/${B}`, { archived: true });
    await refused("freya", B, words.archivedWords("Group B"));
    world.db.poke(`courseGroups/${B}`, { archived: false, runId: RUN.tais });
    await refused("freya", B, words.MOVE_REFUSAL.noGroup, 404);
    world.db.poke(`courseGroups/${B}`, { runId: RUN.agi });
    await refused("freya", D, words.alreadyInWords("Freya", "Group D"));
  });

  test("a full group: reaching the limit is allowed, passing it is not", async () => {
    world.db.poke(`courseGroups/${C}`, { capacity: 2, memberCount: 2 });
    await refused("freya", C, words.fullWords("Group C", 2, 2));
    world.db.poke(`courseGroups/${C}`, { capacity: 3, memberCount: 2 });
    const { saved, shown } = await press("zach", "freya", C);
    assert.equal(saved.status, 200);
    assert.equal(shown.lines[0].text, "From week 4, Freya is in Group C, which then has 3, its limit.");
  });

  test("a run with one group, an incubator's, one that is over, one being destroyed", async () => {
    for (const groupId of [A, B, C]) world.db.poke(`courseGroups/${groupId}`, { archived: true });
    await refused("freya", C, words.MOVE_REFUSAL.oneGroup);
    for (const groupId of [A, B, C]) world.db.poke(`courseGroups/${groupId}`, { archived: false });
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    await refused("freya", C, words.MOVE_REFUSAL.runOver);
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "running", destroying: true });
    await refused("freya", C, words.MOVE_REFUSAL.runGone);
  });

  test("the week rule's three refusals, with the names, weeks and times filled in", async () => {
    await refused(
      "chloe",
      A,
      "Group A has already met for week 3, so Chloe can’t join it for that week. To move Chloe from week 4, come back after Group B’s week 3 session (Tue 17 Nov, 6pm).",
    );
    world.db.poke(`courseGroups/${C}`, { session: { ...read(`courseGroups/${C}`).session, startTimeLocal: "" } });
    await refused("freya", C, "Group C has no session for week 4.");
    at("2027-01-10T12:00:00Z");
    await refused("freya", B, "Group D has no sessions left, so there is nothing to move Freya from.");
  });

  test("a body that is not one", async () => {
    for (const body of [null, [], { toGroupId: "" }, { toGroupId: C, extra: 1 }, { toGroupId: C }, { toGroupId: C, weekNumber: 4 }]) {
      assert.equal((await move("zach", "freya", body)).status, 400, JSON.stringify(body));
    }
    assert.deepEqual(short(await move("zach", "freya", { toGroupId: C, weekNumber: 4, emailCount: 3, reason: "two\nlines" })), [400, words.MOVE_REFUSAL.reasonLine]);
    assert.deepEqual(short(await move("zach", "freya", { toGroupId: C, weekNumber: 4, emailCount: 3, reason: "see https://example.com" })), [400, words.MOVE_REFUSAL.reasonLink]);
    assert.equal((await move("zach", "freya", { toGroupId: C, weekNumber: 4, emailCount: 3, reason: "x".repeat(201) })).status, 400);
  });
});

// ---------------------------------------------------------------------------
// 4. The preview and the save
// ---------------------------------------------------------------------------

describe("4. the preview equals the save; 409 on a changed week or count", () => {
  test("the preview draws the board's lines and the email to the person", async () => {
    const shown = (await preview("zach", "freya", C)).body.preview;
    assert.equal(shown.weekStated, "Week 4 · Group C meets Wed 25 Nov");
    assert.equal(shown.weeksStay, "Weeks 1 to 3 stay with Group D, where Freya met.");
    assert.equal(shown.skipsOld, "Freya won’t go to Group D’s session on Mon 23 Nov. To move Freya from week 5 instead, come back after that session.");
    assert.deepEqual(
      shown.lines.map((line) => line.label),
      ["Group", "Work", "Attendance", "Late, reminders", "Registers"],
    );
    assert.equal(shown.lines[0].text, "From week 4, Freya is in Group C, which then has 3.");
    assert.equal(shown.lines[1].text, "Tom can read Freya’s weeks 1 to 3. Grace no longer can.");
    assert.equal(shown.lines[2].text, "Weeks 1 to 3 with Group D and every week with Group C read as one record on Freya’s page.");
    assert.equal(shown.lines[3].text, "Group C’s Wednesday times from week 4.");
    assert.equal(shown.lines[4].text, "Freya leaves Group D’s from week 4 and joins Group C’s.");
    assert.deepEqual(shown.told, {
      count: "3 emails",
      rest: ": Freya, Tom and Grace. A move made here mid-term emails on save; moves in Arrange before groups go out still wait for Publish.",
    });
    assert.equal(shown.button, "Move Freya to Group C and email 3 people");
    assert.equal(shown.emails, 3);
    assert.deepEqual(shown.personEmail, {
      heading: "To Freya",
      subject: "You’re moving to Group C",
      lines: [
        "From week 4 you’re in Group C: Wednesdays, 1pm to 3pm, Room B8, with Tom. Your first session with them is Wed 25 Nov.",
        "Your work and feedback from weeks 1 to 3 come with you.",
        "From week 4 you’re no longer in Group D, so you don’t need to go to its sessions.",
      ],
    });
    assert.ok(!JSON.stringify(shown).includes("@example.com"), "no address is in the answer");
  });

  test("the save answers what the preview said, and emails exactly the people it counted", async () => {
    const { shown, saved } = await press("zach", "freya", C);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(Object.keys(saved.body).sort(), ["emails", "fromGroupId", "message", "ok", "toGroupId", "weekNumber"]);
    assert.equal(saved.body.weekNumber, shown.weekNumber);
    assert.deepEqual(saved.body.emails, { sent: 3, suppressed: 0, failed: 0 });
    assert.equal(world.mail.length, shown.emails);
    assert.deepEqual(world.mail.map((message) => [message.to, message.kind]), [
      ["freya@example.com", "course-move"],
      ["tom@example.com", "course-move"],
      ["grace@example.com", "course-move"],
    ]);
    assert.equal(saved.body.message, "Freya is in Group C from week 4. 3 emails sent.");
  });

  test("a changed week: 409 with the new week, nothing written", async () => {
    at("2026-11-17T17:00:00Z");
    const shown = (await preview("zach", "chloe", C)).body.preview;
    assert.equal(shown.weekNumber, 3);
    // Group B's week 3 starts between the preview and the press.
    at("2026-11-17T18:30:00Z");
    const before = everything();
    const answer = await move("zach", "chloe", { toGroupId: C, weekNumber: 3, emailCount: shown.emails });
    assert.equal(answer.status, 409);
    // Chloe, Tom, and Group B's Rahul and Sofia.
    assert.deepEqual([answer.body.weekNumber, answer.body.emails], [4, 4]);
    assert.equal(answer.body.error, words.changedWords(4, 4));
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a changed count: 409 with the new count, nothing written", async () => {
    const shown = (await preview("zach", "freya", C)).body.preview;
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "rahul"] });
    const before = everything();
    const answer = await move("zach", "freya", { toGroupId: C, weekNumber: shown.weekNumber, emailCount: shown.emails });
    assert.equal(answer.status, 409);
    assert.deepEqual([answer.body.weekNumber, answer.body.emails], [4, 4]);
    assert.equal(everything(), before);
  });

  test("a count that changes inside the transaction is caught there", async () => {
    const shown = (await preview("zach", "freya", C)).body.preview;
    // Tom loses his address after the plan was read and before the transaction reads it.
    let once = true;
    const real = world.courseDb.runTransaction.bind(world.courseDb);
    world.courseDb.runTransaction = async (fn) => {
      if (once) {
        once = false;
        world.db.poke("users/tom", { email: "" });
      }
      return real(fn);
    };
    try {
      const answer = await move("zach", "freya", { toGroupId: C, weekNumber: shown.weekNumber, emailCount: shown.emails });
      assert.equal(answer.status, 409);
      assert.equal(answer.body.emails, 2);
      assert.equal(seat("freya").groupId, D);
    } finally {
      world.courseDb.runTransaction = real;
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The transaction
// ---------------------------------------------------------------------------

describe("5. what the save writes", () => {
  test("the group, the record, both counts, toldGroupId, the markers gone, allocatedEmailAt untouched", async () => {
    const was = read(seatPath("freya"));
    // A marker from an earlier Publish about Freya joining Group D, and one about her leaving Group C.
    const joined = allocationPublish.joinedMarkerId(RUN.agi, D, "grace", "freya");
    const left = allocationPublish.leftMarkerId(RUN.agi, C, "tom", "freya");
    const other = allocationPublish.joinedMarkerId(RUN.agi, D, "grace", "yasmin");
    for (const id of [joined, left, other]) world.db.seed(`courseNudges/${id}`, { runId: RUN.agi, state: "sent" });
    const { saved } = await press("zach", "freya", C);
    assert.equal(saved.status, 200);
    const now = read(seatPath("freya"));
    assert.equal(now.groupId, C);
    assert.deepEqual(now.groupsByWeek, [
      { groupId: D, fromWeek: 1 },
      { groupId: C, fromWeek: 4 },
    ]);
    assert.equal(now.toldGroupId, C);
    assert.equal(+now.allocatedEmailAt, +was.allocatedEmailAt, "the instant Late is measured from is untouched");
    assert.equal(read(`courseGroups/${D}`).memberCount, 1);
    assert.equal(read(`courseGroups/${C}`).memberCount, 3);
    assert.equal(read(`courseNudges/${joined}`), undefined);
    assert.equal(read(`courseNudges/${left}`), undefined);
    assert.ok(read(`courseNudges/${other}`), "nobody else's marker is touched");
    const placed = seat("freya");
    assert.equal(enrolments.movedSinceTold(placed), false, "the next Publish owes nothing for this move");
    assert.deepEqual([1, 3, 4, 5].map((n) => enrolments.groupForWeek(placed, n)), [D, D, C, C]);
  });

  test("a move before anybody has met leaves no record: a plain move, and the emails still go", async () => {
    at("2026-10-20T12:00:00Z");
    const { shown, saved } = await press("zach", "freya", C);
    assert.equal(saved.status, 200);
    assert.equal(shown.weekNumber, 1);
    assert.equal("groupsByWeek" in read(seatPath("freya")), false);
    assert.equal(read(seatPath("freya")).groupId, C);
    assert.equal(world.mail.length, 3);
    assert.equal(shown.weeksStay, "");
    assert.equal(shown.lines[1].text, "Tom can read Freya’s work. Grace no longer can.");
    assert.equal(shown.lines[2].text, "Every week with Group C reads on Freya’s page.");
  });

  test("one history row on each group; the reason for the lead and admins only", async () => {
    const reason = "Has a lab on Mondays from week 4";
    const { saved } = await press("zach", "freya", C, reason);
    assert.equal(saved.status, 200);
    const out = await history.loadGroupHistory(world.db, RUN.agi, D, { facilitatorRecord: true });
    const into = await history.loadGroupHistory(world.db, RUN.agi, C, { facilitatorRecord: true });
    const row = (rows) => rows.rows.find((each) => each.kind === "member-moved");
    assert.equal(row(out).detail, `Freya Thompson moved to Group C from week 4. Reason: ${reason}`);
    assert.equal(row(into).detail, `Freya Thompson moved here from Group D, from week 4. Reason: ${reason}`);
    for (const each of [row(out), row(into)]) {
      assert.equal(each.category, "people");
      assert.equal(each.reason, reason);
      assert.equal(each.subjectUid, "freya");
      assert.equal(each.weekId, "w04");
      assert.equal(each.emailed, 3);
      assert.equal(each.label, "Moved to another group for good");
    }
    // A group's facilitators see the row and never the reason.
    const forFacilitator = await history.loadGroupHistory(world.db, RUN.agi, C, {});
    assert.equal(row(forFacilitator).detail, "Freya Thompson moved here from Group D, from week 4.");
    assert.equal(row(forFacilitator).reason, null);
    // The reason is in no email.
    assert.ok(!JSON.stringify(world.mail).includes("lab on Mondays"));
  });

  // Two spaces, a tab, a non-breaking space, and space either side: the
  // reason is kept and put in the sentence in one form, so the row a
  // facilitator reads never carries it, however it was typed.
  for (const typed of ["Has a lab on Mondays", "Has a lab  on Mondays", "Has a lab\ton Mondays", "Has a lab\u00a0on Mondays", "  Has a lab on Mondays "]) {
    test(`the reason ${JSON.stringify(typed)} is kept in one form, and never on a facilitator's row`, async () => {
      const { saved } = await press("claudia", "freya", C, typed);
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const row = (rows) => rows.rows.find((each) => each.kind === "member-moved");
      for (const groupId of [C, D]) {
        const forLead = row(await history.loadGroupHistory(world.db, RUN.agi, groupId, { facilitatorRecord: true }));
        assert.equal(forLead.reason, "Has a lab on Mondays");
        assert.ok(forLead.detail.endsWith(" Reason: Has a lab on Mondays"), forLead.detail);
        const forFacilitator = row(await history.loadGroupHistory(world.db, RUN.agi, groupId, {}));
        assert.equal(forFacilitator.reason, null);
        assert.ok(!forFacilitator.detail.includes("Reason"), forFacilitator.detail);
        assert.ok(!forFacilitator.detail.includes("lab"), forFacilitator.detail);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 6. The emails
// ---------------------------------------------------------------------------

describe("6. the emails", () => {
  const facts = (over = {}) => ({
    personName: "Leo Park",
    personFirstName: "Leo",
    weekNumber: 3,
    weeksThatCome: [1, 2],
    to: {
      name: "Group F",
      session: { weekday: 4, startTimeLocal: "17:00", durationMinutes: 120, location: "George Green B06" },
      facilitatorFirstNames: ["Harriet"],
    },
    fromName: "Group C",
    firstSessionDateKey: "2026-11-19",
    ...over,
  });

  test("the approved words, word for word", () => {
    assert.deepEqual(words.personEmailWords(facts()), {
      subject: "You’re moving to Group F",
      lines: [
        "From week 3 you’re in Group F: Thursdays, 5pm to 7pm, George Green B06, with Harriet. Your first session with them is Thu 19 Nov.",
        "Your work and feedback from weeks 1 and 2 come with you.",
        "From week 3 you’re no longer in Group C, so you don’t need to go to its sessions.",
      ],
      button: "Open your programme page",
      footnote: "",
    });
    assert.deepEqual(words.newFacilitatorsEmailWords(facts()), {
      subject: "Leo Park joins Group F from week 3",
      lines: ["Leo Park is moving to Group F from week 3, starting Thu 19 Nov.", "You can read Leo’s work from weeks 1 and 2, with the feedback on it."],
      button: "Open your group",
      footnote: "This is an automated email, sent because somebody was moved into your group.",
    });
    assert.deepEqual(words.oldFacilitatorsEmailWords(facts(), true), {
      subject: "Leo Park leaves Group C from week 3",
      lines: [
        "Leo Park is moving to Group F from week 3. Leo comes off your register from then, and you’ll no longer be able to read Leo’s work.",
        "The feedback you gave stays on Leo’s page, signed by you.",
      ],
      button: "Open your group",
      footnote: "This is an automated email, sent because somebody was moved out of your group.",
    });
  });

  test("the variations: one week, three or more, none; a group missing a part; no feedback given", () => {
    assert.equal(words.personEmailWords(facts({ weeksThatCome: [1] })).lines[1], "Your work and feedback from week 1 come with you.");
    assert.equal(words.newFacilitatorsEmailWords(facts({ weeksThatCome: [1] })).lines[1], "You can read Leo’s work from week 1, with the feedback on it.");
    assert.equal(words.personEmailWords(facts({ weeksThatCome: [1, 2, 3], weekNumber: 4 })).lines[1], "Your work and feedback from weeks 1 to 3 come with you.");
    // None: the sentence is left out of all three.
    const none = facts({ weeksThatCome: [], weekNumber: 1 });
    assert.equal(words.personEmailWords(none).lines.length, 2);
    assert.equal(words.newFacilitatorsEmailWords(none).lines.length, 1);
    assert.equal(words.oldFacilitatorsEmailWords(none, false).lines.length, 1);
    // The group's line is built from what it has.
    const noRoom = facts({ to: { ...facts().to, session: { ...facts().to.session, location: "" } } });
    assert.match(words.personEmailWords(noRoom).lines[0], /^From week 3 you’re in Group F: Thursdays, 5pm to 7pm, with Harriet\. /);
    const nothing = facts({ to: { name: "Group F", session: { weekday: -1, startTimeLocal: "", durationMinutes: 0, location: "" }, facilitatorFirstNames: [] } });
    assert.equal(words.personEmailWords(nothing).lines[0], "From week 3 you’re in Group F. Your first session with them is Thu 19 Nov.");
    // A room that is a link is never printed.
    const link = facts({ to: { ...facts().to, session: { ...facts().to.session, location: "https://meet.example.com/abc" } } });
    assert.ok(!words.personEmailWords(link).lines[0].includes("https"));
    // Two facilitators.
    const two = facts({ to: { ...facts().to, facilitatorFirstNames: ["Harriet", "Rahul"] } });
    assert.match(words.personEmailWords(two).lines[0], /with Harriet and Rahul\./);
    // "The feedback you gave" only to a facilitator who gave some.
    assert.equal(words.oldFacilitatorsEmailWords(facts(), false).lines.length, 1);
  });

  test("who gets them: the person and both groups' facilitators with standing and an address, never the presser, once each", async () => {
    // Rahul has no address; Sofia facilitates both groups and is told once, as the new group's.
    world.db.poke("users/rahul", { email: "" });
    const { saved } = await press("zach", "amara", B);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(world.mail.map((message) => [message.to, message.subject]), [
      ["amara@example.com", "You’re moving to Group B"],
      ["sofia@example.com", "Amara Okafor joins Group B from week 4"],
    ]);
  });

  test("a facilitator with no standing is not told, and the count says so", async () => {
    // Grace's account no longer stands behind the role.
    world.db.poke("users/grace", { role: "rejected" });
    const shown = (await preview("zach", "freya", C)).body.preview;
    assert.equal(shown.emails, 2);
    assert.equal(shown.told.rest.startsWith(": Freya and Tom."), true, shown.told.rest);
    const saved = await move("zach", "freya", { toGroupId: C, weekNumber: shown.weekNumber, emailCount: shown.emails });
    assert.equal(saved.status, 200);
    assert.deepEqual(world.mail.map((message) => message.to), ["freya@example.com", "tom@example.com"]);
  });

  test("the feedback line goes only to a facilitator who gave this person feedback", async () => {
    world.db.seed("courseFeedback/f1", { runId: RUN.agi, uid: "freya", weekId: "w02", weekNumber: 2, on: { kind: "week" }, text: "Good.", byUid: "grace", byRole: "facilitator" });
    const { saved, shown } = await press("zach", "freya", C);
    assert.equal(saved.status, 200);
    assert.equal(shown.lines[1].text, "Tom can read Freya’s weeks 1 to 3, with Grace’s feedback on them. Grace no longer can; that feedback stays on Freya’s page, signed by Grace.");
    const grace = world.mail.find((message) => message.to === "grace@example.com");
    assert.ok(JSON.stringify(grace).includes("The feedback you gave stays on Freya’s page, signed by you."));
  });

  test("sent after the commit; a failed send is reported and the move kept", async () => {
    world.mailFate = (args) => (args.to === "tom@example.com" ? "fail" : "sent");
    const { saved } = await press("zach", "freya", C);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.emails, { sent: 2, suppressed: 0, failed: 1 });
    assert.equal(saved.body.message, "Freya is in Group C from week 4. 2 emails sent. 1 email could not be sent; the move is kept.");
    assert.equal(read(seatPath("freya")).groupId, C);
  });
});

// ---------------------------------------------------------------------------
// 7. Left behind, and a move back
// ---------------------------------------------------------------------------

describe("7. what the move leaves behind, and a move back", () => {
  test("an excusal and a waiting request on the old group from week N on are named", async () => {
    world.db.seed(`courseAttendance/${RUN.agi}__${D}__w04`, { runId: RUN.agi, groupId: D, weekNumber: 4, occurrence: 1, records: {}, excusedInAdvance: { freya: new Date() } });
    world.db.seed("courseRequests/r1", {
      kind: "excused",
      runId: RUN.agi,
      groupId: D,
      subjectUid: "freya",
      askedByUid: "freya",
      status: "waiting",
      change: { weeks: [{ sessionKey: "w05", weekNumber: 5, occurrence: 1, dateKey: "2026-11-30", status: "waiting" }] },
      createdAt: new Date(),
    });
    const shown = (await preview("zach", "freya", C)).body.preview;
    const left = shown.lines.find((line) => line.label === "Left behind");
    assert.ok(left, JSON.stringify(shown.lines));
    assert.match(left.text, /^Freya was excused from Group D’s week 4 session\. That no longer applies once Freya moves\./);
  });

  test("a move back before anything met leaves no record and is announced by its own emails", async () => {
    at("2026-11-17T13:00:00Z");
    // Hamza, Group C to Group B from week 3 (both meet later this week), then straight back.
    assert.equal((await press("zach", "hamza", B)).saved.status, 200);
    assert.deepEqual(read(seatPath("hamza")).groupsByWeek, [
      { groupId: C, fromWeek: 1 },
      { groupId: B, fromWeek: 3 },
    ]);
    world.mail.length = 0;
    const back = await press("zach", "hamza", C);
    assert.equal(back.saved.status, 200, JSON.stringify(back.saved.body));
    assert.equal(back.shown.weekNumber, 3, "Group B's week 2 was never Hamza's: the move back is from week 3");
    assert.equal("groupsByWeek" in read(seatPath("hamza")), false);
    assert.equal(read(seatPath("hamza")).toldGroupId, C);
    assert.ok(world.mail.some((message) => message.subject === "You’re moving to Group C"));
  });
});

// ---------------------------------------------------------------------------
// 8. A notice about one session reaches that week's people
// ---------------------------------------------------------------------------

describe("8. a notice about ONE session goes to the people of that session's week", () => {
  const { updateEmailAudience } = audienceLib;
  const runOf = () => ({ id: RUN.agi });
  const groupOf = (groupId) => normalizeCourseGroup(groupId, read(`courseGroups/${groupId}`));
  const who = async (groupId, weekNumber) =>
    (await updateEmailAudience(world.db, runOf(), [groupOf(groupId)], "group", groupId, "zach", { withFacilitators: true, weekNumber })).recipients
      .map((each) => each.uid)
      .sort();

  test("moved from the next week to meet: told about the new group's sessions from that week, the old group's before it", async () => {
    const { saved } = await press("zach", "freya", C);
    assert.equal(saved.status, 200);
    assert.ok(!(await who(C, 3)).includes("freya"), "not about Group C's week 3, a week spent in Group D");
    assert.ok((await who(C, 4)).includes("freya"));
    assert.ok((await who(D, 3)).includes("freya"), "about Group D's week 3, put right after it met");
    assert.ok(!(await who(D, 4)).includes("freya"));
  });

  test("moved from two weeks ahead: the weeks between stay with the old group", async () => {
    world.db.poke(seatPath("freya"), { groupId: C, groupsByWeek: [{ groupId: D, fromWeek: 1 }, { groupId: C, fromWeek: 6 }] });
    assert.ok((await who(D, 5)).includes("freya"));
    assert.ok(!(await who(C, 5)).includes("freya"));
    assert.ok((await who(C, 6)).includes("freya"));
  });

  test("with no record anywhere: exactly the people the notice reached before, week or no week", async () => {
    for (const groupId of [A, B, C, D]) {
      const before = (await updateEmailAudience(world.db, runOf(), [groupOf(groupId)], "group", groupId, "zach", { withFacilitators: true })).recipients
        .map((each) => each.uid)
        .sort();
      for (const weekNumber of [1, 3, 4]) assert.deepEqual(await who(groupId, weekNumber), before, `${groupId} week ${weekNumber}`);
    }
  });

  test("the one-week change, the cover notice and a corrected column's tell hand the session's week; a regular time does not", () => {
    const source = (...parts) => readFileSync(join(SRC_ROOT, ...parts), "utf8");
    const change = source("app", "api", "courses", "groups", "[groupId]", "session", "change", "route.ts");
    assert.match(change, /toldFacts\(db, run, found, actor\.uid, press\.weekNumber\)/);
    assert.match(change, /withFacilitators: true,\s*\/\/[^\n]*\n\s*weekNumber: press\.weekNumber,/);
    const cover = source("app", "api", "courses", "groups", "[groupId]", "attendance", "cover", "route.ts");
    assert.match(cover, /updateEmailAudience\(db, run, \[group\], "group", group\.id, actor\.uid, \{ weekNumber: session\.weekNumber \}\)/);
    const column = source("lib", "courses", "registerCorrection", "column.ts");
    assert.match(column, /toldFacts\(db, run, group, actor\.uid, session\.weekNumber\)/);
    assert.match(column, /withFacilitators: true,\s*weekNumber: session\.weekNumber,/);
    const regular = source("app", "api", "courses", "groups", "[groupId]", "session", "regular", "route.ts");
    assert.match(regular, /toldFacts\(db, run, found, actor\.uid\),/);
  });
});

// ---------------------------------------------------------------------------
// 9. Publish after a move, and the moved person's own programme page
// ---------------------------------------------------------------------------

describe("9. a real Publish after a move, and the person's own page", () => {
  const sent = () => world.mail.map((mail) => [mail.to, mail.subject, mail.kind]);
  const aboutFreya = () => JSON.stringify(world.mail).match(/freya/gi)?.length ?? 0;
  const publish = () => w.join.publish("claudia");

  test("a staff move, then Publish: nothing is sent about the person", async () => {
    assert.equal((await publish()).status, 200);
    world.mail.length = 0;
    const { saved } = await press("claudia", "freya", C);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(sent(), [
      ["freya@example.com", "You’re moving to Group C", "course-move"],
      ["tom@example.com", "Freya Thompson joins Group C from week 4", "course-move"],
      ["grace@example.com", "Freya Thompson leaves Group D from week 4", "course-move"],
    ]);
    world.mail.length = 0;
    const again = await publish();
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual(sent(), []);
    assert.equal(aboutFreya(), 0);
  });

  test("the control: a board move with no record, then Publish, sends its three announcements", async () => {
    await publish();
    world.mail.length = 0;
    const placed = await w.join.place("claudia", [{ uid: "freya", groupId: C }]);
    assert.equal(placed.body.placed, 1);
    assert.equal((await publish()).status, 200);
    assert.deepEqual(sent(), [
      ["freya@example.com", "You’ve moved to Group C: Wednesdays at 1pm", "course-application"],
      ["tom@example.com", "Freya has joined Group C", "course-application"],
      ["grace@example.com", "Freya is no longer in Group D", "course-application"],
    ]);
  });

  test("a move from week 1 leaves no record; a board move back is then announced afresh by Publish", async () => {
    at("2026-10-20T12:00:00Z");
    await publish();
    const { saved, shown } = await press("claudia", "freya", C);
    assert.equal(saved.status, 200);
    assert.equal(shown.weekNumber, 1);
    assert.equal("groupsByWeek" in read(seatPath("freya")), false);
    world.mail.length = 0;
    assert.equal((await w.join.place("claudia", [{ uid: "freya", groupId: D }])).body.placed, 1);
    assert.equal((await publish()).status, 200);
    assert.deepEqual(sent(), [
      ["freya@example.com", "You’ve moved to Group D: Mondays at 6pm", "course-application"],
      ["grace@example.com", "Freya has joined Group D", "course-application"],
      ["tom@example.com", "Freya is no longer in Group C", "course-application"],
    ]);
  });

  test("a staff move back a week later sends its own three emails, keeps every week, and Publish then sends nothing", async () => {
    await publish();
    assert.equal((await press("claudia", "freya", C)).saved.status, 200);
    // A week on: Group C met week 4 on Wed 25 Nov, Group D on Mon 23 Nov.
    at("2026-11-26T12:00:00Z");
    world.mail.length = 0;
    const back = await press("claudia", "freya", D);
    assert.equal(back.saved.status, 200, JSON.stringify(back.saved.body));
    assert.deepEqual(read(seatPath("freya")).groupsByWeek, [
      { groupId: D, fromWeek: 1 },
      { groupId: C, fromWeek: 4 },
      { groupId: D, fromWeek: 5 },
    ]);
    assert.deepEqual(sent(), [
      ["freya@example.com", "You’re moving to Group D", "course-move"],
      ["grace@example.com", "Freya Thompson joins Group D from week 5", "course-move"],
      ["tom@example.com", "Freya Thompson leaves Group C from week 5", "course-move"],
    ]);
    world.mail.length = 0;
    assert.equal((await publish()).status, 200);
    assert.deepEqual(sent(), []);
  });

  test("the board refuses a place with a record, and Remove still takes it out", async () => {
    await publish();
    assert.equal((await press("claudia", "freya", C)).saved.status, 200);
    const refused = await w.join.place("claudia", [{ uid: "freya", groupId: D }]);
    assert.deepEqual(refused.body.rejected, [{ uid: "freya", reason: "moved-mid-term" }]);
    assert.equal(read(seatPath("freya")).groupId, C);
    const out = await w.join.place("claudia", [{ uid: "freya", groupId: null }]);
    assert.equal(out.body.placed, 1);
    assert.equal(read(seatPath("freya")).groupId, null);
  });

  test("the person's own page: the next session is the new group's week 4, never its week 3 tonight; each week from the group they were in", async () => {
    // Tue 17 Nov, noon: Amara (Group A, Thursdays, met week 3 on Thu 12) to Group B (Tuesdays, week 3 tonight).
    const { saved } = await press("claudia", "amara", B);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.weekNumber, 4);
    const page = await call("amara", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(page.status, 200);
    const card = page.body.groups.find((group) => group.id === B);
    assert.deepEqual([card.calendar.nextSession.weekNumber, card.calendar.nextSession.dateKey], [4, "2026-11-24"]);
    assert.deepEqual(
      page.body.weekSchedule.map((week) => [week.weekNumber, week.dateKey]),
      [[1, "2026-10-29"], [2, "2026-11-05"], [3, "2026-11-12"], [4, "2026-11-24"], [5, "2026-12-01"], [6, "2026-12-08"]],
    );
  });
});
