/**
 * "Can you make this time?" and a group's campus (Zach, 29 Oct 2026), as
 * every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/runs/[runId]/time-answer                                       the person's own answer
 *   PUT  /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/campus   a group's campus
 *   /learn/[runId] and its run home                                                   the card, and the campus
 *   GET  /api/courses/runs/[runId]/allocation                                         who reads the answer
 *   POST /api/courses/runs/[runId]/allocate, Remove, the facilitators route            a move clears it
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
 *  4. A MOVE RESETS IT: the board's move, un-placing, putting somebody back
 *     after they left, Remove, and an appointment that seats a facilitator
 *     who holds a place each delete it. The tree: every write that clears
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

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__hubTimeAnswer");
const { world, call, routes } = w;
const answerRoute = await w.courseRoute("runs", "[runId]", "time-answer");
const campusRoute = await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "campus");
const facilitatorsRoute = await w.courseRoute("groups", "[groupId]", "facilitators");
const model = await w.loadTs(join("lib", "courses", "timeAnswer", "model.ts"));
const words = await w.loadTs(join("lib", "courses", "timeAnswer", "words.ts"));
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

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  world.db.recursiveDelete = async (ref) => ref.delete();
});

/** The person's answer, from the card. */
const answer = (who, body, options = {}) =>
  call(who, answerRoute.POST, { runId: options.runId ?? RUN.agi }, { body, course: true, viewAs: options.viewAs });

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
});

// ---------------------------------------------------------------------------
// 3. The card on the programme page, and the campus at its head
// ---------------------------------------------------------------------------

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

  test("the card: their group's day and time, the two answers, and that either keeps their place", async () => {
    const { html, text } = await runHome("amara");
    assert.match(
      text,
      /Can you make this time\? Group A meets Thursdays, 6pm to 8pm\. I can make it I can’t make this time Either way, you keep your place\./,
    );
    // Pressable only once the page's script has arrived.
    assert.match(html, /<button[^>]*disabled=""[^>]*><span>I can make it/);
    w.ui.hydrated = true;
    const live = await runHome("amara");
    assert.doesNotMatch(live.html, /<button[^>]*disabled=""[^>]*><span>I can make it/);
    // Locked in a view-as session, hydrated or not.
    const locked = await runHome("amara", { viewAs: true });
    assert.match(locked.html, /<button[^>]*disabled=""[^>]*><span>I can make it/);
    // Nothing on the card leads to the leave.
    const card = /Can you make this time\?.*?Either way, you keep your place\./.exec(live.text)[0];
    assert.doesNotMatch(card, /Leave|give your place back/i);
  });

  test("once answered, the card says what they said, and offers to change it", async () => {
    w.ui.hydrated = true;
    await answer("amara", CANT);
    const cant = await runHome("amara");
    assert.match(
      cant.text,
      new RegExp(
        `Can you make this time\\? Group A meets Thursdays, 6pm to 8pm\\. ${words.SAID_CANT.replace(/[.?]/g, "\\$&")} ` +
          `What you told us Why ${WHY} Would work ${WOULD} Change your answer`,
      ),
    );
    await answer("amara", YES);
    const yes = await runHome("amara");
    assert.match(yes.text, /Group A meets Thursdays, 6pm to 8pm\. You’ve told us you can make it\. Change your answer/);
    assert.ok(!yes.text.includes(WHY));
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
    assert.match(text, /Can you make this time\? You meet Thursdays, 6pm to 8pm\./);
  });
});

// ---------------------------------------------------------------------------
// 4. A move resets it
// ---------------------------------------------------------------------------

describe("4. a move clears the answer about the group they leave", () => {
  test("the board's move, and a placement where they already are", async () => {
    await answer("amara", CANT);
    // Placed where they already are: nothing to do, and the answer stays.
    assert.equal((await w.join.place("zach", [{ uid: "amara", groupId: A }])).status, 200);
    assert.equal(seat("amara").timeAnswer.kind, "cant");
    // Moved: the answer goes, with Publish's stamp.
    const moved = await w.join.place("zach", [{ uid: "amara", groupId: B }]);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual([seat("amara").groupId, seat("amara").timeAnswer, seat("amara").allocatedEmailAt], [B, undefined, undefined]);
  });

  test("taking somebody out of groups", async () => {
    await answer("dev", { ...CANT });
    assert.equal((await w.join.place("zach", [{ uid: "dev", groupId: null }])).status, 200);
    assert.deepEqual([seat("dev").groupId, seat("dev").timeAnswer], [null, undefined]);
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
    // Tariq was taken out of groups after answering about Group A: the
    // answer would be stale anyway, and the appointment deletes it.
    world.db.seed(enrolmentPath("tariq"), {
      ...seat("tariq"),
      groupId: null,
      timeAnswer: { kind: "cant", reason: WHY, alternatives: WOULD, forGroupId: A, at: NOW },
    });
    const appointed = await call("zach", facilitatorsRoute.POST, { groupId: B }, {
      body: { uids: ["rahul", "sofia", "tariq"] },
      course: true,
    });
    assert.equal(appointed.status, 200, JSON.stringify(appointed.body));
    assert.deepEqual([seat("tariq").groupId, seat("tariq").timeAnswer], [B, undefined]);
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
    ]) {
      assert.equal(of(broken), undefined, JSON.stringify(broken));
    }
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
    const expected = { kind: "cant", reason: WHY, alternatives: WOULD };
    for (const who of ["zach", "claudia"]) {
      const { status, rows } = await boardRows(who);
      assert.equal(status, 200, who);
      assert.deepEqual(rows.amara.timeAnswer, expected, who);
      assert.deepEqual(rows.chloe.timeAnswer, expected, who);
      assert.deepEqual(rows.dev.timeAnswer, { kind: "yes", reason: null, alternatives: null }, who);
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
    ["lib/courses/timeAnswer/seat.ts", "the one writer, on the caller's own seat, and the person's own card"],
    ["app/api/courses/runs/[runId]/time-answer/route.ts", "the person's own answer, answered back to them"],
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
