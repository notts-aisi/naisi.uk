/**
 * "Can you make this time most weeks?" and a group's campus (Zach, 29 Oct
 * 2026; three answers from 5 Nov 2026), as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/runs/[runId]/time-answer                                       the person's own answer
 *   GET, POST /api/courses/runs/[runId]/enrolments/[uid]/time-answer                  "They meant some weeks"
 *   POST /api/courses/groups/[groupId]/cant-make-it                                   the ticket, which keeps a list in step
 *   PUT  /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/campus   a group's campus
 *   /learn/[runId] and its run home                                                   the card, and the campus
 *   GET  /api/courses/runs/[runId]/allocation                                         who reads the answer
 *   POST /api/courses/runs/[runId]/allocate, Remove, the facilitators route            what a move does to it
 *   /applications/[roundId]                                                           the line that points to it
 *
 * ## What this guards
 *
 *  1. WHO ANSWERS: the person, about their own seat, once Publish has told
 *     them their group, and nobody else: not another member, not a
 *     facilitator of their group, not the programme's lead, not an admin,
 *     not somebody signed out, not a view-as session, not somebody placed and
 *     not told (and nothing in that refusal names a group), not somebody who
 *     left or was taken off, not a seat chosen on an open run, not somebody
 *     who facilitates the group they sit in. The body is read before any
 *     document. Every refusal writes nothing; nothing is ever emailed.
 *  2. IT KEEPS THEIR PLACE: an answer writes one field on their seat and
 *     nothing else, and is not the leave.
 *  3. THE CARD on their programme page: their group's day, time and campus,
 *     the two answers, their answer once given, locked in a view-as session
 *     and until the page's script has arrived, naming no group for an
 *     incubator. And the head names the campus, standing in for no room.
 *  4. WHAT A MOVE DOES TO IT: a seat Publish told keeps it through a move,
 *     as it keeps the stamp (the board's move, un-placing, an appointment
 *     that seats a facilitator who holds a place and sits in no group), and
 *     nothing shows it while the seat is in another group than the one it is
 *     about; moved back, it shows again. Putting somebody back after they
 *     left, and Remove, delete it. The tree: every write that clears
 *     Publish's stamp clears the answer in the same write, and the leave
 *     names neither.
 *  5. THE STALE-ANSWER RULE: an answer about another group than the seat's
 *     now, or on a seat no longer taking part, is never shown, to the person
 *     or to staff; a stored value that is not a whole answer reads as none.
 *  6. WHO READS IT: the person, the programme's lead and admins, through the
 *     board's rows; a run's track lead is sent null, and a facilitator or
 *     another member reads it nowhere. Every file that names the field is
 *     listed below with why, both ways.
 *  7. THE CAMPUS: its normaliser and body; its route as every kind of caller
 *     (the programme's lead and admins, as the group's time); unchanged
 *     after Publish as a room is; nobody emailed.
 *  8. THE APPLICATION PAGE says, under what giving the place back means,
 *     that a time that doesn't work is told on the programme's page instead.
 *  9. MOST WEEKS, NOT ALL: the third answer records each session ticked as
 *     excused on its register on the person's own word, through the
 *     ticket's own write, takes back one they untick, and lists them on the
 *     seat; yes and a different time touch no register; the ticket keeps
 *     the list in step; every reader takes it as somebody who can make the
 *     time.
 * 10. THEY MEANT SOME WEEKS: an admin or the programme's lead, and nobody
 *     else, reads a "No, I need a different time" as most weeks: the answer
 *     keeps the person's words, each session chosen is recorded as excused
 *     dated when they answered, nothing they said is taken back, one audit
 *     row names no words of theirs, and nobody is emailed.
 *
 * Real: the routes, the page, the run home, the application page, the
 * libraries under them. Faked: see `tests/lib/leavingWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import {
  A,
  AGI,
  B,
  C,
  NOW,
  OPEN_GROUP,
  OPEN_RUN,
  ROUND,
  RUN,
  enrolmentPath,
  makeLeavingWorld,
  rowPath,
  textOf,
} from "./lib/leavingWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { pressedBefore } from "./lib/saidBefore.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__hubTimeAnswer");
const { world, call, routes } = w;
const answerRoute = await w.courseRoute("runs", "[runId]", "time-answer");
const someWeeksRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "time-answer");
const ticketRoute = await w.courseRoute("groups", "[groupId]", "cant-make-it");
const campusRoute = await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "campus");
const facilitatorsRoute = await w.courseRoute("groups", "[groupId]", "facilitators");
const model = await w.loadTs(join("lib", "courses", "timeAnswer", "model.ts"));
const words = await w.loadTs(join("lib", "courses", "timeAnswer", "words.ts"));
const cantWords = await w.loadTs(join("lib", "courses", "cantMakeIt", "words.ts"));
const boardParts = await w.loadTs(join("features", "applications", "groups", "peopleInGroupsBoard.ts"));
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const campus = await w.loadTs(join("lib", "courses", "campus.ts"));
const campusWords = await w.loadTs(join("lib", "courses", "campusWords.ts"));
const groups = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { default: StatusPage } = await w.loadTs(join("features", "applications", "status", "StatusPage.tsx"));

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const posix = (path) => path.split(sep).join("/");
const read = (path) => world.db.read(path);
const seat = (uid, runId = RUN.agi) => read(enrolmentPath(uid, runId));

/** What Amara writes, and a sentence no page but hers and the staff's may show. */
const WHY = "Thursday evenings clash with my lab demonstrating shift.";
const WOULD = "Monday or Tuesday evenings, or Wednesday afternoons.";
const CANT = { groupId: A, kind: "cant", reason: WHY, alternatives: WOULD };
const YES = { groupId: A, kind: "yes" };
/** "Most weeks, not all", ticking these of Group A's sessions still to come (Thu 19 Nov, 26 Nov, 3 Dec). */
const MOST = (...sessionKeys) => ({ groupId: A, kind: "mostWeeks", sessionKeys });
/** Group A's register for one week, as stored. */
const registerOf = (week, groupId = A) => read(`courseAttendance/${RUN.agi}__${groupId}__w0${week}`);
/** Who a register records excused on their own word, by uid. */
const toldOn = (week, groupId = A) => Object.keys(registerOf(week, groupId)?.excusedInAdvance ?? {}).sort();
/** A stored instant, as a Date, whichever the store kept. */
const instant = (value) => (value instanceof Date ? value : typeof value?.toDate === "function" ? value.toDate() : new Date(value));
/** The paths an action changed, by comparing the store before and after. */
function changedSince(before) {
  const now = JSON.parse(w.everything());
  const was = new Map(JSON.parse(before));
  const changed = [];
  for (const [path, value] of now) if (JSON.stringify(was.get(path)) !== JSON.stringify(value)) changed.push(path);
  for (const path of was.keys()) if (!now.some(([each]) => each === path)) changed.push(path);
  return changed.sort();
}
/** The audit rows written, as stored. */
const auditRows = () => world.db.paths().filter((path) => path.startsWith("courseAudit/")).map((path) => read(path));

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  world.db.recursiveDelete = async (ref) => ref.delete();
});

/** The person's answer, from the card. */
const answer = (who, body, options = {}) =>
  call(who, answerRoute.POST, { runId: options.runId ?? RUN.agi }, { body, course: true, viewAs: options.viewAs });

/** "They meant some weeks": what it offers for `uid`, as `who`. */
const offerFor = (who, uid, options = {}) =>
  call(who, someWeeksRoute.GET, { runId: options.runId ?? RUN.agi, uid }, { course: true });
/** "They meant some weeks" saved for `uid`, as `who`. */
const someWeeks = (who, uid, body, options = {}) =>
  call(who, someWeeksRoute.POST, { runId: options.runId ?? RUN.agi, uid }, { body, course: true, viewAs: options.viewAs });
/**
 * The ticket's "Can't make it" as an old page pressed it (saying it on the
 * spot is a facilitator's only now, `tests/lib/saidBefore.mjs`), or, with
 * false, "I can make it after all", which stays everybody's.
 */
const ticket = (who, sessionKey, cantMakeIt = true, groupId = A) => {
  const press = () => call(who, ticketRoute.POST, { groupId }, { body: { sessionKey, cantMakeIt }, course: true });
  return cantMakeIt ? pressedBefore(world.db, groupId, who, press) : press();
};

/** A group's campus, from the Groups tab. */
const setCampus = (who, groupId, value, options = {}) =>
  call(who, campusRoute.PUT, { roundId: ROUND, programmeId: options.programmeId ?? AGI, groupId }, {
    body: options.body ?? { campus: value },
    viewAs: options.viewAs,
  });

/** The board's rows, by uid, as `who` is served them. */
async function boardRows(who) {
  const board = await w.join.board(who);
  return { status: board.status, rows: Object.fromEntries((board.body?.people ?? []).map((row) => [row.uid, row])) };
}

/** What a stored answer holds, with its moment folded. */
function stored(uid) {
  const value = seat(uid)?.timeAnswer;
  if (value === undefined) return undefined;
  return { ...value, at: value.at instanceof Date ? "a moment" : value.at };
}

const short = (response) => [response.status, response.body?.error ?? null];

// ---------------------------------------------------------------------------
// 1 and 2. Who answers, and what an answer writes
// ---------------------------------------------------------------------------

describe("1. the person answers about their own seat, and nobody else answers", () => {
  test("the person: I can make it, then I can't make this time, then I can after all, on their own seat only", async () => {
    const before = w.everything();
    const yes = await answer("amara", YES);
    assert.equal(yes.status, 200, JSON.stringify(yes.body));
    assert.deepEqual(yes.body, {
      ok: true,
      answer: { kind: "yes", reason: null, alternatives: null },
      message: words.savedWords("yes"),
    });
    assert.deepEqual(stored("amara"), { kind: "yes", reason: null, alternatives: null, forGroupId: A, at: "a moment" });

    const cant = await answer("amara", { ...CANT, reason: `  ${WHY}  ` });
    assert.equal(cant.status, 200, JSON.stringify(cant.body));
    assert.deepEqual(cant.body.answer, { kind: "cant", reason: WHY, alternatives: WOULD });
    assert.equal(cant.body.message, words.savedWords("cant"));
    assert.deepEqual(stored("amara"), { kind: "cant", reason: WHY, alternatives: WOULD, forGroupId: A, at: "a moment" });

    // Changed back: a yes carries no words, whatever is sent with it.
    const again = await answer("amara", { ...YES, reason: WHY, alternatives: WOULD });
    assert.equal(again.status, 200);
    assert.deepEqual(stored("amara"), { kind: "yes", reason: null, alternatives: null, forGroupId: A, at: "a moment" });

    // IT KEEPS THEIR PLACE: their seat's group, status, Publish's stamp and
    // the form's place are as they were, and nothing else in the store moved.
    const after = seat("amara");
    assert.deepEqual([after.groupId, after.status, after.droppedOutAt ?? null], [A, "active", null]);
    assert.ok(after.allocatedEmailAt instanceof Date);
    assert.equal(read(rowPath("amara")).status, "accepted");
    const changed = [];
    const now = JSON.parse(w.everything());
    const was = new Map(JSON.parse(before));
    for (const [path, value] of now) if (JSON.stringify(was.get(path)) !== JSON.stringify(value)) changed.push(path);
    assert.deepEqual(changed, [enrolmentPath("amara")]);
    assert.deepEqual(world.mail, [], "an answer emailed somebody");
  });

  test("another member answers only for their own seat: a uid in the body addresses nothing", async () => {
    const response = await answer("dev", { ...CANT, uid: "amara" });
    assert.equal(response.status, 200);
    assert.equal(seat("amara").timeAnswer, undefined);
    assert.equal(seat("dev").timeAnswer.forGroupId, A);
    // A group they are not in: they were moved since the page was opened.
    const before = w.everything();
    assert.deepEqual(short(await answer("chloe", CANT)), [409, words.ANSWER_REFUSAL.moved]);
    assert.equal(w.everything(), before);
  });

  for (const [who, why] of [
    ["sofia", "a facilitator of their group, with no seat"],
    ["claudia", "the programme's lead"],
    ["zach", "an admin"],
    ["yusuf", "the run's track lead"],
    ["nobody", "a member on nothing"],
    ["una", "placed and not told by Publish"],
    ["sam", "somebody who left"],
    ["omar", "somebody staff took off"],
  ]) {
    test(`${why} has nothing to answer, in words that name no group, and nothing is written`, async () => {
      const before = w.everything();
      const response = await answer(who, { ...CANT, groupId: who === "una" ? C : A });
      assert.deepEqual(short(response), [404, words.ANSWER_REFUSAL.notAsked]);
      assert.doesNotMatch(JSON.stringify(response.body), /Group|grp0/);
      assert.equal(w.everything(), before);
    });
  }

  test("somebody who facilitates the group they sit in is told whom to sort it out with", async () => {
    world.db.seed(`courseGroups/${A}`, { ...read(`courseGroups/${A}`), facilitatorUids: ["sofia", "dev"] });
    const before = w.everything();
    assert.deepEqual(short(await answer("dev", CANT)), [409, words.ANSWER_REFUSAL.facilitating]);
    assert.equal(w.everything(), before);
  });

  test("a seat somebody chose for themselves on an open run is not asked", async () => {
    const before = w.everything();
    const response = await answer("kai", { ...CANT, groupId: OPEN_GROUP }, { runId: OPEN_RUN });
    assert.deepEqual(short(response), [404, words.ANSWER_REFUSAL.notAsked]);
    assert.equal(w.everything(), before);
  });

  test("an archived group, and a run being destroyed, have nothing to answer", async () => {
    world.db.seed(`courseGroups/${A}`, { ...read(`courseGroups/${A}`), archived: true });
    assert.deepEqual(short(await answer("amara", CANT)), [404, words.ANSWER_REFUSAL.notAsked]);
    w.reset();
    world.db.seed(`courseRuns/${RUN.agi}`, { ...read(`courseRuns/${RUN.agi}`), destroying: true });
    assert.deepEqual(short(await answer("amara", CANT)), [404, words.ANSWER_REFUSAL.notAsked]);
    assert.equal(seat("amara").timeAnswer, undefined);
  });

  test("signed out, and a view-as session, are refused first", async () => {
    const before = w.everything();
    assert.equal((await answer(null, CANT)).status, 401);
    assert.equal((await answer("amara", CANT, { viewAs: true })).status, 403);
    // View-as is refused before the body is read.
    assert.equal((await answer("amara", null, { viewAs: true })).status, 403);
    assert.equal(w.everything(), before);
  });

  test("the body is read before any document: a whole answer or a sentence saying what is missing", async () => {
    const long = (n) => "x".repeat(n);
    const L = enrolments.ENROLMENT_LIMITS;
    const cases = [
      [null, words.ANSWER_REFUSAL.body],
      [[], words.ANSWER_REFUSAL.body],
      [{ groupId: A }, words.ANSWER_REFUSAL.kind],
      [{ groupId: A, kind: "maybe" }, words.ANSWER_REFUSAL.kind],
      [{ kind: "yes" }, words.ANSWER_REFUSAL.group],
      [{ groupId: "a/b", kind: "yes" }, words.ANSWER_REFUSAL.group],
      [{ groupId: A, kind: "cant", alternatives: WOULD }, words.ANSWER_REFUSAL.reasonMissing],
      [{ groupId: A, kind: "cant", reason: "   ", alternatives: WOULD }, words.ANSWER_REFUSAL.reasonMissing],
      [{ groupId: A, kind: "cant", reason: WHY }, words.ANSWER_REFUSAL.alternativesMissing],
      [{ groupId: A, kind: "cant", reason: long(L.timeAnswerReason + 1), alternatives: WOULD }, words.tooLongWords("reason", L.timeAnswerReason)],
      [{ groupId: A, kind: "cant", reason: WHY, alternatives: long(L.timeAnswerAlternatives + 1) }, words.tooLongWords("alternatives", L.timeAnswerAlternatives)],
      // Most weeks, not all: a list of the group's sessions, none allowed, and nothing else.
      [{ groupId: A, kind: "mostWeeks" }, words.ANSWER_REFUSAL.sessions],
      [{ groupId: A, kind: "mostWeeks", sessionKeys: "w04" }, words.ANSWER_REFUSAL.sessions],
      [{ groupId: A, kind: "mostWeeks", sessionKeys: ["w4"] }, words.ANSWER_REFUSAL.sessions],
      [{ groupId: A, kind: "mostWeeks", sessionKeys: ["w04", 5] }, words.ANSWER_REFUSAL.sessions],
      [{ groupId: A, kind: "mostWeeks", sessionKeys: ["w04-1"] }, words.ANSWER_REFUSAL.sessions],
      [{ groupId: A, kind: "mostWeeks", sessionKeys: ["../w04"] }, words.ANSWER_REFUSAL.sessions],
      [{ groupId: A, kind: "mostWeeks", sessionKeys: Array.from({ length: L.timeAnswerSessions + 1 }, (_, i) => `w${String(i + 1).padStart(3, "0")}`) }, words.ANSWER_REFUSAL.sessions],
      [{ kind: "mostWeeks", sessionKeys: [] }, words.ANSWER_REFUSAL.group],
    ];
    const before = w.everything();
    for (const [body, said] of cases) {
      // As somebody on nothing: a 400, not the 404 a read would give them.
      assert.deepEqual(short(await answer("nobody", body)), [400, said], JSON.stringify(body));
    }
    // At the limits exactly, it saves.
    const whole = { groupId: A, kind: "cant", reason: long(L.timeAnswerReason), alternatives: long(L.timeAnswerAlternatives) };
    assert.equal(w.everything(), before);
    assert.equal((await answer("amara", whole)).status, 200);
  });

  test("the body's list of sessions is read once each, in the group's order, and a most weeks carries no words", () => {
    assert.deepEqual(model.parseTimeAnswer({ groupId: A, kind: "mostWeeks", sessionKeys: ["w06", "w04", "w06", "w04-2"], reason: WHY }), {
      ok: true,
      value: { groupId: A, kind: "mostWeeks", sessionKeys: ["w04", "w04-2", "w06"] },
    });
    assert.deepEqual(model.parseTimeAnswer({ groupId: A, kind: "mostWeeks", sessionKeys: [] }), {
      ok: true,
      value: { groupId: A, kind: "mostWeeks", sessionKeys: [] },
    });
  });
});

// ---------------------------------------------------------------------------
// 9. Most weeks, not all
// ---------------------------------------------------------------------------

describe("9. most weeks, not all: each session ticked is recorded as excused on its register, on their word", () => {
  test("ticked, the registers record them excused with when they said so, the answer lists them, and nobody is emailed", async () => {
    const before = w.everything();
    const sent = await answer("amara", MOST("w05"));
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sent.body, {
      ok: true,
      answer: { kind: "mostWeeks", reason: null, alternatives: null, sessionKeys: ["w05"] },
      message: words.savedWords("mostWeeks"),
    });
    assert.deepEqual(stored("amara"), {
      kind: "mostWeeks",
      reason: null,
      alternatives: null,
      sessionKeys: ["w05"],
      forGroupId: A,
      at: "a moment",
    });
    // The ticket's own write: excused, when they said so, the register's parts, and nothing else of it.
    const doc = registerOf(5);
    assert.deepEqual(doc.records, { amara: "excused" });
    assert.deepEqual(toldOn(5), ["amara"]);
    assert.equal(instant(doc.excusedInAdvance.amara).toISOString(), NOW.toISOString());
    assert.deepEqual([doc.runId, doc.groupId, doc.weekNumber, doc.occurrence], [RUN.agi, A, 5, 1]);
    assert.equal(doc.pushedAt ?? null, null);
    // Their seat and the one register they ticked, and nothing else; their place as it was.
    assert.deepEqual(changedSince(before), [enrolmentPath("amara"), `courseAttendance/${RUN.agi}__${A}__w05`].sort());
    assert.deepEqual([seat("amara").groupId, seat("amara").status], [A, "active"]);
    assert.ok(seat("amara").allocatedEmailAt instanceof Date);
    assert.deepEqual(world.mail, [], "an answer emailed somebody");
  });

  test("sent again, the registers follow the ticks: one unticked is taken back, and none ticked takes back every one", async () => {
    // Ticked in the first answer; later answers only take ticks off.
    assert.equal((await answer("amara", MOST("w04", "w05", "w06"))).status, 200);
    const again = await answer("amara", MOST("w06", "w04"));
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual(again.body.answer.sessionKeys, ["w04", "w06"]);
    assert.deepEqual([toldOn(4), toldOn(5), toldOn(6)], [["amara"], [], ["amara"]]);
    assert.equal(registerOf(5).records.amara, undefined, "an unticked session still records them excused");
    assert.deepEqual(stored("amara").sessionKeys, ["w04", "w06"]);
    // Somebody else's line on the same register is theirs, and stays.
    assert.equal((await answer("dev", { ...MOST("w04") })).status, 200);
    const none = await answer("amara", MOST());
    assert.equal(none.status, 200);
    assert.deepEqual([toldOn(4), toldOn(6)], [["dev"], []]);
    assert.deepEqual(registerOf(4).records, { dev: "excused" });
    assert.deepEqual(stored("amara"), { kind: "mostWeeks", reason: null, alternatives: null, sessionKeys: [], forGroupId: A, at: "a moment" });
  });

  test("yes and a different time touch no register: what they told us stays theirs, on the ticket", async () => {
    assert.equal((await answer("amara", MOST("w05"))).status, 200);
    for (const body of [YES, CANT]) {
      const before = w.everything();
      assert.equal((await answer("amara", body)).status, 200);
      assert.deepEqual(changedSince(before), [enrolmentPath("amara")], JSON.stringify(body));
      assert.deepEqual(toldOn(5), ["amara"]);
    }
    assert.equal(stored("amara").sessionKeys, undefined, "a can't carries a list of sessions");
  });

  test("a session they can no longer tell us about refuses the whole answer, naming its day, and nothing is written", async () => {
    const before = w.everything();
    // Week 3 met on Thu 12 Nov: the session after it is not recorded either.
    const started = await answer("amara", MOST("w05", "w03"));
    assert.deepEqual(short(started), [409, words.sessionRefusalWords("Thu 12 Nov", cantWords.CANT_MAKE_IT_REFUSAL.started)]);
    assert.equal(started.body.error, "Thu 12 Nov: That session has already started, so tell your facilitators yourself.");
    // Not one of the group's sessions.
    assert.deepEqual(short(await answer("amara", MOST("w09"))), [400, cantWords.CANT_MAKE_IT_REFUSAL.noSession]);
    assert.equal(w.everything(), before, "a refused answer wrote something");
    // A line a facilitator has filled in is theirs.
    world.db.seed(`courseAttendance/${RUN.agi}__${A}__w05`, {
      runId: RUN.agi,
      groupId: A,
      weekNumber: 5,
      occurrence: 1,
      records: { amara: "present" },
      held: true,
      pushedAt: null,
    });
    const filled = w.everything();
    const marked = await answer("amara", MOST("w04", "w05"));
    assert.deepEqual(short(marked), [409, words.sessionRefusalWords("Thu 26 Nov", cantWords.CANT_MAKE_IT_REFUSAL.marked)]);
    assert.equal(w.everything(), filled, "a refused answer wrote something");
    assert.equal(stored("amara"), undefined);
  });

  test("the ticket keeps a most weeks answer's list in step, and leaves every other answer as it was", async () => {
    assert.equal((await answer("amara", MOST("w05"))).status, 200);
    // Can't make it on the next session's ticket: listed, in the group's order.
    assert.equal((await ticket("amara", "w04")).status, 200);
    assert.deepEqual(stored("amara").sessionKeys, ["w04", "w05"]);
    // I can make it after all on week 5: taken off the list, and off the register.
    assert.equal((await ticket("amara", "w05", false)).status, 200);
    assert.deepEqual(stored("amara").sessionKeys, ["w04"]);
    assert.deepEqual(toldOn(5), []);
    // Said again: nothing moves.
    const before = w.everything();
    assert.equal((await ticket("amara", "w04")).status, 200);
    assert.equal(w.everything(), before);
    // A yes is about the time: the ticket records the session and leaves the answer alone.
    assert.equal((await answer("dev", YES)).status, 200);
    const yes = stored("dev");
    assert.equal((await ticket("dev", "w06")).status, 200);
    assert.deepEqual(stored("dev"), yes);
    assert.deepEqual(toldOn(6), ["dev"]);
  });

  test("the card lists the group's sessions still to come, ticked where they told us, by the ticket or by the card", async () => {
    await w.draw(w.pages.home, "amara", { runId: RUN.agi });
    assert.deepEqual(w.ui.runHome.timeQuestion.sessions, [
      { sessionKey: "w04", weekNumber: 4, day: "Thu 19 Nov", told: false },
      { sessionKey: "w05", weekNumber: 5, day: "Thu 26 Nov", told: false },
      { sessionKey: "w06", weekNumber: 6, day: "Thu 3 Dec", told: false },
    ]);
    assert.equal((await ticket("amara", "w04")).status, 200);
    assert.equal((await answer("amara", MOST("w04", "w06"))).status, 200);
    await w.draw(w.pages.home, "amara", { runId: RUN.agi });
    assert.deepEqual(
      w.ui.runHome.timeQuestion.sessions.map((each) => [each.sessionKey, each.told]),
      [["w04", true], ["w05", false], ["w06", true]],
    );
    assert.deepEqual(w.ui.runHome.timeQuestion.answer, { kind: "mostWeeks", reason: null, alternatives: null, sessionKeys: ["w04", "w06"] });
    // Once a session has started it is no longer offered.
    mock.timers.setTime(new Date("2026-11-19T18:30:00Z").getTime());
    await w.draw(w.pages.home, "amara", { runId: RUN.agi });
    assert.deepEqual(w.ui.runHome.timeQuestion.sessions.map((each) => each.sessionKey), ["w05", "w06"]);
  });

  test("the register says it to the group's facilitators, and never what they answered", async () => {
    assert.equal((await answer("amara", MOST("w05"))).status, 200);
    const register = await call("sofia", routes.register.GET, { groupId: A }, { course: true });
    assert.equal(register.status, 200, JSON.stringify(register.body));
    assert.deepEqual(
      register.body.cantMakeIt.map((entry) => [entry.sessionKey, entry.uids]),
      [["w05", ["amara"]]],
    );
    assert.doesNotMatch(JSON.stringify(register.body), /mostWeeks|timeAnswer|Most weeks/);
  });
});

// ---------------------------------------------------------------------------
// 3. The card on the programme page, and the campus at its head
// ---------------------------------------------------------------------------

describe("9b. weeks are ticked while the question is asked, and only taken off after", () => {
  const LATER = `Thu 3 Dec: ${words.ANSWER_REFUSAL.addLater}`;

  test("the first answer ticks what it likes; a later answer that adds a week is refused in one sentence, and nothing is written", async () => {
    const first = await answer("amara", MOST("w05"));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(toldOn(5), ["amara"], "the first answer's tick is not written");
    const before = w.everything();
    const added = await answer("amara", MOST("w05", "w06"));
    assert.deepEqual(short(added), [409, LATER]);
    assert.equal(w.everything(), before, "a refused answer wrote something");
    assert.deepEqual(toldOn(6), []);
    assert.equal(
      words.ANSWER_REFUSAL.addLater,
      "You’ve answered this already, so no week can be added here. To miss another week, press Can’t make it on your next session’s card and ask to be excused.",
    );
    // From a yes or a different time, too: changing the answer is open, adding a week is not.
    assert.equal((await answer("amara", YES)).status, 200);
    assert.deepEqual(short(await answer("amara", MOST("w06"))), [409, LATER]);
    // Most weeks with nothing more ticked, and unticking, are as before.
    assert.equal((await answer("amara", MOST("w05"))).status, 200);
    const off = await answer("amara", MOST());
    assert.equal(off.status, 200);
    assert.deepEqual(toldOn(5), [], "unticking did not take it back");
    assert.deepEqual(short(await answer("amara", MOST("w05"))), [409, "Thu 26 Nov: " + words.ANSWER_REFUSAL.addLater], "a week taken off came back on");
  });

  test("somebody who answered before this rule existed has answered: they untick, and ask for anything new", async () => {
    // An answer stored with no ticks and a moment before any asking moved: current, so answered.
    world.db.poke(enrolmentPath("amara"), {
      timeAnswer: { kind: "yes", reason: null, alternatives: null, forGroupId: A, at: new Date("2026-10-30T09:00:00Z") },
    });
    assert.deepEqual(short(await answer("amara", MOST("w06"))), [409, LATER]);
  });

  test("asked again after a new regular time: weeks may be ticked once more, then only taken off", async () => {
    assert.equal((await answer("amara", MOST("w05"))).status, 200);
    assert.equal((await answer("amara", MOST("w05", "w06"))).status, 409);
    // The group's regular time changed: the question is asked again from then.
    world.db.poke(`courseGroups/${A}`, { timeQuestionSince: new Date(NOW.getTime() + 60_000) });
    mock.timers.setTime(NOW.getTime() + 120_000);
    const again = await answer("amara", MOST("w05", "w06"));
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual([toldOn(5), toldOn(6)], [["amara"], ["amara"]]);
    // Answered again: closed again.
    assert.deepEqual(short(await answer("amara", MOST("w04", "w05", "w06"))), [409, `Thu 19 Nov: ${words.ANSWER_REFUSAL.addLater}`]);
  });

  test("the card offers every session to tick while it is asked, and only the ticked ones, to untick, once answered", () => {
    const sessions = [
      { sessionKey: "w04", weekNumber: 4, day: "Thu 19 Nov", told: false },
      { sessionKey: "w05", weekNumber: 5, day: "Thu 26 Nov", told: true },
    ];
    assert.deepEqual(model.ticksOffered(sessions, false).map((each) => each.sessionKey), ["w04", "w05"]);
    assert.deepEqual(model.ticksOffered(sessions, true).map((each) => each.sessionKey), ["w05"]);
    assert.equal(words.UNTICK_ONLY, "You can untick a week here. To miss another week, press Can’t make it on your next session’s card and ask to be excused.");
    const card = readFileSync(join(REPO_ROOT, "src/features/courses/timeAnswer/TimeAnswerCard.tsx"), "utf8");
    assert.match(card, /const untickOnly = answer !== null;\s*const offered = ticksOffered\(sessions, untickOnly\);/);
    assert.match(card, /\{untickOnly \? UNTICK_ONLY : sessions\.length > 0 \? MOST_WEEKS_INTRO : NONE_TO_TICK\}/);
    assert.match(card, /\{offered\.map\(\(each\) => \(/);
    // Where they tick the weeks they will miss: what a certificate needs, when the run home hands it over.
    assert.match(card, /\{certificateNeeds && \(\s*<p className=\{styles\.note\}>\s*\{certificateNeeds\}\s*<\/p>\s*\)\}\s*<p className=\{styles\.note\}>\{MOST_WEEKS_WHO_READS\}<\/p>/);
  });
});

describe("3. the card on the programme page", () => {
  const home = (who) => w.draw(w.pages.home, who, { runId: RUN.agi });

  test("the page hands its run home the question for the person told their group, and for nobody else", async () => {
    const drawn = await home("amara");
    assert.equal(drawn.wrote, false);
    assert.deepEqual(w.ui.runHome.timeQuestion, {
      groupId: A,
      groupName: "Group A",
      when: "Thursdays, 6pm to 8pm",
      campus: null,
      answer: null,
      // Group A's sessions still to come, soonest first: it met on Thu 12 Nov, and meets on Thursdays.
      sessions: [
        { sessionKey: "w04", weekNumber: 4, day: "Thu 19 Nov", told: false },
        { sessionKey: "w05", weekNumber: 5, day: "Thu 26 Nov", told: false },
        { sessionKey: "w06", weekNumber: 6, day: "Thu 3 Dec", told: false },
      ],
    });
    assert.equal(w.ui.runHome.viewAs, false);

    await answer("amara", CANT);
    await home("amara");
    assert.deepEqual(w.ui.runHome.timeQuestion.answer, { kind: "cant", reason: WHY, alternatives: WOULD });

    for (const who of ["sofia", "zach", "claudia"]) {
      const page = await home(who);
      assert.equal(page.to === null ? (w.ui.runHome?.timeQuestion ?? null) : null, null, who);
    }
    // Una, placed and not told: the page is shut to her as before, and no card.
    const una = await home("una");
    assert.equal(una.to === null ? (w.ui.runHome?.timeQuestion ?? null) : null, null);
    // Somebody who facilitates the group they sit in is not asked.
    world.db.seed(`courseGroups/${A}`, { ...read(`courseGroups/${A}`), facilitatorUids: ["sofia", "dev"] });
    await home("dev");
    assert.equal(w.ui.runHome.timeQuestion, null);
  });

  test("in a view-as session the page says so, and the card cannot be pressed", async () => {
    world.viewAs = true;
    try {
      await home("amara");
    } finally {
      world.viewAs = false;
    }
    assert.equal(w.ui.runHome.viewAs, true);
    assert.equal(w.ui.runHome.timeQuestion.groupId, A);
  });

  /** The real run home, handed the overview route's own answer for `who`. */
  async function runHome(who, props = {}, overviewChange = (payload) => payload) {
    const overview = await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    w.ui.overview = { data: overviewChange(overview.body), error: null, reload() {} };
    await home(who);
    const handed = { ...w.ui.runHome, ...props };
    const html = renderToStaticMarkup(createElement(w.components.RunHome, handed));
    return { html, text: textOf(html) };
  }

  test("the card: their group's day and time, the three answers about most weeks, and that each keeps their place", async () => {
    const { html, text } = await runHome("amara");
    assert.match(
      text,
      /Can you make this time most weeks\? Group A meets Thursdays, 6pm to 8pm\. Yes Most weeks, not all No, I need a different time Either way, you keep your place\./,
    );
    // The card's words are the words file's, the email's own.
    assert.ok(text.includes(`${words.CARD_TITLE} `), "the card does not ask the question in the words file's words");
    assert.ok(text.includes(`${words.ANSWER_YES} ${words.ANSWER_MOST_WEEKS} ${words.ANSWER_CANT} ${words.KEEP_YOUR_PLACE}`));
    // Every answer pressable only once the page's script has arrived.
    for (const label of [words.ANSWER_YES, words.ANSWER_MOST_WEEKS, words.ANSWER_CANT]) {
      assert.match(html, new RegExp(`<button[^>]*disabled=""[^>]*><span>${label}</span>`), label);
    }
    w.ui.hydrated = true;
    const live = await runHome("amara");
    for (const label of [words.ANSWER_YES, words.ANSWER_MOST_WEEKS, words.ANSWER_CANT]) {
      assert.doesNotMatch(live.html, new RegExp(`<button[^>]*disabled=""[^>]*><span>${label}</span>`), label);
      assert.match(live.html, new RegExp(`<button[^>]*><span>${label}</span>`), label);
    }
    // Locked in a view-as session, hydrated or not.
    const locked = await runHome("amara", { viewAs: true });
    for (const label of [words.ANSWER_YES, words.ANSWER_MOST_WEEKS, words.ANSWER_CANT]) {
      assert.match(locked.html, new RegExp(`<button[^>]*disabled=""[^>]*><span>${label}</span>`), label);
    }
    // Nothing on the card leads to the leave.
    const card = /Can you make this time most weeks\?.*?Either way, you keep your place\./.exec(live.text)[0];
    assert.doesNotMatch(card, /Leave|give your place back/i);
  });

  test("once answered, the card says what they said, and offers to change it", async () => {
    w.ui.hydrated = true;
    // Most weeks, not all, in the first answer: the sessions still to come
    // they can't make, by day, and where that is recorded.
    await answer("amara", MOST("w05", "w06"));
    const most = await runHome("amara");
    assert.match(
      most.text,
      /Group A meets Thursdays, 6pm to 8pm\. You’ve told us you can make it most weeks\. You can’t make Thu 26 Nov or Thu 3 Dec, and whoever runs your sessions knows\. Change your answer/,
    );
    assert.ok(!most.text.includes(WHY));
    // One unticked: one day.
    assert.equal((await answer("amara", MOST("w05"))).status, 200);
    assert.match(
      (await runHome("amara")).text,
      /You’ve told us you can make it most weeks\. You can’t make Thu 26 Nov, and whoever runs your sessions knows\. Change your answer/,
    );
    // None ticked: most weeks, and nothing more.
    await answer("amara", MOST());
    assert.match((await runHome("amara")).text, /You’ve told us you can make it most weeks\. Change your answer/);
    await answer("amara", CANT);
    const cant = await runHome("amara");
    assert.match(
      cant.text,
      new RegExp(
        `Can you make this time most weeks\\? Group A meets Thursdays, 6pm to 8pm\\. ${words.SAID_CANT.replace(/[.?]/g, "\\$&")} ` +
          `What you told us Why ${WHY} Would work ${WOULD} Change your answer`,
      ),
    );
    assert.equal(
      words.SAID_CANT,
      "You’ve told us you need a different time. You keep your place while we look at moving you to another group, and we’ll be in touch.",
    );
    await answer("amara", YES);
    const yes = await runHome("amara");
    assert.match(yes.text, /Group A meets Thursdays, 6pm to 8pm\. You’ve told us you can make it\. Change your answer/);
    assert.ok(!yes.text.includes(WHY));
  });

  test("an answer staff read as most weeks says so on their card, with the words they wrote", async () => {
    w.ui.hydrated = true;
    await answer("amara", CANT);
    assert.equal((await someWeeks("zach", "amara", { sessionKeys: ["w05"] })).status, 200);
    const { text } = await runHome("amara");
    assert.match(
      text,
      new RegExp(
        "You’ve told us you can make it most weeks\\. You can’t make Thu 26 Nov, and whoever runs your sessions knows\\. " +
          `What you told us Why ${WHY} Would work ${WOULD} Change your answer`,
      ),
    );
  });

  test("the campus: beside the time at the head, on the card, and in the ticket's room while there is none", async () => {
    world.db.seed(`courseGroups/${A}`, {
      ...read(`courseGroups/${A}`),
      campus: "jubilee",
      session: { ...read(`courseGroups/${A}`).session, location: "" },
    });
    const { text } = await runHome("amara");
    assert.match(text, /Group A · Thursdays 6pm · Jubilee · with Sofia/);
    // The next session's ticket: the campus where its room would be.
    assert.match(text, /Your next session · week 4 Thu 19 Nov, 6pm to 8pm Jubilee S with Sofia/);
    assert.match(text, /Group A meets Thursdays, 6pm to 8pm, on Jubilee campus\./);
    // With a room, both: the campus beside the time, the room after it.
    world.db.seed(`courseGroups/${A}`, { ...read(`courseGroups/${A}`), session: { ...read(`courseGroups/${A}`).session, location: "Portland A13" } });
    assert.match((await runHome("amara")).text, /Group A · Thursdays 6pm · Jubilee · Portland A13 · with Sofia/);
    // Online.
    world.db.seed(`courseGroups/${A}`, { ...read(`courseGroups/${A}`), campus: "online" });
    assert.match((await runHome("amara")).text, /Group A meets Thursdays, 6pm to 8pm, online\./);
  });

  test("an incubator's people are told of no group, so the card names none", async () => {
    const { text } = await runHome("amara", {}, (payload) => ({
      ...payload,
      programme: { ...(payload.programme ?? { name: "AGI Strategy", leadFirstName: null }), kind: "incubator" },
    }));
    assert.match(text, /Can you make this time most weeks\? You meet Thursdays, 6pm to 8pm\./);
  });
});

// ---------------------------------------------------------------------------
// 4. What a move does to it
// ---------------------------------------------------------------------------

describe("4. a told seat keeps its answer through a move, shown only while it is about the seat's group", () => {
  test("the board's move, a placement where they already are, and a move back", async () => {
    await answer("amara", CANT);
    // Placed where they already are: nothing to do, and the answer stays.
    assert.equal((await w.join.place("zach", [{ uid: "amara", groupId: A }])).status, 200);
    assert.equal(seat("amara").timeAnswer.kind, "cant");
    assert.equal((await boardRows("zach")).rows.amara.timeAnswer?.kind, "cant");
    // Moved: she stays told, with Publish's stamp and the group she was told
    // about, and her answer about Group A stays on her seat, shown nowhere
    // while she is in Group B.
    const moved = await w.join.place("zach", [{ uid: "amara", groupId: B }]);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual(
      [seat("amara").groupId, seat("amara").timeAnswer.forGroupId, seat("amara").allocatedEmailAt instanceof Date, seat("amara").toldGroupId],
      [B, A, true, A],
    );
    assert.equal((await boardRows("zach")).rows.amara.timeAnswer, null);
    // Moved back by mistake undone: the answer is hers again, and nothing else changed.
    assert.equal((await w.join.place("zach", [{ uid: "amara", groupId: A }])).status, 200);
    assert.equal((await boardRows("zach")).rows.amara.timeAnswer?.kind, "cant");
    assert.equal(seat("amara").toldGroupId, A);
  });

  test("a most weeks answer stays on a told seat through a move, about the group it was given for, and the group left behind stops naming them", async () => {
    assert.equal((await answer("amara", MOST("w05"))).status, 200);
    const moved = await w.join.place("zach", [{ uid: "amara", groupId: B }]);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(seat("amara").groupId, B);
    // Kept, as a told seat keeps its answer through a move, and shown only while they are in the group it is about.
    assert.deepEqual([seat("amara").timeAnswer?.kind, seat("amara").timeAnswer?.forGroupId], ["mostWeeks", A]);
    // The register keeps its line, as it keeps every line of somebody who moved, and names only its people.
    const register = await call("sofia", routes.register.GET, { groupId: A }, { course: true });
    assert.equal(register.status, 200);
    assert.ok(!JSON.stringify(register.body.cantMakeIt ?? []).includes("amara"));
  });

  test("taking somebody out of groups keeps it, and shows it nowhere", async () => {
    await answer("dev", { ...CANT });
    assert.equal((await w.join.place("zach", [{ uid: "dev", groupId: null }])).status, 200);
    assert.deepEqual([seat("dev").groupId, seat("dev").timeAnswer.forGroupId, seat("dev").allocatedEmailAt instanceof Date], [null, A, true]);
    assert.equal((await boardRows("zach")).rows.dev.timeAnswer, null);
  });

  test("the leave keeps it as it keeps the stamp, nothing shows it, and putting them back clears it", async () => {
    await answer("amara", CANT);
    const left = await w.leave("amara");
    assert.equal(left.status, 200, JSON.stringify(left.body));
    // The leave is untouched: the field stays on the seat that left, as the stamp does...
    assert.equal(seat("amara").status, "withdrawn");
    assert.equal(seat("amara").timeAnswer.kind, "cant");
    // ...and no reader shows an answer on a seat that is no longer taking part.
    assert.equal((await boardRows("zach")).rows.amara.timeAnswer, null);
    // Put back on the board: a fresh placement, asked afresh.
    assert.equal((await w.join.place("zach", [{ uid: "amara", groupId: A }])).status, 200);
    assert.deepEqual([seat("amara").status, seat("amara").timeAnswer], ["active", undefined]);
  });

  test("Remove", async () => {
    await answer("dev", CANT);
    const removed = await call("zach", w.join.routes.remove.POST, { runId: RUN.agi, uid: "dev" }, { course: true });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.deepEqual([seat("dev").status, seat("dev").timeAnswer], ["removed", undefined]);
  });

  test("an appointment that seats a facilitator who holds a place and sits in no group", async () => {
    // Tariq was told about Group A, then taken out of groups after answering
    // about it: he stays told, so the appointment keeps the answer as it
    // keeps the stamp, and nothing shows it while he sits in Group B.
    world.db.seed(enrolmentPath("tariq"), {
      ...seat("tariq"),
      groupId: null,
      toldGroupId: A,
      timeAnswer: { kind: "cant", reason: WHY, alternatives: WOULD, forGroupId: A, at: NOW },
    });
    assert.ok(seat("tariq").allocatedEmailAt instanceof Date, "Tariq is not told in this world");
    const appointed = await call("zach", facilitatorsRoute.POST, { groupId: B }, {
      body: { uids: ["rahul", "sofia", "tariq"] },
      course: true,
    });
    assert.equal(appointed.status, 200, JSON.stringify(appointed.body));
    assert.deepEqual(
      [seat("tariq").groupId, seat("tariq").timeAnswer.forGroupId, seat("tariq").allocatedEmailAt instanceof Date],
      [B, A, true],
    );
    assert.equal((await boardRows("zach")).rows.tariq?.timeAnswer ?? null, null);
  });

  test("an appointment that seats somebody nobody has told deletes an answer, as the stamp", async () => {
    // A stored answer on a seat nobody has told is no answer anybody gave
    // about a group they were told: it goes as the seat is placed.
    world.db.seed(enrolmentPath("tariq"), {
      ...seat("tariq"),
      groupId: null,
      allocatedEmailAt: null,
      timeAnswer: { kind: "cant", reason: WHY, alternatives: WOULD, forGroupId: A, at: NOW },
    });
    const appointed = await call("zach", facilitatorsRoute.POST, { groupId: B }, {
      body: { uids: ["rahul", "sofia", "tariq"] },
      course: true,
    });
    assert.equal(appointed.status, 200, JSON.stringify(appointed.body));
    assert.deepEqual([seat("tariq").groupId, seat("tariq").timeAnswer, seat("tariq").allocatedEmailAt], [B, undefined, undefined]);
  });

  test("THE TREE: every write that clears Publish's stamp clears the answer in the same write, and the leave names neither", () => {
    const STAMP = /\ballocatedEmailAt(?:\s*:|\s*=)\s*FieldValue\.delete\(\)/g;
    const ANSWER = /\btimeAnswer(?:\s*:|\s*=)\s*FieldValue\.delete\(\)/g;
    const writers = [];
    for (const file of walkSource(SRC)) {
      const code = stripSource(readFileSync(file, "utf8"));
      const stamps = [...code.matchAll(STAMP)].length;
      const answers = [...code.matchAll(ANSWER)].length;
      if (stamps + answers === 0) continue;
      const name = posix(relative(SRC, file));
      writers.push(name);
      assert.equal(
        answers,
        stamps,
        `${name} clears Publish's stamp ${stamps} time(s) and the answer to "can you make this time?" ${answers}. ` +
          "A seat that changes group, or is placed afresh, is asked afresh: clear `timeAnswer` beside the stamp.",
      );
    }
    // The scan is reading: it finds the writers this file knows by name.
    for (const known of [
      "app/api/courses/runs/[runId]/allocate/route.ts",
      "app/api/courses/runs/[runId]/enrol/route.ts",
      "app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts",
      "app/api/courses/runs/[runId]/enrolments/[uid]/reinstate/route.ts",
      "lib/courses/groupFacilitators.ts",
    ]) {
      assert.ok(writers.includes(known), `${known} no longer clears Publish's stamp, or the scan missed it`);
    }
    const leave = stripSource(readFileSync(join(SRC, "lib", "courses", "leaveRun.ts"), "utf8"));
    assert.doesNotMatch(leave, /timeAnswer/, "the leave touches the answer: it must stay the leave and nothing else");
  });
});

// ---------------------------------------------------------------------------
// 5. The stale-answer rule
// ---------------------------------------------------------------------------

describe("5. a stale answer never shows", () => {
  const answerAbout = (forGroupId, over = {}) => ({
    role: "learner",
    status: "active",
    groupId: A,
    timeAnswer: { kind: "cant", reason: WHY, alternatives: WOULD, forGroupId, at: NOW },
    ...over,
  });

  test("currentTimeAnswer: only an answer about the seat's group now, on a seat taking part", () => {
    assert.deepEqual(model.currentTimeAnswer(answerAbout(A)), { kind: "cant", reason: WHY, alternatives: WOULD });
    assert.equal(model.currentTimeAnswer(answerAbout(B)), null, "about another group");
    assert.equal(model.currentTimeAnswer(answerAbout(A, { groupId: null })), null, "in no group");
    assert.equal(model.currentTimeAnswer(answerAbout(A, { status: "withdrawn" })), null, "left");
    assert.equal(model.currentTimeAnswer(answerAbout(A, { status: "removed" })), null, "taken off");
    assert.equal(model.currentTimeAnswer(answerAbout(A, { status: "completed" })), null, "finished");
    assert.equal(model.currentTimeAnswer(answerAbout(A, { role: "facilitator" })), null, "a facilitator's row");
    assert.equal(model.currentTimeAnswer({ role: "learner", status: "active", groupId: A }), null, "no answer");
    // Most weeks, not all, by the same rule, with its list.
    const most = { kind: "mostWeeks", reason: null, alternatives: null, sessionKeys: ["w05"], forGroupId: A, at: NOW };
    assert.deepEqual(model.currentTimeAnswer({ role: "learner", status: "active", groupId: A, timeAnswer: most }), {
      kind: "mostWeeks",
      reason: null,
      alternatives: null,
      sessionKeys: ["w05"],
    });
    assert.equal(model.currentTimeAnswer({ role: "learner", status: "active", groupId: B, timeAnswer: most }), null);
    assert.equal(model.currentTimeAnswer({ role: "learner", status: "withdrawn", groupId: A, timeAnswer: most }), null);
  });

  test("who can make the time: yes and most weeks, never a can't, and nobody who has not answered", () => {
    assert.equal(model.canMakeTheTime({ kind: "yes" }), true);
    assert.equal(model.canMakeTheTime({ kind: "mostWeeks" }), true);
    assert.equal(model.canMakeTheTime({ kind: "cant" }), false);
    assert.equal(model.canMakeTheTime(null), false);
    assert.deepEqual(["w03", "w03-2", "w10", "w100"].map(model.weekOfSessionKey), [3, 3, 10, 100]);
  });

  test("the normaliser keeps only a whole answer, and a yes carries no words", () => {
    const of = (timeAnswer) => enrolments.normalizeCourseEnrolment("x", { uid: "u", runId: "r", timeAnswer }).timeAnswer;
    assert.deepEqual(of({ kind: "yes", reason: WHY, alternatives: WOULD, forGroupId: A, at: NOW }), {
      kind: "yes",
      reason: null,
      alternatives: null,
      forGroupId: A,
      at: NOW,
    });
    assert.deepEqual(of({ kind: "cant", reason: ` ${WHY} `, alternatives: WOULD, forGroupId: A, at: null }), {
      kind: "cant",
      reason: WHY,
      alternatives: WOULD,
      forGroupId: A,
      at: null,
    });
    for (const broken of [
      null,
      "cant",
      [],
      { kind: "maybe", forGroupId: A },
      { kind: "yes" },
      { kind: "yes", forGroupId: "" },
      { kind: "cant", reason: WHY, forGroupId: A },
      { kind: "cant", alternatives: WOULD, forGroupId: A },
      { kind: "cant", reason: "  ", alternatives: WOULD, forGroupId: A },
      { kind: "mostWeeks", forGroupId: A },
      { kind: "mostWeeks", sessionKeys: "w05", forGroupId: A },
      { kind: "mostWeeks", sessionKeys: [] },
    ]) {
      assert.equal(of(broken), undefined, JSON.stringify(broken));
    }
    // Most weeks, not all: its sessions once each, in the group's order, only keys; a yes or a can't carries none.
    assert.deepEqual(of({ kind: "mostWeeks", sessionKeys: ["w06", "w04", "nope", 4, "w04", "w04-2"], forGroupId: A, at: NOW }), {
      kind: "mostWeeks",
      reason: null,
      alternatives: null,
      sessionKeys: ["w04", "w04-2", "w06"],
      forGroupId: A,
      at: NOW,
    });
    // Kept words, when staff read a can't as most weeks.
    assert.deepEqual(of({ kind: "mostWeeks", sessionKeys: [], reason: ` ${WHY}`, alternatives: WOULD, forGroupId: A, at: null }), {
      kind: "mostWeeks",
      reason: WHY,
      alternatives: WOULD,
      sessionKeys: [],
      forGroupId: A,
      at: null,
    });
    assert.equal(of({ kind: "yes", sessionKeys: ["w05"], forGroupId: A }).sessionKeys, undefined);
    assert.equal(of({ kind: "cant", reason: WHY, alternatives: WOULD, sessionKeys: ["w05"], forGroupId: A }).sessionKeys, undefined);
    // At most as many sessions as a run can hold.
    const many = Array.from({ length: 200 }, (_, i) => `w${String(i + 1).padStart(3, "0")}`);
    assert.equal(of({ kind: "mostWeeks", sessionKeys: many, forGroupId: A }).sessionKeys.length, enrolments.ENROLMENT_LIMITS.timeAnswerSessions);
    // The pattern is the ticket's own.
    for (const key of ["w03", "w03-2", "w100", "w12-9"]) assert.equal(enrolments.isSessionKey(key), true, key);
    for (const key of ["w3", "w03-1", "w03-10", "W03", "w0003", "", null, 3]) assert.equal(enrolments.isSessionKey(key), false, String(key));
  });

  test("an answer stored about another group shows on neither the card nor the board", async () => {
    world.db.seed(enrolmentPath("amara"), {
      ...seat("amara"),
      timeAnswer: { kind: "cant", reason: WHY, alternatives: WOULD, forGroupId: B, at: NOW },
    });
    await w.draw(w.pages.home, "amara", { runId: RUN.agi });
    assert.equal(w.ui.runHome.timeQuestion.answer, null);
    assert.equal((await boardRows("zach")).rows.amara.timeAnswer, null);
  });
});

// ---------------------------------------------------------------------------
// 6. Who reads it
// ---------------------------------------------------------------------------

describe("6. the person, the programme's lead and admins read it; nobody else does", () => {
  test("the board's rows: the answer for an admin and the lead, null for a track lead, and refused to facilitators", async () => {
    await answer("amara", CANT);
    await answer("chloe", { ...CANT, groupId: B });
    await answer("dev", YES);
    await answer("tariq", MOST("w05"));
    const expected = { kind: "cant", reason: WHY, alternatives: WOULD };
    for (const who of ["zach", "claudia"]) {
      const { status, rows } = await boardRows(who);
      assert.equal(status, 200, who);
      assert.deepEqual(rows.amara.timeAnswer, expected, who);
      assert.deepEqual(rows.chloe.timeAnswer, expected, who);
      assert.deepEqual(rows.dev.timeAnswer, { kind: "yes", reason: null, alternatives: null }, who);
      assert.deepEqual(rows.tariq.timeAnswer, { kind: "mostWeeks", reason: null, alternatives: null, sessionKeys: ["w05"] }, who);
      assert.equal(rows.bea.timeAnswer, null, `${who}: somebody who has not answered`);
    }
    // The run's track lead is served the row of somebody who applied to the
    // run itself (Chloe), and is sent no answer on it.
    const yusuf = await boardRows("yusuf");
    assert.equal(yusuf.status, 200);
    assert.ok(Object.keys(yusuf.rows).length > 0);
    for (const row of Object.values(yusuf.rows)) assert.equal(row.timeAnswer, null, row.uid);
    assert.ok(!JSON.stringify(yusuf).includes(WHY));
    for (const who of ["sofia", "rahul", "tom", "tess", "amara", "nobody"]) {
      const board = await w.join.board(who);
      assert.notEqual(board.status, 200, who);
      assert.ok(!JSON.stringify(board.body).includes(WHY), who);
    }
  });

  test("a facilitator of the group and another member read it nowhere they look", async () => {
    await answer("amara", CANT);
    const reads = [
      ["sofia", routes.roster.GET, { groupId: A }],
      ["sofia", routes.overview.GET, { runId: RUN.agi }],
      ["sofia", routes.register.GET, { groupId: A }],
      ["dev", routes.roster.GET, { groupId: A }],
      ["dev", routes.overview.GET, { runId: RUN.agi }],
      ["claudia", routes.overview.GET, { runId: RUN.agi }],
    ];
    for (const [who, handler, params] of reads) {
      const response = await call(who, handler, params, { course: true });
      assert.ok(!JSON.stringify(response.body).includes(WHY), `${who} read the reason through ${handler.name} ${JSON.stringify(params)}`);
      assert.ok(!JSON.stringify(response.body).includes(WOULD), `${who} read the other times`);
    }
    // The person's own page does show it, which is the card.
    await w.draw(w.pages.home, "amara", { runId: RUN.agi });
    assert.equal(w.ui.runHome.timeQuestion.answer.reason, WHY);
  });

  /**
   * EVERY FILE THAT NAMES THE ANSWER, and why it may. A new reader fails
   * this until somebody decides who it shows the answer to.
   */
  const NAMES_IT = new Map([
    ["lib/firestore/courseEnrolments.ts", "the seat's own shape, where the answer is kept, its normaliser and its limits"],
    ["lib/courses/timeAnswer/model.ts", "the stale-answer rule every reader asks, and the route's body"],
    ["lib/courses/timeAnswer/seat.ts", "the person's own writer, on the caller's own seat, and the person's own card"],
    ["app/api/courses/runs/[runId]/time-answer/route.ts", "the person's own answer, answered back to them"],
    [
      "lib/courses/timeAnswer/someWeeks.ts",
      "They meant some weeks: staff read a can't as most weeks behind the route's gate, an admin or the programme's lead, keeping the person's words",
    ],
    [
      "app/api/courses/runs/[runId]/enrolments/[uid]/time-answer/route.ts",
      "They meant some weeks' route: the gate (readsTimeAnswers, an admin or the programme's lead), then the answer it changed, answered back to them",
    ],
    [
      "lib/courses/regularTime/apply.ts",
      "a new regular time from a week onwards, behind the route's gate (an admin, the programme's lead or a track lead): reads each fellow's answer about the group by the stale rule and takes back the ticks of a most weeks answer on the old time, never changing the stored answer",
    ],
    [
      "lib/courses/cantMakeIt/seat.ts",
      "the ticket's Can't make it keeps a most weeks answer's list of sessions in step with the register, on the caller's own seat, and changes no other answer",
    ],
    [
      "lib/courses/excused/own.ts",
      "the person's own excused weeks, by their own uid: a session they ticked under most weeks reads as said when the time was set, through the stale-answer rule, and nothing is counted",
    ],
    [
      "lib/courses/excused/page.ts",
      "one request to be excused, an admin's alone: the sessions ticked under most weeks, counted apart from approved weeks and earlier lines, through the stale-answer rule",
    ],
    ["features/courses/timeAnswer/TimeAnswerCard.tsx", "the person's own card, drawing what they said"],
    ["features/courses/RunHome.tsx", "hands the person's own card what the server page worked out"],
    ["app/(app)/learn/[runId]/page.tsx", "the person's own programme page, which works out their own card behind its gate"],
    ["app/api/courses/runs/[runId]/allocation/route.ts", "the board's rows, for an admin and the programme's lead alone"],
    ["features/courses/useAllocation.ts", "the board's wire type for those rows"],
    ["app/api/courses/runs/[runId]/allocate/route.ts", "a move or a fresh placement deletes it"],
    ["app/api/courses/runs/[runId]/enrol/route.ts", "an open run's change of session deletes it"],
    ["app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts", "taking somebody off deletes it"],
    ["app/api/courses/runs/[runId]/enrolments/[uid]/reinstate/route.ts", "putting somebody back deletes it"],
    ["lib/courses/groupFacilitators.ts", "an appointment that seats a facilitator who holds a place deletes it"],
    [
      "features/applications/groups/peopleInGroupsBoard.ts",
      "the board's card marks, Can make it, Misses week 3 and Can't make this time, for the lead and admins",
    ],
    [
      "features/applications/groups/PeopleInGroups.tsx",
      "the board's card for the lead and admins: why, and what would work, under a can't (with They meant some weeks) and under a most weeks that kept them",
    ],
    [
      "lib/courses/staffMove/plan.ts",
      "moving somebody for good, for the lead and admins: a most weeks answer about the old group names the sessions from the week of the move on that no longer apply, on the page only; the answer itself is left as it is",
    ],
    ["lib/applications/arrange/load.ts", "Circles' read of each seat, an admin's alone, through the stale-answer rule"],
    ["lib/applications/arrange/plan.ts", "the arranged person's type, which carries the answer for the screen and is never sent to Claude"],
    ["lib/applications/arrange/view.ts", "Circles' person as the admin's screen is sent it"],
    [
      "lib/applications/arrange/advise.ts",
      "puts the answer on Circles' person for the admin's screen; Claude's message is written line by line and never names it (tests/applications-circles.test.mjs)",
    ],
    ["features/applications/circles/Ring.tsx", "Circles' rings, an admin's alone: a Can't make this time mark on the live run"],
    [
      "features/applications/circles/PersonPanel.tsx",
      "Circles' person panel, an admin's alone: their answer, the weeks a most weeks misses, and for a can't why, what would work and They meant some weeks",
    ],
  ]);

  test("every file that names it is listed with why, both ways", () => {
    const naming = [...walkSource(SRC)]
      .filter((file) =>
        /\btimeAnswer\b|\bTimeAnswer(?:View|Card|Kind)\b|\bcurrentTimeAnswer\b|\btimeQuestionFor\b|\bTimeQuestionView\b/.test(
          stripSource(readFileSync(file, "utf8")),
        ),
      )
      .map((file) => posix(relative(SRC, file)))
      .sort();
    assert.deepEqual(naming, [...NAMES_IT.keys()].sort());
    for (const [file, why] of NAMES_IT) assert.ok(why.length >= 30, `${file} needs its reason`);
  });
});

describe("6b. it goes with the seat", () => {
  test("deleting the account deletes the seat whole, and destroying the run drains its seats", () => {
    // Kept on the seat and nowhere else (the list above), so the seat's own
    // deletion is the answer's.
    const account = stripSource(readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8"), { keepStrings: true });
    assert.match(account, /enrolSnap = await db\.collection\("courseEnrolments"\)\.where\("uid", "==", uid\)\.get\(\);/);
    assert.match(account, /for \(const d of enrolSnap\.docs\) batch\.delete\(d\.ref\);/);
    const run = stripSource(readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8"), { keepStrings: true });
    assert.match(run, /drainQuery\(db, "courseEnrolments", byRunId\("courseEnrolments"\), budget\)/);
  });
});

// ---------------------------------------------------------------------------
// 7. The campus
// ---------------------------------------------------------------------------

describe("7. a group's campus", () => {
  test("the three campuses, the normaliser and the body", () => {
    assert.deepEqual([...campus.GROUP_CAMPUSES], ["university-park", "jubilee", "online"]);
    assert.deepEqual(campusWords.CAMPUS_LABEL, { "university-park": "University Park", jubilee: "Jubilee", online: "Online" });
    for (const value of campus.GROUP_CAMPUSES) {
      assert.equal(campus.campusOf(value), value);
      assert.equal(groups.normalizeCourseGroup("g", { campus: value }).campus, value);
    }
    for (const value of [undefined, null, "", "Jubilee", "sutton-bonington", 3, {}]) {
      assert.equal(groups.normalizeCourseGroup("g", { campus: value }).campus, null, String(value));
    }
    assert.deepEqual(campus.parseCampusBody({ campus: "jubilee" }), { ok: true, value: "jubilee" });
    assert.deepEqual(campus.parseCampusBody({ campus: null }), { ok: true, value: null });
    assert.deepEqual(campus.parseCampusBody({}), { ok: false, error: campusWords.CAMPUS_REFUSAL.notACampus });
    assert.deepEqual(campus.parseCampusBody({ campus: "Jubilee" }), { ok: false, error: campusWords.CAMPUS_REFUSAL.notACampus });
    assert.deepEqual(campus.parseCampusBody([]), { ok: false, error: campusWords.CAMPUS_REFUSAL.body });
    assert.equal(campus.roomOrCampus("  ", "jubilee"), "Jubilee");
    assert.equal(campus.roomOrCampus("Portland A13", "jubilee"), "Portland A13");
    assert.equal(campus.roomOrCampus("", null), "");
    assert.equal(campusWords.campusSentence("university-park"), "Your group meets on University Park campus.");
    assert.equal(campusWords.campusSentence("online"), "Your group meets online.");
  });

  test("the programme's lead and an admin set it; it saves, moves the group's stamp, and emails nobody", async () => {
    for (const [who, value] of [
      ["zach", "jubilee"],
      ["claudia", "university-park"],
      ["claudia", null],
    ]) {
      const response = await setCampus(who, A, value);
      assert.equal(response.status, 200, `${who}: ${JSON.stringify(response.body)}`);
      assert.deepEqual(response.body, {
        ok: true,
        changed: true,
        groupId: A,
        groupName: "Group A",
        campus: value,
        message: campusWords.campusSavedWords("Group A", value),
      });
      assert.equal(read(`courseGroups/${A}`).campus, value);
      assert.ok(read(`courseGroups/${A}`).updatedAt instanceof Date);
    }
    // The campus it already has: nothing written.
    const before = w.everything();
    const same = await setCampus("zach", A, null);
    assert.deepEqual([same.status, same.body.changed], [200, false]);
    assert.equal(w.everything(), before);
    // After Publish has told people their group, as a room may.
    assert.ok(seat("amara").allocatedEmailAt instanceof Date);
    assert.equal((await setCampus("claudia", A, "online")).status, 200);
    assert.deepEqual(world.mail, []);
  });

  for (const [who, expected, why] of [
    [null, [401, "Not signed in"], "somebody signed out"],
    ["lloyd", [403, campusWords.CAMPUS_REFUSAL.notYours], "the programme's reviewer"],
    ["tess", [404, campusWords.CAMPUS_REFUSAL.noProgramme], "the lead of another programme"],
    ["yusuf", [404, campusWords.CAMPUS_REFUSAL.noProgramme], "the run's track lead"],
    ["sofia", [404, campusWords.CAMPUS_REFUSAL.noProgramme], "a facilitator of the group"],
    ["amara", [404, campusWords.CAMPUS_REFUSAL.noProgramme], "somebody in the group"],
    ["nobody", [404, campusWords.CAMPUS_REFUSAL.noProgramme], "a member on nothing"],
  ]) {
    test(`${why} is refused, and nothing is written`, async () => {
      const before = w.everything();
      assert.deepEqual(short(await setCampus(who, A, "jubilee")), expected);
      assert.equal(w.everything(), before);
    });
  }

  test("a view-as session is refused first, and a body that is not a campus before anything is read", async () => {
    const before = w.everything();
    assert.equal((await setCampus("zach", A, "jubilee", { viewAs: true })).status, 403);
    assert.deepEqual(short(await setCampus("nobody", A, "Jubilee")), [400, campusWords.CAMPUS_REFUSAL.notACampus]);
    assert.deepEqual(short(await setCampus("nobody", A, null, { body: [] })), [400, campusWords.CAMPUS_REFUSAL.body]);
    assert.equal(w.everything(), before);
  });

  test("a group that is not the run's, or is archived, is refused", async () => {
    assert.deepEqual(short(await setCampus("zach", OPEN_GROUP, "jubilee")), [404, campusWords.CAMPUS_REFUSAL.noGroup]);
    assert.deepEqual(short(await setCampus("zach", "no-such-group", "jubilee")), [404, campusWords.CAMPUS_REFUSAL.noGroup]);
    world.db.seed(`courseGroups/${A}`, { ...read(`courseGroups/${A}`), archived: true });
    assert.deepEqual(short(await setCampus("zach", A, "jubilee")), [409, campusWords.CAMPUS_REFUSAL.archived]);
    assert.equal(read(`courseGroups/${OPEN_GROUP}`).campus, undefined);
    assert.equal(read(`courseGroups/${A}`).campus, undefined);
  });

  test("the board's columns carry it, for the lead and admins", async () => {
    await setCampus("zach", A, "jubilee");
    const board = await w.join.board("claudia");
    const column = board.body.groups.find((group) => group.id === A);
    assert.equal(column.campus, "jubilee");
    assert.equal(board.body.groups.find((group) => group.id === B).campus, null);
  });
});

// ---------------------------------------------------------------------------
// 8. The application page
// ---------------------------------------------------------------------------

describe("8. the application page points to the answer that keeps the place", () => {
  const page = (view) => textOf(renderToStaticMarkup(createElement(StatusPage, { roundId: ROUND, view, viewingAs: false })));
  const inGroupView = (leave) => ({
    kind: "place",
    label: "Accepted",
    decidedLabel: "Fri 23 Oct",
    via: "ranking",
    programme: { name: "AGI Strategy Fellowship", shortName: "AGI Strategy", facts: "6 WEEKS", shortFacts: "6 WEEKS" },
    next: "",
    comingHelps: "",
    saidComing: false,
    confirm: null,
    inGroup: { runId: RUN.agi, groupName: "Group B", leave },
  });

  test("under what giving the place back means, only where the leave is open to them", () => {
    const open = page(inGroupView("open"));
    assert.match(
      open,
      /Changed your mind\? Giving your place back now means leaving Group B\. You can do that from your programme’s page\. Only the time doesn’t work\? Tell us on your programme’s page instead\. You keep your place\./,
    );
    for (const leave of ["ask-the-team", "ended"]) {
      assert.ok(!page(inGroupView(leave)).includes("Only the time doesn’t work?"), leave);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. They meant some weeks
// ---------------------------------------------------------------------------

describe("10. they meant some weeks: an admin or the programme's lead reads a different time as most weeks", () => {
  /** Amara said she can't make the time, in words that mean one week: what the third answer is for. */
  async function amaraSaidCant() {
    const said = await answer("amara", CANT);
    assert.equal(said.status, 200, JSON.stringify(said.body));
    return seat("amara").timeAnswer.at;
  }

  test("offered: the group's sessions still to come, with the ones they already told us about", async () => {
    await amaraSaidCant();
    // She told the ticket about week 4 herself.
    assert.equal((await ticket("amara", "w04")).status, 200);
    for (const who of ["zach", "claudia"]) {
      const offer = await offerFor(who, "amara");
      assert.equal(offer.status, 200, `${who}: ${JSON.stringify(offer.body)}`);
      assert.deepEqual(offer.body, {
        sessions: [
          { sessionKey: "w04", weekNumber: 4, day: "Thu 19 Nov", excused: true },
          { sessionKey: "w05", weekNumber: 5, day: "Thu 26 Nov", excused: false },
          { sessionKey: "w06", weekNumber: 6, day: "Thu 3 Dec", excused: false },
        ],
      });
      // Nothing of what she wrote: the board already shows it to them.
      assert.ok(!JSON.stringify(offer.body).includes(WHY));
    }
  });

  test("saved: most weeks with her words kept, the sessions recorded as excused when she answered, one audit row, and nobody emailed", async () => {
    const answeredAt = await amaraSaidCant();
    mock.timers.setTime(new Date("2026-11-17T15:00:00Z").getTime());
    const before = w.everything();
    const saved = await someWeeks("claudia", "amara", { sessionKeys: ["w06", "w05"] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body, {
      ok: true,
      answer: { kind: "mostWeeks", reason: WHY, alternatives: WOULD, sessionKeys: ["w05", "w06"] },
      message: words.SOME_WEEKS_SAVED,
    });
    const answerNow = seat("amara").timeAnswer;
    assert.deepEqual({ ...answerNow, at: instant(answerNow.at).toISOString() }, {
      kind: "mostWeeks",
      reason: WHY,
      alternatives: WOULD,
      sessionKeys: ["w05", "w06"],
      forGroupId: A,
      // Still her answer: when she gave it.
      at: instant(answeredAt).toISOString(),
    });
    for (const week of [5, 6]) {
      assert.deepEqual(registerOf(week).records, { amara: "excused" }, `week ${week}`);
      assert.equal(instant(registerOf(week).excusedInAdvance.amara).toISOString(), instant(answeredAt).toISOString(), `week ${week}: dated when she said it`);
    }
    const audit = auditRows();
    assert.equal(audit.length, 1);
    assert.deepEqual({ ...audit[0], at: audit[0].at instanceof Date }, {
      kind: "time-answer-changed",
      runId: RUN.agi,
      groupId: A,
      subjectUid: "amara",
      actorUid: "claudia",
      actorName: audit[0].actorName,
      targetLabel: words.CARD_TITLE,
      detail: "Changed from No, I need a different time to Most weeks, not all, recording them excused for week 5 (Thu 26 Nov) and week 6 (Thu 3 Dec).",
      at: true,
    });
    assert.ok(!JSON.stringify(audit).includes(WHY) && !JSON.stringify(audit).includes(WOULD), "the audit row carries her words");
    // Her seat, the two registers and the audit row: nothing else.
    assert.deepEqual(
      changedSince(before).filter((path) => !path.startsWith("courseAudit/")),
      [enrolmentPath("amara"), `courseAttendance/${RUN.agi}__${A}__w05`, `courseAttendance/${RUN.agi}__${A}__w06`].sort(),
    );
    assert.deepEqual([seat("amara").groupId, seat("amara").status], [A, "active"]);
    assert.deepEqual(world.mail, [], "somebody was emailed");
  });

  test("it adds and never takes away: what she told the ticket stays hers, as she said it, and is listed", async () => {
    const answeredAt = await amaraSaidCant();
    // An hour after answering, she tells the ticket about week 4 herself.
    mock.timers.setTime(new Date("2026-11-17T13:00:00Z").getTime());
    assert.equal((await ticket("amara", "w04")).status, 200);
    const toldAt = instant(registerOf(4).excusedInAdvance.amara).toISOString();
    assert.equal(toldAt, "2026-11-17T13:00:00.000Z");
    mock.timers.setTime(new Date("2026-11-17T15:00:00Z").getTime());
    // Left unchosen, her week 4 is kept and listed.
    const saved = await someWeeks("zach", "amara", { sessionKeys: ["w06"] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.answer.sessionKeys, ["w04", "w06"]);
    assert.deepEqual([toldOn(4), toldOn(5), toldOn(6)], [["amara"], [], ["amara"]]);
    assert.equal(instant(registerOf(4).excusedInAdvance.amara).toISOString(), toldAt, "her own word was rewritten");
    assert.equal(instant(registerOf(6).excusedInAdvance.amara).toISOString(), instant(answeredAt).toISOString());
    // Sent as the screen sends it, ticked: still hers, as she said it.
    await answer("bea", CANT);
    mock.timers.setTime(new Date("2026-11-17T16:00:00Z").getTime());
    assert.equal((await ticket("bea", "w05")).status, 200);
    mock.timers.setTime(new Date("2026-11-17T17:00:00Z").getTime());
    assert.equal((await someWeeks("zach", "bea", { sessionKeys: ["w05", "w06"] })).status, 200);
    assert.equal(instant(registerOf(5).excusedInAdvance.bea).toISOString(), "2026-11-17T16:00:00.000Z", "her own word was rewritten");
    // The audit row names what this recorded, and not what was hers already.
    assert.equal(
      auditRows().find((row) => row.subjectUid === "bea").detail,
      "Changed from No, I need a different time to Most weeks, not all, recording them excused for week 6 (Thu 3 Dec).",
    );
    // Choosing none: most weeks, recording no session.
    await answer("dev", CANT);
    const none = await someWeeks("zach", "dev", { sessionKeys: [] });
    assert.equal(none.status, 200);
    assert.deepEqual(none.body.answer, { kind: "mostWeeks", reason: WHY, alternatives: WOULD, sessionKeys: [] });
    assert.ok(auditRows().some((row) => row.subjectUid === "dev" && row.detail === "Changed from No, I need a different time to Most weeks, not all, recording no session."));
  });

  test("every reader then takes them as somebody who can make the time, and shows the weeks they miss", async () => {
    await amaraSaidCant();
    assert.equal((await someWeeks("zach", "amara", { sessionKeys: ["w05"] })).status, 200);
    for (const who of ["zach", "claudia"]) {
      const { rows } = await boardRows(who);
      assert.deepEqual(rows.amara.timeAnswer, { kind: "mostWeeks", reason: WHY, alternatives: WOULD, sessionKeys: ["w05"] }, who);
    }
    const yusuf = await boardRows("yusuf");
    for (const row of Object.values(yusuf.rows)) assert.equal(row.timeAnswer, null);
    // The board's card: a tick with the week, never the can't's warning.
    const { rows } = await boardRows("zach");
    const board = await w.join.board("zach");
    const columns = board.body.groups;
    const marks = boardParts.marksOf(rows.amara, columns.find((group) => group.id === A), columns, false, true).marks;
    assert.ok(marks.some((mark) => mark.words === "Misses week 5" && mark.tone === "ok"), JSON.stringify(marks));
    assert.ok(!marks.some((mark) => mark.words === words.MARK_CANT_MAKE));
    // A second press finds no can't to change.
    assert.deepEqual(short(await someWeeks("zach", "amara", { sessionKeys: ["w06"] })), [409, words.SOME_WEEKS_REFUSAL.notCant]);
  });

  for (const [who, expected, why] of [
    [null, [401, "Not signed in"], "somebody signed out"],
    ["yusuf", [403, words.SOME_WEEKS_REFUSAL.notStaff], "the run's track lead, who is never sent the answer"],
    ["sofia", [403, words.SOME_WEEKS_REFUSAL.notStaff], "a facilitator of her group"],
    ["amara", [403, words.SOME_WEEKS_REFUSAL.notStaff], "the person herself, whose way is her own card"],
    ["dev", [403, words.SOME_WEEKS_REFUSAL.notStaff], "somebody else in her group"],
    ["lloyd", [403, words.SOME_WEEKS_REFUSAL.notStaff], "the programme's reviewer"],
    ["tess", [403, words.SOME_WEEKS_REFUSAL.notStaff], "the lead of another programme"],
    ["nobody", [403, words.SOME_WEEKS_REFUSAL.notStaff], "a member on nothing"],
  ]) {
    test(`${why} is refused, offered nothing, and nothing is written`, async () => {
      await amaraSaidCant();
      const before = w.everything();
      assert.deepEqual(short(await offerFor(who, "amara")), expected);
      assert.deepEqual(short(await someWeeks(who, "amara", { sessionKeys: ["w05"] })), expected);
      assert.equal(w.everything(), before);
    });
  }

  test("a view-as session is refused first, a body that is not a list before anything is read, and a run that is not there", async () => {
    await amaraSaidCant();
    const before = w.everything();
    assert.equal((await someWeeks("zach", "amara", { sessionKeys: ["w05"] }, { viewAs: true })).status, 403);
    for (const body of [null, [], {}, { sessionKeys: "w05" }, { sessionKeys: ["w5"] }]) {
      assert.deepEqual(short(await someWeeks("nobody", "amara", body)), [400, body === null || Array.isArray(body) ? words.SOME_WEEKS_REFUSAL.body : words.SOME_WEEKS_REFUSAL.sessions], JSON.stringify(body));
    }
    assert.deepEqual(short(await someWeeks("zach", "amara", { sessionKeys: [] }, { runId: "no-such-run" })), [404, words.SOME_WEEKS_REFUSAL.noRun]);
    assert.deepEqual(short(await offerFor("zach", "amara", { runId: "no-such-run" })), [404, words.SOME_WEEKS_REFUSAL.noRun]);
    assert.equal(w.everything(), before);
  });

  test("only a different time about the group they are in, on a seat still taking part", async () => {
    await amaraSaidCant();
    await answer("dev", YES);
    await answer("tariq", MOST("w05"));
    const before = w.everything();
    for (const [uid, expected, why] of [
      ["dev", [409, words.SOME_WEEKS_REFUSAL.notCant], "said yes"],
      ["tariq", [409, words.SOME_WEEKS_REFUSAL.notCant], "said most weeks"],
      ["bea", [409, words.SOME_WEEKS_REFUSAL.notCant], "has not answered"],
      ["sam", [404, words.SOME_WEEKS_REFUSAL.noSeat], "left the run"],
      ["omar", [404, words.SOME_WEEKS_REFUSAL.noSeat], "was taken off the run"],
      ["claudia", [404, words.SOME_WEEKS_REFUSAL.noSeat], "holds no seat"],
    ]) {
      assert.deepEqual(short(await offerFor("zach", uid)), expected, why);
      assert.deepEqual(short(await someWeeks("zach", uid, { sessionKeys: [] })), expected, why);
    }
    // An answer about the group she was moved out of is no answer.
    world.db.poke(enrolmentPath("amara"), { "timeAnswer.forGroupId": B });
    assert.deepEqual(short(await someWeeks("zach", "amara", { sessionKeys: [] })), [409, words.SOME_WEEKS_REFUSAL.notCant]);
    world.db.poke(enrolmentPath("amara"), { "timeAnswer.forGroupId": A });
    assert.equal(w.everything(), before);
  });

  test("a session that can no longer be recorded refuses everything, naming its day", async () => {
    await amaraSaidCant();
    const before = w.everything();
    assert.deepEqual(short(await someWeeks("zach", "amara", { sessionKeys: ["w03", "w05"] })), [
      409,
      words.sessionRefusalWords("Thu 12 Nov", words.SOME_WEEKS_REFUSAL.started),
    ]);
    assert.deepEqual(short(await someWeeks("zach", "amara", { sessionKeys: ["w09"] })), [400, words.SOME_WEEKS_REFUSAL.noSession]);
    assert.equal(w.everything(), before, "a refused press wrote something");
    world.db.seed(`courseAttendance/${RUN.agi}__${A}__w05`, {
      runId: RUN.agi,
      groupId: A,
      weekNumber: 5,
      occurrence: 1,
      records: { amara: "present" },
      held: true,
      pushedAt: null,
    });
    const filled = w.everything();
    assert.deepEqual(short(await someWeeks("zach", "amara", { sessionKeys: ["w05"] })), [
      409,
      words.sessionRefusalWords("Thu 26 Nov", words.SOME_WEEKS_REFUSAL.marked),
    ]);
    assert.equal(w.everything(), filled);
    assert.equal(seat("amara").timeAnswer.kind, "cant");
    assert.equal(auditRows().length, 0, "a refused press wrote an audit row");
  });

  test("the words: no dash, plain, and the audit sentence names sessions and never words", () => {
    const lines = [
      words.CARD_TITLE,
      words.ANSWER_YES,
      words.ANSWER_MOST_WEEKS,
      words.ANSWER_CANT,
      words.KEEP_YOUR_PLACE,
      words.SAID_YES,
      words.SAID_MOST_WEEKS,
      words.SAID_CANT,
      words.MOST_WEEKS_INTRO,
      words.NONE_TO_TICK,
      words.MOST_WEEKS_WHO_READS,
      words.FORM_INTRO,
      words.ODD_WEEK_NOTE,
      words.missingLine(["Thu 26 Nov"]),
      words.missingLine(["Thu 26 Nov", "Thu 3 Dec"]),
      words.sessionOptionWords(3, "Tue 17 Nov"),
      words.emailAskWords(false),
      words.emailAskWords(true),
      words.mostWeeksMark([]),
      words.mostWeeksMark([5]),
      words.mostWeeksMark([5, 3, 5, 6]),
      words.SOME_WEEKS,
      words.SOME_WEEKS_INTRO,
      words.SOME_WEEKS_NONE,
      words.SOME_WEEKS_LOADING,
      words.SOME_WEEKS_DIDNT_LOAD,
      words.ALREADY_EXCUSED,
      words.SOME_WEEKS_SAVED,
      words.someWeeksAuditDetail([]),
      ...Object.values(words.ANSWER_REFUSAL),
      ...Object.values(words.SOME_WEEKS_REFUSAL),
      ...["yes", "mostWeeks", "cant"].map(words.savedWords),
    ];
    for (const line of lines) {
      assert.doesNotMatch(line, /[\u2013\u2014]/, line);
    }
    assert.deepEqual(
      [words.mostWeeksMark([]), words.mostWeeksMark([5]), words.mostWeeksMark([5, 3, 5]), words.mostWeeksMark([6, 3, 5])],
      ["Can make most weeks", "Misses week 5", "Misses weeks 3 and 5", "Misses weeks 3, 5 and 6"],
    );
    assert.equal(words.sessionOptionWords(3, "Tue 17 Nov"), "Week 3, Tue 17 Nov");
    // Nothing a person reads says their place goes, or leads to the leave; nothing says they are marked,
    // graded or scored, or how many sessions they may miss.
    const toThePerson = [
      words.CARD_TITLE,
      words.ANSWER_YES,
      words.ANSWER_MOST_WEEKS,
      words.ANSWER_CANT,
      words.KEEP_YOUR_PLACE,
      words.SAID_YES,
      words.SAID_MOST_WEEKS,
      words.SAID_CANT,
      words.MOST_WEEKS_INTRO,
      words.NONE_TO_TICK,
      words.MOST_WEEKS_WHO_READS,
      words.FORM_INTRO,
      words.ODD_WEEK_NOTE,
      words.missingLine(["Thu 26 Nov"]),
      words.missingLine(["Thu 26 Nov", "Thu 3 Dec"]),
      words.emailAskWords(false),
      words.emailAskWords(true),
      ...Object.values(words.ANSWER_REFUSAL),
      ...["yes", "mostWeeks", "cant"].map(words.savedWords),
    ];
    for (const line of toThePerson) {
      assert.doesNotMatch(line, /give your place back|leave the programme/i, line);
      assert.doesNotMatch(line, /\bmark|\bgrade|\bscore|dropped out/i, line);
      assert.doesNotMatch(line, /\b(?:one|two|three|four|five|\d+) (?:sessions?|weeks?)\b/i, line);
    }
    assert.equal(words.missingLine(["Thu 26 Nov", "Thu 3 Dec"]), "You can’t make Thu 26 Nov or Thu 3 Dec, and whoever runs your sessions knows.");
    // What Most weeks, not all says is shown to an incubator's people too, who are told of no group, and to a
    // group with no facilitator yet: it names neither.
    for (const line of [words.MOST_WEEKS_INTRO, words.NONE_TO_TICK, words.MOST_WEEKS_WHO_READS, words.missingLine(["Thu 26 Nov"]), words.SAID_MOST_WEEKS]) {
      assert.doesNotMatch(line, /group|facilitat/i, line);
    }
  });
});
