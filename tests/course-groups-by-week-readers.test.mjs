/**
 * Every reader of a WEEK's group asks which group a person was in that week
 * (`groupForWeek`), and attendance reads as one record across the groups a
 * person was in.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * A place can carry a record of which group it was in from which week
 * (`groupsByWeek`, written only by `moveFromWeek`). Three kinds of reader
 * need a week's group, and ask `groupForWeek`, directly or through the
 * helpers made of it (`src/lib/courses/groupsByWeek.ts`):
 *
 *  - THE SESSION THEY WERE DUE AT (`sessionSourceFor`): Late, and the
 *    reminders before a session;
 *  - THEIR MARK FOR A WEEK: their own attendance, their row of the Attendance
 *    tab, the rollup on their place, who finished and what a certificate
 *    needs;
 *  - WHICH REGISTER A WEEK'S LINE IS ON: who is a row of a group's register
 *    for a session;
 *  - ANYTHING ELSE ABOUT ONE SESSION OR ONE WEEK, past or still to come:
 *    their calendar, their own excused weeks, deciding a request to be
 *    excused, "Can't make it", "Joining online" and who it tells, when a
 *    pick closes, when a sealed prediction opens, a new regular time's
 *    take-backs, This week's due dates and the group's "Week N is open"
 *    email. `tests/course-groups-by-week-sessions.test.mjs` runs those.
 *
 * Readers that mean the group they are in NOW (their facilitators, the
 * roster, who reads their work) read the place's group and nothing else.
 *
 * With no record anywhere, which is every place today, every reader reads
 * exactly as it did: the group they are in now, for every week. Each reader
 * is run here for a mover with a record and for one without, and the one
 * live case (somebody moved with no record, marked in two groups' registers
 * for one week) reads the group they are in now, only, before and after.
 *
 * Built on `tests/lib/registerWorld.mjs`: the run starts on Thursday 15
 * October 2026; Group B meets on Tuesdays at 6pm (Amara, Chloe, Farah),
 * Group A on Mondays at 6pm (Ana). Here Chloe is moved to Group A, from week
 * 3 with a record, or with none.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { GROUP, RUN, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const made = makeWorld("__groupsByWeekReaders");
const { world, reset, lib, call, courseRoute } = made;

const { normalizeCourseEnrolment } = await lib("firestore", "courseEnrolments.ts");
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const { sessionSourceFor, loadRunWeekStates } = await lib("courses", "weekWork", "readers.ts");
const { weekDueOf } = await lib("courses", "weekWork", "sessionDue.ts");
const { lateBy } = await lib("courses", "weekWork", "model.ts");
const { readRunRecords, buildRunAttendance, listGroups, weeksOf } = await lib("courses", "programmeAttendance.ts");
const { suggestedBy } = await lib("courses", "finishing", "record.ts");
const { certificateNeedsFor } = await lib("courses", "finishing", "needs.ts");
const { loadRegisterMembers, loadToldRegisterMembers } = await lib("courses", "registerAccess.ts");
const overview = await courseRoute("runs", "[runId]", "overview");
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");

/**
 * Wednesday 4 November 2026, noon: week 3 has met in both groups (Group A on
 * Monday 2 November, Group B on Tuesday 3 November), and week 4 has not.
 */
const NOW = new Date("2026-11-04T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const read = (path) => world.db.read(path);
const CHLOE = `courseEnrolments/${RUN}__chloe`;
const RECORD = [{ groupId: GROUP.b, fromWeek: 1 }, { groupId: GROUP.a, fromWeek: 3 }];

/** Chloe in Group A now; with `record`, from week 3, her weeks 1 and 2 Group B's. */
function moveChloe(record) {
  world.db.poke(CHLOE, { groupId: GROUP.a, ...(record ? { groupsByWeek: RECORD } : {}) });
}

const runOf = () => normalizeCourseRun(RUN, read(`courseRuns/${RUN}`));
const groupsOf = () => [GROUP.a, GROUP.b].map((id) => normalizeCourseGroup(id, read(`courseGroups/${id}`)));
const seatOf = (uid) => normalizeCourseEnrolment(`${RUN}__${uid}`, read(`courseEnrolments/${RUN}__${uid}`));

/** London wall clock of an instant, "Mon 26 Oct 18:00". */
const london = (date) =>
  date
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(date)
        .replace(",", "")
    : null;

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(seedWorld());
});

/** A finished register: marks by uid, finished the evening it met. */
function finished(groupId, weekNumber, records) {
  world.db.seed(registerPath(groupId, weekNumber), {
    runId: RUN,
    groupId,
    weekNumber,
    occurrence: 1,
    records,
    held: true,
    pushedAt: new Date("2026-10-19T20:00:00Z"),
    pushedByUid: "zach",
  });
}

/**
 * Three weeks of registers. Chloe was in Group B for weeks 1 and 2 (excused,
 * then present) and in Group A from week 3 (late). With a record, that is
 * her record; with none, she reads Group A's registers for every week.
 */
function threeWeeks() {
  finished(GROUP.b, 1, { amara: "present", chloe: "excused", farah: "present" });
  finished(GROUP.b, 2, { amara: "present", chloe: "present", farah: "late" });
  finished(GROUP.b, 3, { amara: "present", farah: "present" });
  finished(GROUP.a, 1, { ana: "present" });
  finished(GROUP.a, 2, { ana: "present" });
  finished(GROUP.a, 3, { ana: "present", chloe: "late" });
}

/** One person's row of the Attendance tab, and the group it is drawn under. */
async function tabRow(uid) {
  const model = buildRunAttendance(await readRunRecords(world.db, RUN), { isAdmin: true }, NOW);
  for (const group of model.groups) {
    const row = group.people.find((person) => person.uid === uid);
    if (row) return { group: group.id, row, model };
  }
  return { group: null, row: null, model };
}

const marksOf = (row) => row.cells.slice(0, 4).map((cell) => (cell.state === "mark" ? cell.mark : cell.state));
const totalOf = (model, groupId, weekNumber) => {
  const total = model.groups.find((group) => group.id === groupId).totals.find((each) => each.weekNumber === weekNumber);
  return `${total.came} of ${total.of}`;
};
const ownSessions = async (uid) => {
  const answer = await call(uid, overview.GET, { runId: RUN });
  assert.equal(answer.status, 200, JSON.stringify(answer.body).slice(0, 300));
  return answer.body.ownAttendance.sessions.map((session) => `${session.sessionKey} ${session.status ?? "not marked"}`);
};

// ===========================================================================
// The tree
// ===========================================================================

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

/**
 * A file READS A PLACE'S GROUP when it handles places (it names their type,
 * normalises them or addresses the collection) and reads a `groupId` off
 * something, or narrows a query by it; or it reads `.groupId` straight off a
 * variable named for a place.
 */
const HANDLES_PLACES = /\b(?:CourseEnrolmentDoc|normalizeCourseEnrolment)\b|\.collection\(\s*["']courseEnrolments["']\s*\)/;
const READS_GROUP_ID = /\.groupId\b|where\(\s*["']groupId["']/;
const READS_PLACE_GROUP = /\b(?:enrolment|seat|place|placement|learner|liveEnrolment)\??\.groupId\b/;
/**
 * A file READS A GROUP'S PEOPLE, and so the group each place names, when it
 * asks the notice audience for a group (`resolveNoticeAudience` reads each
 * place's group inside it) or reads the group an audience member's place
 * names (`member.groupId`).
 */
const READS_GROUP_PEOPLE = /\bresolveNoticeAudience\([^;]*\bgroupId\b|\bmember\.groupId\b/;
/**
 * A file READS A WEEK'S MARK, A WEEK'S DUE SESSION OR A REGISTER'S ROWS when
 * it addresses a register, resolves a group's sessions or is handed them,
 * asks when a week is due, or loads a register's rows, the rollup's people
 * or the Attendance tab's rows.
 */
const WEEK_READER =
  /\.collection\(\s*["']courseAttendance["']\s*\)|\battendanceDocId\(|\bresolveSessions\(|\bResolvedSession\b|\bweekDueOf\(|\bdueMoment\(|\bsessionSourceFor\(|\bloadRegisterMembers\(|\bloadToldRegisterMembers\(|\bloadMirrorMembers\(|\blistGroups\(|\bbuildRunAttendance\(/;
/** The one question, the helpers made of it, and the notice audience asked for a week. */
const ASKS_WEEK =
  /\b(?:groupForWeek|hasGroupsByWeek|sessionsByWeekGroup|sessionsWithGroup|groupsOfWeeks|everInGroup|isRowForWeek|stretchesIn|groupStretchesOf|inGroupForWeek)\b|\bresolveNoticeAudience\([^;]*\bweekNumber\b/;

/**
 * Every file that reads a place's group and a week's mark, due session or
 * register rows, and what it means by the group:
 *
 *  - `week`: the group they were in THAT week. It asks `groupForWeek`, or a
 *    helper made of it, and is run for a mover above.
 *  - `now`: the group they are in now, rightly: their facilitators, the
 *    roster, who reads their work, who is told what, which copy of a week
 *    they work in, or a record kept whole.
 *
 * There is no third kind. A reader about one session still to come asks
 * that session's week too: "the group they are in now" is wrong for it in
 * the week of a move between groups that meet on different days, and for
 * every week in between when a move is dated further ahead.
 */
const READERS = {
  "app/api/courses/runs/[runId]/overview/route.ts": {
    kind: "week",
    why: "their own attendance off each week's group's registers, the session they were due at (through sessionSourceFor) and what a certificate needs; the copy of a week, the schedule shown and who gives feedback stay the group they are in now",
  },
  "lib/courses/attendanceMirror.ts": {
    kind: "week",
    why: "the rollup on a place, rebuilt from each week's register of the group they were in that week",
  },
  "lib/courses/finishing/record.ts": {
    kind: "week",
    why: "a member's own finished record reads the registers of every group their weeks were in, and their row of the grid",
  },
  "lib/courses/programmeAttendance.ts": {
    kind: "week",
    why: "the Attendance tab: one row a person under their group now, each week's cell off the register of the group they were in that week",
  },
  "lib/courses/registerAccess.ts": {
    kind: "week",
    why: "who is a row of a group's register in a week, and whose figures a register's change rebuilds",
  },
  "lib/courses/weekWork/readers.ts": {
    kind: "week",
    why: "the session somebody was due at each week (sessionSourceFor), so Late and the reminders before a session",
  },
  "app/api/courses/groups/[groupId]/pace/route.ts": {
    kind: "now",
    why: "a group's own pacing re-dates that group's sessions and resets the task mark of the people in it now; it reads nobody's mark",
  },
  "lib/applications/freedPlaces/groups.ts": {
    kind: "now",
    why: "who holds a seat in a group now, for places given back: a count of the group as it is, never a week of anybody's",
  },
  "lib/courses/allocationPublish.ts": {
    kind: "now",
    why: "Publish tells people the group they are in now, and its facilitators who is in it now",
  },
  "lib/courses/excused/page.ts": {
    kind: "now",
    why: "reads the group a request to be excused names, the register it was made on, and never a place's group",
  },
  "lib/courses/finishing/whoFinished.ts": {
    kind: "now",
    why: "who finished counts written answers against the weeks of the group somebody is in now, whose copies their facilitators read; their attendance is their row of the grid, which reads each week's group",
  },
  "lib/courses/groupChange/facts.ts": {
    kind: "now",
    why: "a change to a group's session tells the people in the group now, who are the people its sessions still to come are for",
  },
  "lib/courses/groupPage/load.ts": {
    kind: "now",
    why: "a group's page lists the people in it now, whose work its facilitators read: who reads whose work is the group they are in now",
  },
  "lib/courses/pitching/load.ts": {
    kind: "now",
    why: "pitching week is worked in the group somebody is in now, with its people, and reads no mark",
  },
  "lib/courses/timeAnswer/seat.ts": {
    kind: "now",
    why: "the answer to \"can you make this time?\" is about the group they are in now, and is shown only while it is",
  },
  "lib/courses/timeAnswer/someWeeks.ts": {
    kind: "now",
    why: "reading a \"no\" as \"most weeks, not all\" is about the group they are in now, as the answer it changes is",
  },
  "lib/courses/weekWork/own.ts": {
    kind: "now",
    why: "the copy of a week somebody works in is their group's now; the session they were due at comes from sessionSourceFor, which asks each week's group",
  },
  "lib/courses/writtenAnswers/reviewPage.ts": {
    kind: "now",
    why: "who reads somebody's written answers is their group's facilitators now, and that does not change with a record of weeks",
  },
  "lib/firestore/accountDeletion.ts": {
    kind: "now",
    why: "deleting an account gives back the seat counted in the group they are in now, and clears their marks on every register of the run by run, whichever group",
  },
  "lib/firestore/courseDeletion.ts": {
    kind: "now",
    why: "destroying a run deletes every place, register and export of it, whichever group, and reads no week of anybody's",
  },
  "lib/surveys/personFacts.ts": {
    kind: "now",
    why: "the facts about a person a survey's reader is shown name the group they are in now",
  },
  "app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts": {
    kind: "week",
    why: "a pick stays open until the session they were due at that week starts, from that week's group; the copy of the week it is read on stays the group they are in now",
  },
  "lib/courses/calendarFeed.ts": {
    kind: "week",
    why: "the calendar somebody subscribes to holds each week's session from the group they were in that week, past and future; the dialog's line counts the group they are in now",
  },
  "lib/courses/cantMakeIt/seat.ts": {
    kind: "week",
    why: "Can't make it goes on the register of the group a session's week was spent in, and the ticket's next session is the one they are due at",
  },
  "lib/courses/excused/decide.ts": {
    kind: "week",
    why: "a request to be excused about a week belongs to the group they were in that week, so one asked before a move about a week that stays with the old group is still decided, on that group's register",
  },
  "lib/courses/excused/own.ts": {
    kind: "week",
    why: "somebody's own excused weeks list each session, and its outcome, off the register of the group they were in that week; nothing is offered to ask of the group now about another group's week",
  },
  "lib/courses/joiningOnline/seat.ts": {
    kind: "week",
    why: "Joining online is said on the register of the group a session's week was spent in, whose facilitators are the ones told",
  },
  "lib/courses/predictions/taker.ts": {
    kind: "week",
    why: "a sealed prediction's card opens after the session they were due at in the week before it, from that week's group",
  },
  "lib/courses/regularTime/apply.ts": {
    kind: "week",
    why: "a new regular time takes back the Most weeks, not all ticks of the people in the group now only for the weeks they are in that group",
  },
  "lib/courses/nextWeekEmail.ts": {
    kind: "week",
    why: "the group's Week N is open email about one session reaches the people in the group for that session's week, through the notice audience asked for the week",
  },
  "lib/courses/pushEmail.ts": {
    kind: "week",
    why: "what a register's button says it emails counts the people in the group for the week of the session the email is about, as the email's own audience does",
  },
  "lib/scheduler/jobs/weekReminders.ts": {
    kind: "week",
    why: "the reminders before a session reach the people whose group for the session's week is its group, through the notice audience asked for the week",
  },
  "lib/courses/groupsByWeek.ts": {
    kind: "week",
    why: "the helpers made of the one question: stretches, a register's rows for a week, and the sessions somebody was due at across their groups",
  },
  "lib/courses/groupWeekWork/load.ts": {
    kind: "now",
    why: "Remind reaches the people in the group now, as the group page's rows are: it asks for work the group's facilitators read, and who reads whose work is the group they are in now; when each is due is their own week's session",
  },
  "lib/courses/programmeOverview.ts": {
    kind: "now",
    why: "a leaver no register marked is named under the group their place names, the one they were in when they left; every other row is the Attendance tab's, which reads each week's group",
  },
};

describe("the tree: every reader of a week's group says which group it means", () => {
  const files = [...walkSource(SRC)].map((file) => [inSrc(file), stripSource(readFileSync(file, "utf8"), { keepStrings: true })]);

  test("every file that reads a place's group beside a week's mark, due session or register rows is listed, and every entry is such a file", () => {
    const found = files
      .filter(
        ([, code]) =>
          WEEK_READER.test(code) &&
          ((HANDLES_PLACES.test(code) && READS_GROUP_ID.test(code)) || READS_PLACE_GROUP.test(code) || READS_GROUP_PEOPLE.test(code)),
      )
      .map(([file]) => file)
      .sort();
    assert.deepEqual(found, Object.keys(READERS).sort(), "A reader of a week reads a place's group and is not listed: say which group it means.");
  });

  test("a `week` reader asks the one function; every reason is written down", () => {
    for (const [file, code] of files) {
      const entry = READERS[file];
      if (!entry) continue;
      assert.ok(["week", "now"].includes(entry.kind), `${file}: unknown kind`);
      assert.ok(entry.why.length >= 40, `${file} needs its reason written down`);
      if (entry.kind === "week") assert.match(code, ASKS_WEEK, `${file} is listed as reading a week's group and asks nothing`);
    }
  });

  test("the one function is defined once, and only the writer writes the record", () => {
    const defining = files.filter(([, code]) => /export function groupForWeek\(/.test(code)).map(([file]) => file);
    assert.deepEqual(defining, ["lib/firestore/courseEnrolments.ts"]);
  });

  test("nothing calls the writer yet: no route, no page, no job", () => {
    const calling = files
      .filter(([file, code]) => file !== "lib/courses/moveFromWeek.ts" && /\bmoveFromWeek\(/.test(code))
      .map(([file]) => file);
    assert.deepEqual(calling, []);
  });
});

// ===========================================================================
// The session they were due at, and Late
// ===========================================================================

describe("the session they were due at, and Late", () => {
  const dueWeeks = (uid) => {
    const source = sessionSourceFor(runOf(), groupsOf(), uid, seatOf(uid));
    return [1, 2, 3, 4].map((week) => london(weekDueOf(source, week).at));
  };

  test("with a record: weeks 1 and 2 at Group B's Tuesday sessions, weeks 3 and 4 at Group A's Mondays", () => {
    moveChloe(true);
    assert.deepEqual(dueWeeks("chloe"), ["Tue 20 Oct 18:00", "Tue 27 Oct 18:00", "Mon 2 Nov 18:00", "Mon 9 Nov 18:00"]);
  });

  test("with no record: every week at the group she is in now, as before", () => {
    moveChloe(false);
    assert.deepEqual(dueWeeks("chloe"), ["Mon 19 Oct 18:00", "Mon 26 Oct 18:00", "Mon 2 Nov 18:00", "Mon 9 Nov 18:00"]);
    assert.deepEqual(dueWeeks("amara"), ["Tue 20 Oct 18:00", "Tue 27 Oct 18:00", "Tue 3 Nov 18:00", "Tue 10 Nov 18:00"]);
  });

  test("Late is told against that session: week 2 sent on Monday evening is on time for Group B's Tuesday", async () => {
    const sent = new Date("2026-10-26T20:00:00Z");
    moveChloe(true);
    const withRecord = await loadRunWeekStates(world.db, { run: runOf(), liveGroups: groupsOf(), now: new Date("2026-11-01T12:00:00Z") });
    assert.equal(lateBy(sent, withRecord.dueOf("chloe", 2)), null);
    reset(seedWorld());
    moveChloe(false);
    const without = await loadRunWeekStates(world.db, { run: runOf(), liveGroups: groupsOf(), now: new Date("2026-11-01T12:00:00Z") });
    assert.equal(lateBy(sent, without.dueOf("chloe", 2)), 2 * 3_600_000, "two hours after Group A's Monday session");
  });

  test("a week spent in a group that no longer meets has no session to be due at", () => {
    moveChloe(true);
    const liveOnlyA = groupsOf().filter((group) => group.id === GROUP.a);
    const source = sessionSourceFor(runOf(), liveOnlyA, "chloe", seatOf("chloe"));
    assert.deepEqual(
      [1, 2, 3].map((week) => weekDueOf(source, week)),
      [{ at: null, by: "undated" }, { at: null, by: "undated" }, weekDueOf(source, 3)],
    );
    assert.equal(london(weekDueOf(source, 3).at), "Mon 2 Nov 18:00");
  });
});

// ===========================================================================
// Their mark for a week
// ===========================================================================

describe("their mark for a week: one record across the groups they were in", () => {
  test("their own attendance: weeks 1 and 2 off Group B's registers, week 3 off Group A's", async () => {
    threeWeeks();
    moveChloe(true);
    assert.deepEqual(await ownSessions("chloe"), ["w01 excused", "w02 present", "w03 late"]);
  });

  test("their own attendance with no record: Group A's registers for every week, as before", async () => {
    threeWeeks();
    moveChloe(false);
    assert.deepEqual(await ownSessions("chloe"), ["w01 not marked", "w02 not marked", "w03 late"]);
    assert.deepEqual(await ownSessions("amara"), ["w01 present", "w02 present", "w03 present"]);
  });

  test("the Attendance tab: one row under Group A, each week from the right register, and each group's figure from its own register", async () => {
    threeWeeks();
    moveChloe(true);
    const { group, row, model } = await tabRow("chloe");
    assert.equal(group, GROUP.a, "one row, under the group she is in now");
    assert.equal(model.groups.find((each) => each.id === GROUP.b).people.some((person) => person.uid === "chloe"), false);
    assert.deepEqual(marksOf(row), ["excused", "present", "late", "not-yet"]);
    assert.equal(row.came, 2);
    assert.equal(row.of, 3);
    assert.equal(row.groupHeld, 3);
    // Group B's register in weeks 1 and 2 holds her mark, Group A's does not.
    assert.equal(totalOf(model, GROUP.b, 1), "2 of 3");
    assert.equal(totalOf(model, GROUP.b, 2), "3 of 3");
    assert.equal(totalOf(model, GROUP.b, 3), "2 of 2");
    assert.equal(totalOf(model, GROUP.a, 1), "1 of 1");
    assert.equal(totalOf(model, GROUP.a, 3), "2 of 2");
    const week1 = model.totals.find((each) => each.weekNumber === 1);
    assert.equal(`${week1.came} of ${week1.of}`, "3 of 4", "every mark counted once, across the groups");
  });

  test("the Attendance tab with no record: her row reads Group A's registers for every week, as before", async () => {
    threeWeeks();
    moveChloe(false);
    const { group, row, model } = await tabRow("chloe");
    assert.equal(group, GROUP.a);
    assert.deepEqual(marksOf(row), ["not-yet", "not-yet", "late", "not-yet"]);
    assert.equal(row.came, 1);
    assert.equal(row.of, 1);
    assert.equal(totalOf(model, GROUP.b, 1), "2 of 2");
    assert.equal(totalOf(model, GROUP.a, 3), "2 of 2");
  });

  test("a group's session finished before she was in it is never an absence of hers", async () => {
    threeWeeks();
    moveChloe(true);
    const { row } = await tabRow("chloe");
    assert.equal(row.cells.filter((cell) => cell.mark === "absent").length, 0);
    assert.equal(row.absentInARow, 0);
  });

  test("who finished counts the same row: came and the sessions held while she was in each group", async () => {
    threeWeeks();
    moveChloe(true);
    const records = await readRunRecords(world.db, RUN);
    const listed = listGroups(records, { isAdmin: true }, NOW, weeksOf(records));
    const row = listed.flatMap((entry) => entry.people).find((person) => person.enrolment.uid === "chloe").row;
    assert.equal(suggestedBy({ atLeast: 2 }, row), true);
    assert.equal(suggestedBy({ atLeast: 3 }, row), false);
    reset(seedWorld());
    threeWeeks();
    moveChloe(false);
    const without = listGroups(await readRunRecords(world.db, RUN), { isAdmin: true }, NOW, weeksOf(await readRunRecords(world.db, RUN)))
      .flatMap((entry) => entry.people)
      .find((person) => person.enrolment.uid === "chloe").row;
    assert.equal(without.came, 1, "with no record, Group A's registers alone, as before");
    assert.equal(suggestedBy({ atLeast: 2 }, without), false);
  });

  test("what a certificate needs counts each week's group's sessions, and says no \"of your group's\" for a mover", () => {
    moveChloe(true);
    const needs = (atLeast, registers) =>
      certificateNeedsFor({
        rule: { atLeast },
        run: runOf(),
        group: groupsOf().find((group) => group.id === GROUP.a),
        enrolment: seatOf("chloe"),
        facilitates: false,
        incubator: false,
        liveGroups: groupsOf(),
        registers,
      });
    assert.equal(needs(4), "To get your certificate you need to come to at least 4 sessions. A session you’re excused from doesn’t count as coming.");
    assert.match(needs(9), /at least 6 sessions/, "six weeks, two groups' sessions");
    // Week 2 was Group B's, and its register says it did not happen (the old switch).
    const notHeldWeek2 = new Map([["w02", { runId: RUN, groupId: GROUP.b, weekNumber: 2, held: false, records: {} }]]);
    assert.match(needs(9, notHeldWeek2), /at least 5 sessions/);
    reset(seedWorld());
    moveChloe(false);
    assert.equal(needs(4), "To get your certificate you need to come to at least 4 of your group’s 6 sessions. A session you’re excused from doesn’t count as coming.");
  });
});

// ===========================================================================
// The live case
// ===========================================================================

describe("the live case: moved with no record, marked in two groups' registers for one week", () => {
  /**
   * Somebody moved before the record existed: excused on their first group's
   * finished week 1, and present, corrected to late, on the group they are in
   * now. Their record reads the group they are in now, only: never the old
   * group's "excused" over the new group's mark.
   */
  function liveCase() {
    finished(GROUP.b, 1, { amara: "present", chloe: "excused", farah: "present" });
    finished(GROUP.a, 1, { ana: "present", chloe: "late" });
    moveChloe(false);
  }

  test("their own attendance reads the group they are in now: late", async () => {
    liveCase();
    assert.deepEqual(await ownSessions("chloe"), ["w01 late"]);
  });

  test("their Attendance tab row reads late, under the group they are in now, and Group B's figure leaves them out", async () => {
    liveCase();
    const { group, row, model } = await tabRow("chloe");
    assert.equal(group, GROUP.a);
    assert.equal(row.cells[0].mark, "late");
    assert.equal(row.came, 1);
    assert.equal(totalOf(model, GROUP.b, 1), "2 of 2");
    assert.equal(totalOf(model, GROUP.a, 1), "2 of 2");
  });
});

// ===========================================================================
// The rollup on their place
// ===========================================================================

describe("the rollup: rebuilt from each week's group's registers, and agreeing with the tab", () => {
  /** Weeks 1 and 2 finished in both groups; Group A's week 3 taken, not finished. */
  function beforeWeek3Push() {
    finished(GROUP.b, 1, { amara: "present", chloe: "excused", farah: "present" });
    finished(GROUP.b, 2, { amara: "present", chloe: "present", farah: "late" });
    finished(GROUP.a, 1, { ana: "present" });
    finished(GROUP.a, 2, { ana: "present" });
    world.db.seed(registerPath(GROUP.a, 3), { runId: RUN, groupId: GROUP.a, weekNumber: 3, occurrence: 1, records: { ana: "present", chloe: "late" }, held: true });
  }
  const rollupOf = (uid) => {
    const { sessionsHeld, attendedInFull, late, leftEarly, absent, excused } = read(`courseEnrolments/${RUN}__${uid}`).attendance;
    return { sessionsHeld, attendedInFull, late, leftEarly, absent, excused };
  };
  const pushed = async (who, groupId, weekNumber) => {
    const answer = await call(who, push.POST, { groupId }, { body: { weekNumber } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  };

  test("with a record: Group A's push counts her weeks 1 and 2 as Group B marked them, never as absences", async () => {
    beforeWeek3Push();
    moveChloe(true);
    await pushed("amelia", GROUP.a, 3);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 3, attendedInFull: 1, late: 1, leftEarly: 0, absent: 0, excused: 1 });
    assert.equal(read(`courseEnrolments/${RUN}__chloe`).attendance.lastPushedSessionKey, "w03");
    assert.deepEqual(rollupOf("ana"), { sessionsHeld: 3, attendedInFull: 3, late: 0, leftEarly: 0, absent: 0, excused: 0 });
  });

  test("with a record: the rollup and the Attendance tab agree", async () => {
    beforeWeek3Push();
    moveChloe(true);
    await pushed("amelia", GROUP.a, 3);
    const { row } = await tabRow("chloe");
    const rollup = rollupOf("chloe");
    assert.equal(row.came, rollup.attendedInFull + rollup.late + rollup.leftEarly);
    assert.equal(row.of, rollup.sessionsHeld);
    assert.equal(row.groupHeld, rollup.sessionsHeld);
  });

  test("with a record: a correction of her old group's register reaches her figures", async () => {
    beforeWeek3Push();
    moveChloe(true);
    await pushed("amelia", GROUP.a, 3);
    const corrected = await call("zach", register.PATCH, { groupId: GROUP.b }, {
      body: { weekNumber: 2, marks: [{ uid: "chloe", status: "left-early" }], reason: "She left at half past seven, as the session note says." },
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 3, attendedInFull: 0, late: 1, leftEarly: 1, absent: 0, excused: 1 });
  });

  test("with no record: Group A's push counts Group A's finished weeks 1 and 2 as absences, exactly as before", async () => {
    beforeWeek3Push();
    moveChloe(false);
    await pushed("amelia", GROUP.a, 3);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 3, attendedInFull: 0, late: 1, leftEarly: 0, absent: 2, excused: 0 });
  });

  test("the live case: the rollup reads the group they are in now, never the old group's excused", async () => {
    finished(GROUP.b, 1, { amara: "present", chloe: "excused", farah: "present" });
    world.db.seed(registerPath(GROUP.a, 1), { runId: RUN, groupId: GROUP.a, weekNumber: 1, occurrence: 1, records: { ana: "present", chloe: "late" }, held: true });
    moveChloe(false);
    await pushed("amelia", GROUP.a, 1);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 1, attendedInFull: 0, late: 1, leftEarly: 0, absent: 0, excused: 0 });
    // A later push of the old group does not touch them: they are none of its people.
    finished(GROUP.b, 2, { amara: "present", farah: "present" });
    world.db.seed(registerPath(GROUP.b, 3), { runId: RUN, groupId: GROUP.b, weekNumber: 3, occurrence: 1, records: { amara: "present", farah: "present" }, held: true });
    await pushed("rahul", GROUP.b, 3);
    assert.deepEqual(rollupOf("chloe"), { sessionsHeld: 1, attendedInFull: 0, late: 1, leftEarly: 0, absent: 0, excused: 0 });
  });
});

// ===========================================================================
// Which register a week's line is on
// ===========================================================================

describe("which register a week's line is on: a group's rows for a session, before and after the move", () => {
  const rowsOf = async (groupId, week = null) =>
    (await loadRegisterMembers(world.db, RUN, groupId, { isAdmin: false }, week)).members.map((row) => row.uid).sort();
  const mark = (who, groupId, weekNumber, uid, status = "present") =>
    call(who, register.POST, { groupId }, { body: { weekNumber, marks: [{ uid, status }] } });

  test("with a record: a row of Group B's register for weeks 1 and 2, of Group A's from week 3", async () => {
    moveChloe(true);
    assert.deepEqual(await rowsOf(GROUP.b, 2), ["amara", "chloe", "farah"]);
    assert.deepEqual(await rowsOf(GROUP.b, 3), ["amara", "farah"]);
    assert.deepEqual(await rowsOf(GROUP.a, 2), ["ana"]);
    assert.deepEqual(await rowsOf(GROUP.a, 3), ["ana", "chloe"]);
    assert.deepEqual((await loadToldRegisterMembers(world.db, RUN, GROUP.b, 3)).members.map((row) => row.uid).sort(), ["amara", "farah"]);
    // The whole register (every week) carries her weeks in it.
    const b = (await loadRegisterMembers(world.db, RUN, GROUP.b, { isAdmin: false })).members.find((row) => row.uid === "chloe");
    assert.deepEqual(b.inGroupWeeks, [{ fromWeek: 1, untilWeek: 3 }]);
    assert.equal(b.joinedWeekNumber, 1);
    const a = (await loadRegisterMembers(world.db, RUN, GROUP.a, { isAdmin: false })).members.find((row) => row.uid === "chloe");
    assert.deepEqual(a.inGroupWeeks, [{ fromWeek: 3, untilWeek: null }]);
    assert.equal(a.joinedWeekNumber, 3);
  });

  test("with a record: a mark lands only on the register of the group she was in that week", async () => {
    moveChloe(true);
    assert.equal((await mark("rahul", GROUP.b, 2, "chloe")).status, 200);
    const refused = await mark("rahul", GROUP.b, 3, "chloe");
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /wasn.t in this group in week 3/);
    const before = await mark("amelia", GROUP.a, 2, "chloe");
    assert.equal(before.status, 400);
    assert.match(before.body.error, /hadn.t joined the group in week 2/);
    assert.equal((await mark("amelia", GROUP.a, 3, "chloe")).status, 200);
  });

  test("with a record: the register's page reads her row from each group's register", async () => {
    moveChloe(true);
    const b = await call("rahul", register.GET, { groupId: GROUP.b });
    assert.equal(b.status, 200, JSON.stringify(b.body).slice(0, 300));
    const row = b.body.members.find((member) => member.uid === "chloe");
    assert.deepEqual(row.inGroupWeeks, [{ fromWeek: 1, untilWeek: 3 }]);
  });

  test("with no record: the rows are the people in the group now, every week, and carry nothing new", async () => {
    moveChloe(false);
    assert.deepEqual(await rowsOf(GROUP.b, 2), ["amara", "farah"]);
    assert.deepEqual(await rowsOf(GROUP.a, 2), ["ana", "chloe"]);
    assert.deepEqual(await rowsOf(GROUP.a), ["ana", "chloe"]);
    const b = await call("rahul", register.GET, { groupId: GROUP.b });
    const a = await call("amelia", register.GET, { groupId: GROUP.a });
    for (const answer of [a, b]) {
      assert.equal(answer.status, 200);
      for (const member of answer.body.members) assert.deepEqual(Object.keys(member).sort(), ["displayName", "joinedWeekNumber", "uid"]);
    }
    assert.equal((await mark("rahul", GROUP.b, 2, "chloe")).status, 400, "not on Group B's register at all");
    assert.equal((await mark("amelia", GROUP.a, 2, "chloe")).status, 200);
  });

  test("the live case: Group B's register shows no row and no mark of theirs; Group A's has their row", async () => {
    finished(GROUP.b, 1, { amara: "present", chloe: "excused", farah: "present" });
    finished(GROUP.a, 1, { ana: "present", chloe: "late" });
    moveChloe(false);
    const b = await call("rahul", register.GET, { groupId: GROUP.b });
    assert.equal(b.body.members.some((member) => member.uid === "chloe"), false);
    assert.equal(b.body.records.w01?.chloe, undefined);
    const a = await call("amelia", register.GET, { groupId: GROUP.a });
    assert.equal(a.body.records.w01.chloe, "late");
  });
});
