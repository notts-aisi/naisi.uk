/**
 * The week's written answer, its review and the feedback on it
 * (the week page, the review page, the facilitator's group page,
 * the programme page and the finished Overview; a facilitator's
 * own answer is the lead's and admins' to read and give feedback on), since
 * the week stays open (`src/lib/courses/weekWork/`): the answer has its own
 * Send (and the week's old Submit still sends it, for a page open since
 * before), nothing closes at a send or at the session, only the programme's
 * close, opening an answer locks nothing, and its readers read it, and give
 * feedback on it, only once it is sent (as last sent) or the session it is
 * due at has started (privacy v17). Feedback is a signed comment
 * (`src/lib/courses/feedback/`, `tests/course-feedback.test.mjs`): saved to
 * the person's week page and emailed only in an admin's batch.
 *
 * Driven through the real routes and the real pages, as every kind of
 * caller: Chloe, a fellow of Group B; Farah, another fellow of Group B;
 * Kofi, a third; Amara, a fellow of Group A; Rahul, Group B's facilitator,
 * who writes an answer of their own too; Sofia, the other facilitator (and
 * Group A's); Claudia, the programme's lead; Tess, who leads another
 * programme; Zach, an admin; Una, placed and not told; Sam, who left; Omar,
 * taken off; a view-as session; and somebody signed out.
 *
 * THE WEEKS' CLOCK: week 2's session is when each group meets for it. Group
 * A met on Thu 5 Nov at 6pm, Group B on Tue 10 Nov at 6pm, Group C on Wed 11
 * Nov at 1pm, so the world's own clock (Tue 17 Nov, noon) finds every week 2
 * session started, and a suite writes week 2 at an earlier moment. Group B's
 * week 2 was due by noon on Mon 9 Nov. Group B's week 3 session is tonight.
 * The programme closes at the end of Wed 23 Dec.
 *
 *  1. Writing, and sending: who may write, their own answer only; the
 *     first-sent time stored once; a change after a send stamped and the
 *     words as sent kept; the range's top a limit; the labelled boxes sent
 *     together; the programme's close the one lock.
 *  2. The gate: who may give feedback, and press the old Reopen (which writes
 *     nothing); opening locks nothing; feedback only on an answer its
 *     readers may read.
 *  3. Feedback: a signed comment, never a level or a mark, many pieces,
 *     emailing nobody when saved. Late from the session, and after its
 *     deadline, for staff alone.
 *  4. The pages: the week page (open, sent, past its session, closed), the
 *     review page's addresses (the group's and the lead's) forwarding to the
 *     reading view of one person's week and the page of one question across
 *     the group, which show what it showed, the review page's loader (kept
 *     for This week's work), the week's Feedback, the group page's Feedback
 *     to write, Home, the programme page's task row.
 *  5. The summer's answers still read, and are never given a verdict here.
 *  6. Finishing's column, the rubric's setting, the email's words and class.
 *
 * The answer's own Send, the old Submit, the old Reopen and the earlier
 * versions have their own suite in `tests/course-week-work.test.mjs`.
 *
 * Every word in the weeks and the rubric is made up; every address is on
 * example.com.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, AGI, B, C, COURSE, NOW, ONE_BOX, ROUND, RUBRIC, RUN, makeWrittenAnswersWorld } from "./lib/writtenAnswersWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWrittenAnswersWorld();
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const { closedWords } = await w.loadTs("lib/courses/weekWork/words.ts");

beforeEach(() => {
  w.reset();
});

/** A sentence of `n` words. */
const words = (n, word = "lamp") => Array.from({ length: n }, () => word).join(" ");

/** Each phrase appears, and in this order. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    assert.ok(at >= 0, `missing, or out of order: "${phrase}" in ${text.slice(from, from + 300)}`);
    from = at + phrase.length;
  }
}

const stored = (uid, n) => w.world.db.read(w.rowPath(uid, n));
const iso = (when) => new Date(when).toISOString();

/** `who` saves a piece of feedback on `uid`'s written answer to week `n`, as the review page does. */
const feedback = (who, uid, n, text = "x", options) => w.give(who, uid, n, text, options);
/** The pieces of feedback on `uid`'s week `n`, oldest saved first. */
const piecesOn = (uid, n) => w.pieces().filter((piece) => piece.uid === uid && piece.weekNumber === n);

/** Wed 4 Nov at 10am: before Group A meets for week 2 (Thu 5 Nov, 6pm), the first of the week 2 sessions here. */
const BEFORE_A_MEETS = "2026-11-04T10:00:00Z";
/** Before Group B's week 2 due moment (noon, Mon 9 Nov): Sun 8 Nov at 10am. */
const BEFORE_DUE_2 = "2026-11-08T10:00:00Z";
/** After Group B's week 2 due moment, before its session: Tue 10 Nov at noon. */
const LATE_2 = "2026-11-10T12:00:00Z";
/** Group B's week 2 session starts, and its week 2 locks: Tue 10 Nov at 6pm. */
const B_MEETS_2 = "2026-11-10T18:00:00Z";

// ---------------------------------------------------------------------------
// 1. Writing, and sending by submitting the week
// ---------------------------------------------------------------------------

describe("1. writing one's own answer, and sending it", () => {
  test("a fellow saves a draft as they type, then submits the week: the first-sent time is stored once and never moves", async () => {
    w.at(BEFORE_DUE_2);
    const draft = await w.write("chloe", 2, { text: words(25) });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal(stored("chloe", 2).words, 25);
    assert.equal(stored("chloe", 2).firstSentAt, undefined);
    assert.equal(stored("chloe", 2).submittedAt, null);
    assert.equal(draft.body.response.written.firstSentAt, null);

    const sent = await w.write("chloe", 2, { text: words(26) }, { send: true });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    // Submit's own answer names the answer it sent, and when.
    assert.deepEqual(sent.body.sent, [{ id: ONE_BOX.id, at: iso(BEFORE_DUE_2) }]);
    assert.equal(iso(stored("chloe", 2).firstSentAt), iso(BEFORE_DUE_2));
    assert.equal(iso(stored("chloe", 2).submittedAt), iso(BEFORE_DUE_2));
    assert.equal(stored("chloe", 2).words, 26);
    // Its readers see it on their pages: nobody is emailed.
    assert.equal(w.world.mail.length, 0);

    // Submitted, the week still takes a change (it stays open until the programme closes): the
    // change stores its own time, the words as sent are kept, and the first-sent time stays.
    w.at("2026-11-08T11:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: words(27) })).status, 200);
    assert.equal(iso(stored("chloe", 2).firstSentAt), iso(BEFORE_DUE_2));
    assert.equal(iso(stored("chloe", 2).editedAt), "2026-11-08T11:00:00.000Z");
    assert.equal(stored("chloe", 2).words, 27);
    assert.deepEqual(stored("chloe", 2).earlierVersions.map((version) => [version.words, version.reasons]), [[26, ["sent"]]]);
    // The old Reopen writes nothing: the answer is as it was.
    assert.equal((await w.reopenWeek("rahul", "chloe", 2)).status, 200);
    assert.equal(stored("chloe", 2).words, 27);
    // Submitting again sends the change, and moves nothing about when it was first sent.
    w.at("2026-11-08T12:00:00Z");
    const again = await w.submitWeek("chloe", 2);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual(again.body.sent, [{ id: ONE_BOX.id, at: "2026-11-08T12:00:00.000Z" }]);
    assert.equal(iso(stored("chloe", 2).sentAt), "2026-11-08T12:00:00.000Z");
    assert.equal(iso(stored("chloe", 2).firstSentAt), iso(BEFORE_DUE_2));
    assert.equal(iso(stored("chloe", 2).submittedAt), iso(BEFORE_DUE_2));
    // The week keeps when it was first submitted, when last, and how many times.
    const week = w.weekWorkOf("chloe", 2);
    assert.equal(iso(week.firstSubmittedAt), iso(BEFORE_DUE_2));
    assert.equal(iso(week.submittedAt), "2026-11-08T12:00:00.000Z");
    assert.equal(week.submitCount, 2);
    // Words are stored, never a count of characters, and summer's fields keep their meaning.
    assert.equal(stored("chloe", 2).reviewStatus, "unreviewed");
    assert.equal(stored("chloe", 2).kind, undefined);
  });

  test("the top of the range is a limit for what is submitted and for every change after; the bottom is not", async () => {
    w.at(BEFORE_DUE_2);
    // A draft may run over while it is written; Submit names it and stops, with nothing stamped.
    assert.equal((await w.write("chloe", 2, { text: words(45) })).status, 200);
    const over = await w.submitWeek("chloe", 2);
    assert.deepEqual([over.status, over.body.error], [409, "Your written answer is 45 words. The limit is 40."]);
    assert.equal(stored("chloe", 2).firstSentAt, undefined);
    assert.equal(w.weekWorkOf("chloe", 2), undefined);
    // Under the bottom is sent: "a sharp 200 words beats a padded 400".
    assert.equal((await w.write("chloe", 2, { text: words(5) }, { send: true })).status, 200);
    assert.equal(iso(stored("chloe", 2).firstSentAt), iso(BEFORE_DUE_2));
    // Once sent, every change after it is held to the top.
    const after = await w.write("chloe", 2, { text: words(41) });
    assert.equal(after.status, 400);
    assert.equal(after.body.error, "That’s 41 words, over the limit of 40, so this change isn’t saved. Cut it to 40 or fewer.");
    assert.equal(stored("chloe", 2).words, 5);
    // Nothing written is nothing sent: an empty week is submitted as it is, and no answer is stored.
    const empty = await w.write("farah", 2, { text: "  " }, { send: true });
    assert.equal(empty.status, 200, JSON.stringify(empty.body));
    assert.deepEqual(empty.body.sent, []);
    assert.equal(stored("farah", 2), undefined);
    // A sent answer cannot be emptied.
    assert.equal((await w.write("chloe", 2, { text: "" })).body.error, "A sent answer can’t be empty. Write it again, or leave it as it was.");
    assert.equal(stored("chloe", 2).words, 5);
  });

  test("an answer in labelled boxes is written box by box and sent together when the week is submitted; the wrong shape is refused", async () => {
    const boxes = { "wb-what": words(6), "wb-who": "Ada", "wb-next": words(3) };
    const sent = await w.write("chloe", 3, { boxes }, { send: true });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sent.body.sent.map((entry) => entry.id), ["wa-three"]);
    assert.deepEqual(stored("chloe", 3).boxes, boxes);
    assert.equal(stored("chloe", 3).words, 10);
    assert.equal(stored("chloe", 3).text, undefined);
    assert.equal(iso(stored("chloe", 3).firstSentAt), iso(NOW));
    assert.equal((await w.write("farah", 3, { text: "One box." })).body.error, "This answer is written in its boxes: send each box.");
    assert.equal((await w.write("farah", 3, { boxes: { "wb-gone": "x" } })).body.error, "One of those boxes isn’t on this answer any more. Reload the page.");
    assert.equal((await w.write("farah", 2, { boxes: { "wb-what": "x" } })).body.error, "This answer is one box: send it as text.");
  });

  test("who may write: their own answer, while taking part and while the week takes work; a facilitator writes their own; everybody else is refused", async () => {
    // Before any group has met for week 2: Amara's week and Sofia's (who facilitates Group A too) still take work.
    w.at(BEFORE_A_MEETS);
    for (const [who, status] of [
      ["chloe", 200],
      ["farah", 200],
      ["amara", 200],
      ["rahul", 200],
      ["sofia", 200],
      ["claudia", 403],
      ["tess", 403],
      ["zach", 403],
      ["una", 403],
      ["sam", 403],
      ["omar", 403],
      ["nobody", 403],
      [null, 401],
    ]) {
      const answer = await w.write(who, 2, { text: words(3) });
      assert.equal(answer.status, status, `${who}: ${JSON.stringify(answer.body)}`);
    }
    // Each wrote their own row and nobody else's.
    for (const uid of ["chloe", "farah", "amara", "rahul", "sofia"]) assert.equal(stored(uid, 2).uid, uid);
    for (const uid of ["claudia", "tess", "zach", "una", "sam", "omar"]) assert.equal(stored(uid, 2), undefined);
    // A view-as session writes nothing, refused before anything else.
    const before = w.everything();
    assert.deepEqual(await w.write("chloe", 2, { text: words(4) }, { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(w.everything(), before);
    // Once Group A has met, Amara's own week still takes a change (late, never refused), and so does Sofia's,
    // whose session is the first of her groups': each keeps the words as they stood at it.
    w.at(BEFORE_DUE_2);
    for (const who of ["amara", "sofia"]) {
      assert.equal((await w.write(who, 2, { text: words(5) })).status, 200, who);
      assert.equal(stored(who, 2).words, 5, who);
      assert.deepEqual(stored(who, 2).earlierVersions.map((version) => [version.words, version.reasons]), [[3, ["session"]]], who);
    }
    assert.equal((await w.write("chloe", 2, { text: words(5) })).status, 200, "Group B has not met yet");
    assert.equal(stored("chloe", 2).earlierVersions, undefined, "before the session: nothing kept");
    // Once the programme closes (the end of Wed 23 Dec), nobody's week takes a change.
    w.at("2026-12-24T00:00:00Z");
    for (const who of ["chloe", "amara", "sofia", "rahul"]) {
      const closed = await w.write(who, 2, { text: words(6) });
      assert.deepEqual([closed.status, closed.body.error], [409, closedWords(new Date("2026-12-24T00:00:00Z"))], who);
    }
  });

  test("a body is checked before anything is read, and an answer that is not on the week is refused", async () => {
    assert.equal((await w.write("chloe", 2, {})).status, 400);
    assert.equal((await w.write("chloe", 2, { text: 7 })).status, 400);
    assert.equal((await w.write("chloe", 2, { text: "x", boxes: {} })).status, 400);
    assert.equal((await w.write("chloe", 2, { text: "x" }, { answerId: "wa-nope" })).status, 404);
    assert.equal((await w.write("chloe", 1, { text: "x" }, { answerId: "x1" })).status, 404, "a week written before blocks has no written answer here");
    assert.equal((await w.write("chloe", 2, { text: "x".repeat(40_001) })).status, 400);
  });
});

// ---------------------------------------------------------------------------
// 2. Who gives feedback and reopens, and the week's lock: the one gate
// ---------------------------------------------------------------------------

/**
 * Four answers sent by submitting their weeks, each before its group met:
 * Amara in Group A, Chloe on time, Rahul as a facilitator, Farah after its
 * deadline. The clock is then the world's own, when every one of those
 * sessions has started (and nothing is shut: the week stays open).
 */
async function sendFour() {
  w.at(BEFORE_A_MEETS);
  assert.equal((await w.write("amara", 2, { text: words(21) }, { send: true })).status, 200);
  w.at(BEFORE_DUE_2);
  assert.equal((await w.write("chloe", 2, { text: words(25) }, { send: true })).status, 200);
  assert.equal((await w.write("rahul", 2, { text: words(22) }, { send: true })).status, 200);
  w.at(LATE_2);
  assert.equal((await w.write("farah", 2, { text: words(30) }, { send: true })).status, 200);
  w.at(NOW);
}

describe("2. the gate: who gives feedback, who presses the old Reopen, and the week that stays open", () => {
  test("opening an answer locks nothing, no route opens or reopens an answer, and nothing locks at a send or the session: only the programme's close", async () => {
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("chloe", 2, { text: words(25) }, { send: true })).status, 200);
    assert.equal((await w.write("kofi", 2, { text: words(3) })).status, 200);
    // The review route, with its opening stamp and its Reopen for edits, is gone; the feedback route
    // saves a comment and nothing else, so a body asking to open or reopen is refused before anything is read.
    assert.equal(existsSync(join(SRC, "app", "api", "courses", "runs", "[runId]", "written-answers", "[answerId]", "review", "route.ts")), false);
    const before = w.everything();
    for (const action of ["open", "reopen"]) {
      const asked = await w.call("rahul", w.routes.feedback.POST, { runId: RUN.agi }, { course: true, body: { uid: "chloe", weekId: "w02", action } });
      assert.equal(asked.status, 400, action);
    }
    assert.equal(w.everything(), before, "nothing is stamped");
    // Submitted, Chloe's week still takes a change, keeping the words as sent.
    w.at("2026-11-08T11:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: words(26) })).status, 200);
    assert.equal(stored("chloe", 2).words, 26);
    assert.deepEqual(stored("chloe", 2).earlierVersions.map((version) => [version.words, version.reasons]), [[25, ["sent"]]]);
    // Kofi's draft saves before the session and after it, keeping the words as they stood at the session.
    assert.equal((await w.write("kofi", 2, { text: words(4) })).status, 200);
    w.at(B_MEETS_2);
    assert.equal((await w.write("kofi", 2, { text: words(5) })).status, 200);
    assert.equal(stored("kofi", 2).words, 5);
    assert.deepEqual(stored("kofi", 2).earlierVersions.map((version) => [version.words, version.reasons]), [[4, ["session"]]]);
    // The programme's close is the one lock.
    w.at("2026-12-24T00:00:00Z");
    assert.equal((await w.write("kofi", 2, { text: words(6) })).status, 409);
    assert.equal(stored("kofi", 2).words, 5);
  });

  test("an answer opened by a reviewer before weeks were submitted locks nothing any more: a change saves, keeping the words as sent", async () => {
    w.at(BEFORE_DUE_2);
    w.world.db.seed(w.rowPath("farah", 2), {
      runId: RUN.agi,
      uid: "farah",
      weekId: "w02",
      weekNumber: 2,
      exerciseId: ONE_BOX.id,
      responseType: "text",
      text: words(22),
      words: 22,
      firstSentAt: new Date("2026-11-06T10:00:00Z"),
      submittedAt: new Date("2026-11-06T10:00:00Z"),
      openedAt: new Date("2026-11-07T09:58:00Z"),
      openedByUid: "rahul",
      reviewStatus: "unreviewed",
      updatedAt: new Date("2026-11-06T10:00:00Z"),
    });
    // Sent before weeks were submitted, it is its readers' to read while the week is open, and takes feedback.
    assert.equal((await feedback("sofia", "farah", 2, "Read.")).status, 200);
    // Opened, it still takes a change; the words as sent (and as read) are kept with it.
    w.at("2026-11-08T11:00:00Z");
    const changed = await w.write("farah", 2, { text: words(23) });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(stored("farah", 2).words, 23);
    assert.deepEqual(stored("farah", 2).earlierVersions.map((version) => [version.words, version.reasons.sort()]), [[22, ["reviewed", "sent"]]]);
    // Before the session, its readers go on reading it as sent.
    const piece = piecesOn("farah", 2)[0];
    assert.equal(iso(piece.aboutSavedAt), "2026-11-06T10:00:00.000Z");
  });

  test("feedback locks nothing either: the lead and admins give it on a submitted answer, and the week's own state decides what its writer may change", async () => {
    await sendFour();
    const row = JSON.stringify(stored("farah", 2));
    const sent = await feedback("claudia", "farah", 2, "Good.");
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    // Feedback writes nothing to the answer's own row: no lock, no stamp, and its last save stays its writer's.
    assert.equal(JSON.stringify(stored("farah", 2)), row);
    assert.equal(stored("farah", 2).openedAt, undefined);
    assert.equal(stored("farah", 2).openedByUid, undefined);
    assert.equal(iso(stored("farah", 2).updatedAt), iso(LATE_2));
    // Farah's week still takes a change: the words the feedback was on are kept with it.
    assert.equal((await w.write("farah", 2, { text: words(31) })).status, 200);
    assert.deepEqual(stored("farah", 2).earlierVersions.map((version) => [version.words, version.reasons.sort()]), [[30, ["reviewed", "session"]]]);
    // An admin may give feedback too, on another answer.
    assert.equal((await feedback("zach", "chloe", 2, "From an admin.")).status, 200);
    assert.equal(piecesOn("chloe", 2)[0].byUid, "zach");
  });

  test("a facilitator's own answer is the lead's and admins' to give feedback on and reopen: never a co-facilitator's, never their own", async () => {
    await sendFour();
    const before = w.everything();
    for (const who of ["rahul", "sofia"]) {
      assert.deepEqual(await feedback(who, "rahul", 2), { status: 403, body: { error: "Forbidden" } }, who);
      assert.deepEqual(await w.reopenWeek(who, "rahul", 2), { status: 403, body: { error: "Forbidden" } }, who);
    }
    assert.equal(w.everything(), before);
    // An admin gives the feedback; the lead may press the old Reopen, which writes nothing; Rahul's week takes a change all along.
    assert.equal((await feedback("zach", "rahul", 2, "Strong reasons.")).status, 200);
    assert.equal((await w.reopenWeek("claudia", "rahul", 2)).status, 200);
    assert.equal(w.weekWorkOf("rahul", 2).reopenedAt, undefined, "nothing reopened");
    assert.equal((await w.write("rahul", 2, { text: words(23) })).status, 200);
    assert.deepEqual(piecesOn("rahul", 2).map((piece) => [piece.byUid, piece.byRole]), [["zach", "admin"]], "the feedback stays");
  });

  test("nobody gives feedback on, or reopens, their own: not the lead who also facilitates a group, not an admin", async () => {
    // Claudia leads the programme and facilitates Group C too, so Claudia writes an answer too.
    const groupC = w.world.db.read(`courseGroups/${C}`);
    w.world.db.poke(`courseGroups/${C}`, { facilitatorUids: [...groupC.facilitatorUids, "claudia"] });
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("claudia", 2, { text: words(22) }, { send: true })).status, 200);
    w.at(NOW);
    const before = w.everything();
    assert.deepEqual(await feedback("claudia", "claudia", 2, "Mine."), { status: 403, body: { error: "Forbidden" } });
    assert.deepEqual(await w.reopenWeek("claudia", "claudia", 2), { status: 403, body: { error: "Forbidden" } });
    assert.equal(w.everything(), before);
    // Tom, Group C's other facilitator, may not either; an admin may.
    assert.equal((await feedback("tom", "claudia", 2)).status, 403);
    assert.equal((await w.reopenWeek("tom", "claudia", 2)).status, 403);
    assert.equal(w.everything(), before);
    assert.equal((await feedback("zach", "claudia", 2)).status, 200);
    assert.equal(piecesOn("claudia", 2)[0].byUid, "zach");
    assert.equal((await w.reopenWeek("zach", "claudia", 2)).status, 200);
    assert.equal(w.weekWorkOf("claudia", 2).reopenedByUid, undefined, "the old Reopen records nothing now");
  });

  test("everybody else is refused with the same answer before any answer is read, and writes nothing", async () => {
    await sendFour();
    const before = w.everything();
    for (const [who, uid] of [
      ["farah", "chloe"],
      ["amara", "chloe"],
      ["kofi", "chloe"],
      ["tess", "chloe"],
      ["lloyd", "chloe"],
      ["yusuf", "chloe"],
      ["una", "chloe"],
      ["sam", "chloe"],
      ["omar", "chloe"],
      ["nobody", "chloe"],
      ["rahul", "amara"],
      ["chloe", "chloe"],
      ["rahul", "no-such-person"],
      ["rahul", "una"],
      ["rahul", "sam"],
    ]) {
      assert.deepEqual(await feedback(who, uid, 2), { status: 403, body: { error: "Forbidden" } }, `${who} on ${uid}`);
      assert.deepEqual(await w.reopenWeek(who, uid, 2), { status: 403, body: { error: "Forbidden" } }, `${who} reopening ${uid}'s week`);
    }
    assert.equal(w.everything(), before);
    assert.equal((await feedback(null, "chloe", 2)).status, 401);
    assert.equal((await w.reopenWeek(null, "chloe", 2)).status, 401);
    assert.deepEqual(await feedback("rahul", "chloe", 2, "x", { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.deepEqual(await w.reopenWeek("rahul", "chloe", 2, { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(w.everything(), before, "a view-as session stamps nothing");
    // Sofia facilitates Group A too, so Amara's is Sofia's to give feedback on.
    assert.equal((await feedback("sofia", "amara", 2)).status, 200);
    assert.equal(piecesOn("amara", 2)[0].byUid, "sofia");
  });

  test("an answer its readers may not read yet takes no feedback: a draft before the session; the session opens it to them; the old Reopen changes nothing", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(3) });
    await w.write("chloe", 2, { text: words(25) }, { send: true });
    const draft = await feedback("rahul", "kofi", 2);
    assert.deepEqual([draft.status, draft.body.error], [409, "Nothing of that week can be read yet: nothing is sent, and the session hasn’t started, so there’s nothing to give feedback on."]);
    assert.deepEqual(piecesOn("kofi", 2), []);
    // A body is checked before anything is read: no words, nobody, no week.
    assert.equal((await w.call("rahul", w.routes.feedback.POST, { runId: RUN.agi }, { course: true, body: { action: "wave" } })).status, 400);
    assert.equal((await feedback("rahul", "", 2)).status, 400);
    const noWeek = await w.call("rahul", w.routes.feedback.POST, { runId: RUN.agi }, { course: true, body: { uid: "chloe", on: "writtenAnswer", itemId: ONE_BOX.id, text: "x" } });
    assert.equal(noWeek.status, 400);
    // Group B's session has started with Kofi's draft unsent: his readers may now read it, and give feedback on it.
    w.at(NOW);
    assert.equal((await feedback("rahul", "kofi", 2, "On the draft.")).status, 200);
    assert.equal(piecesOn("kofi", 2)[0].text, "On the draft.");
    // The old Reopen changes nothing: Chloe's answer, sent, stays readable, and takes feedback.
    assert.equal((await w.reopenWeek("rahul", "chloe", 2)).status, 200);
    assert.equal((await feedback("rahul", "chloe", 2)).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. Feedback, by the rubric, once, and one email
// ---------------------------------------------------------------------------

describe("3. feedback: a signed comment, never a level or a mark, many pieces, and no email when saved", () => {
  test("feedback stores the comment, who wrote it, as what and when; nobody is emailed; a second piece from somebody else is kept beside it", async () => {
    await sendFour();
    w.at("2026-11-17T10:05:00Z");
    const sent = await feedback("rahul", "chloe", 2, "Clear steps. Say why.");
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const [given] = piecesOn("chloe", 2);
    assert.equal(given.text, "Clear steps. Say why.");
    assert.equal(given.byUid, "rahul");
    assert.equal(given.byRole, "facilitator");
    assert.equal(iso(given.createdAt), "2026-11-17T10:05:00.000Z");
    // Never a level, a mark, a score or a total, on the piece or on the answer's row; and no lock stamped with it.
    assert.doesNotMatch(JSON.stringify(given), /"(?:levels|level|score|mark|marks|total|points)"/);
    assert.doesNotMatch(JSON.stringify(stored("chloe", 2)), /"(?:score|mark|marks|total|points|feedback)"/);
    assert.equal(stored("chloe", 2).openedAt, undefined);
    // Saving emails nobody: the email that says it is there goes in an admin's batch (tests/course-feedback.test.mjs).
    assert.equal(w.world.mail.length, 0);
    // Many pieces: a second, from Sofia, is kept beside the first, and still nobody is emailed.
    const again = await feedback("sofia", "chloe", 2, "More.");
    assert.equal(again.status, 200);
    assert.deepEqual(piecesOn("chloe", 2).map((piece) => [piece.byUid, piece.text]).sort(), [["rahul", "Clear steps. Say why."], ["sofia", "More."]]);
    assert.equal(w.world.mail.length, 0);
  });

  test("levels sent with the words are never stored, and a comment over its cap is refused, storing nothing", async () => {
    await sendFour();
    const withLevels = await feedback("rahul", "chloe", 2, "x", { extra: { levels: w.levels().slice(0, 3) } });
    assert.equal(withLevels.status, 200);
    assert.equal("levels" in piecesOn("chloe", 2)[0], false);
    const long = await feedback("rahul", "farah", 2, words(301));
    assert.equal(long.status, 400);
    assert.deepEqual(piecesOn("farah", 2), []);
    assert.equal(w.world.mail.length, 0);
  });

  test("with a rubric or without, feedback is a comment alone: the reading view of the person's week asks for one, and the week page names no rows and no marks", async () => {
    await sendFour();
    for (const rubric of [RUBRIC, null]) {
      w.world.db.poke(`courses/${COURSE.agi}`, { rubric });
      const page = await w.readingPage("rahul", "farah", { week: "2" });
      assert.match(page.text, /Your feedback Optional: write it when there’s time, when it’s needed, or when they’ve asked a question\. It’s signed with your name\. Comment/);
      assert.doesNotMatch(page.text, /The rubric|There are no marks|No marks|sees the four levels/);
      assert.doesNotMatch(page.html, /aria-pressed/);
      // Kofi's week, while it is still open.
      w.at(BEFORE_DUE_2);
      const week = await w.weekPage("kofi", 2);
      assert.match(week.text, /Rahul and Sofia read it before your session and may give feedback on it\./);
      assert.doesNotMatch(week.text, /No marks|four things|a clear view, reasons/);
      w.at(NOW);
    }
    // The person reads the comment alone, on their week page.
    assert.equal((await feedback("rahul", "chloe", 2, "A comment alone.")).status, 200);
    const chloe = await w.weekPage("chloe", 2);
    assert.match(chloe.text, /Feedback from Rahul Your facilitator · Tue 17 Nov A comment alone\./);
    assert.doesNotMatch(chloe.text, /There are no marks/);
  });

  test("an email that does not go undoes nothing: the feedback stays on the person's page, and is owed to the next press", async () => {
    await sendFour();
    assert.equal((await feedback("rahul", "chloe", 2, "Kept.")).status, 200);
    assert.equal((await w.sendTest("zach")).status, 200);
    w.world.mailFate = () => "fail";
    const [piece] = piecesOn("chloe", 2);
    const sent = await w.send("zach", { ids: [piece.id], pieces: 1, people: 1 });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.report.failed.length, 1);
    assert.equal(piecesOn("chloe", 2)[0].text, "Kept.");
    assert.equal(piecesOn("chloe", 2)[0].emailedAt, null);
    assert.match((await w.weekPage("chloe", 2)).text, /Feedback from Rahul Your facilitator · Tue 17 Nov Kept\./);
  });
});

// ---------------------------------------------------------------------------
// Late: shown to the answer's readers, from the group's own due moment
// ---------------------------------------------------------------------------

describe("Late, from the session, and only for its readers; after its deadline, for staff alone", () => {
  test("first sent after its own deadline but before the session is after its deadline; after the session, late; a cancelled session keeps its own moment", async () => {
    await sendFour();
    // The written answer's own deadline and its session, as the review page's loader (kept for This week's work) works them out.
    const model = await w.reviewModel("rahul", 2);
    // And as the page of one question across the group says them, at the written answer.
    const page = await w.questionPage("rahul", { week: "2", first: "answer" });
    const everybody = [...model.toGive, ...model.feedbackSent];
    const of = (key) => Object.fromEntries(everybody.map((person) => [person.uid, person[key]]));
    // Farah sent at noon on the day of the session, after the noon-the-day-before deadline: after its deadline, not late.
    assert.deepEqual(of("afterDeadline"), { chloe: false, farah: true });
    assert.deepEqual(of("late"), { chloe: false, farah: false });
    assert.deepEqual(of("sentLateMs"), { chloe: null, farah: null });
    assert.match(page.text, /Farah Hussain Sent Tue 10 Nov, 12pm After its deadline/);
    assert.doesNotMatch(page.text, /Farah Hussain Sent Tue 10 Nov, 12pm Late/, "before the session is never late");
    assert.deepEqual(w.questionViewOf(page).rows.map((row) => [row.uid, row.afterDeadline, row.late]), [["chloe", false, false], ["farah", true, false], ["kofi", false, false]]);
    // The reading view of Farah's week says the same beside when it was sent.
    assert.match((await w.readingPage("rahul", "farah", { week: "2" })).text, /Sent Tue 10 Nov, 12pm After its deadline/);

    // Group B's week 2 session cancelled, the group keeping pace: late is told from when it would have started.
    w.reset();
    const group = w.world.db.read(`courseGroups/${B}`);
    w.world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { ...(group.sessionChanges ?? {}), w02: { kind: "cancelled", reason: "Room closed.", dateKey: "2026-11-10", byUid: "rahul", at: new Date("2026-11-05T09:00:00Z") } },
    });
    // The cancelled evening closed nothing: Kofi sends the next morning, and Farah the next Monday.
    w.at("2026-11-11T09:00:00Z");
    assert.equal((await w.write("kofi", 2, { text: words(25) }, { send: true })).status, 200);
    w.at("2026-11-16T12:30:00Z");
    assert.equal((await w.write("farah", 2, { text: words(25) }, { send: true })).status, 200);
    w.at(NOW);
    const moved = await w.reviewModel("rahul", 2);
    assert.deepEqual(
      Object.fromEntries(moved.toGive.map((person) => [person.uid, [person.late, person.sentLateMs, person.afterDeadline]])),
      { kofi: [true, 15 * 60 * 60 * 1000, false], farah: [true, (5 * 24 + 18.5) * 60 * 60 * 1000, false] },
      "late from when the cancelled session would have started, Tue 10 Nov at 6pm",
    );
    // And nothing closes at the group's next session: Chloe, who wrote nothing, can still start.
    w.at("2026-11-17T18:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: words(25) })).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 4. The pages
// ---------------------------------------------------------------------------

describe("4. the pages, as the boards draw them", () => {
  test("the week page draws the written answer for a fellow: the question, the box, the count, the due line, who reads it and from when, and its own Send once there is something to send", async () => {
    w.at(BEFORE_DUE_2);
    const page = await w.weekPage("chloe", 2);
    inOrder(page.text, [
      "Who keeps the lamps",
      "Your session: Tue 10 Nov, 6pm, Hallward B12. Your work stays open after it: anything you add or change after it shows as late to the people who read your work, with how late. This week stays open until the programme closes, at the end of Wed 23 Dec.",
      "0 of 2 done",
      "Saved as you go",
      "Part 2",
      "20 to 40 words",
      "Your lamp plan, the week’s written answer",
      "This is the week’s written answer.",
      "Written answer",
      "Who should keep the lamps lit, and why?",
      "A strong answer names a keeper and a reason.",
      "Your answer",
      "0 words · 20 to 40",
      "Due by noon, Mon 9 Nov. Rahul and Sofia read it before your session and may give feedback on it.",
      "Once you send it, or once your session has started, Rahul, Sofia, Claudia and admins can read your written answer.",
      "Other fellows can’t.",
    ]);
    assert.match(page.html, /<label for="[^"]+" class="label">Your answer<\/label><textarea id="[^"]+" class="box answerBox" rows="8">/);
    // The writer is told that what they add after the session shows as late, with how late (privacy v17);
    // "After its deadline" is the staff's alone, and never the word exercise.
    assert.match(page.text, /anything you add or change after it shows as late to the people who read your work, with how late\./);
    assert.doesNotMatch(page.text, /after its deadline|exercise/i);
    // Nothing on the page locks, submits or reopens any more, and nothing to send yet: no Send.
    assert.doesNotMatch(page.text, /Submit|submitt|\block|reopen|Send my answer|opens it|opened it/i);
    assert.doesNotMatch(page.html, /readOnly=""|readonly=""/);
    // Nothing sent, nothing ticked: neither task is done.
    assert.match(page.text, /0 of 2 done/);
    // A draft is not sent: the task stays open, and the card offers its own Send with what makes the week done.
    await w.write("chloe", 2, { text: words(25) });
    const draft = await w.weekPage("chloe", 2);
    assert.match(draft.text, /0 of 2 done/);
    inOrder(draft.text, [
      "25 words · 20 to 40",
      "Saved Sun 8 Nov, 10am.",
      "Due by noon, Mon 9 Nov. Rahul and Sofia read it before your session and may give feedback on it.",
      "Send my answer",
      "Week 2 is done once it’s sent and everything else it asks for is done.",
    ]);
    assert.match(draft.html, /<button[^>]*>(?:<[^>]+>)*Send my answer(?:<\/[^>]+>)*<\/button>/);
    assert.doesNotMatch(draft.text, /Change my answer/);
  });

  test("once sent the week page says so, when, and that it was before the session, with Change my answer; after the session one neutral line says the group met; the old Reopen changes nothing", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("chloe", 2, { text: words(25) }, { send: true });
    w.at(NOW);
    let page = await w.weekPage("chloe", 2);
    inOrder(page.text, [
      "This week stays open until the programme closes, at the end of Wed 23 Dec.",
      "1 of 2 done",
      "Saved as you go",
      "Group B met for week 2 on Tue 10 Nov. You can still finish it. Anything you add or change now shows as late to the people who read your work, with how late.",
      "Done",
      "Sent Sun 8 Nov",
      "Sent",
      "25 words · 20 to 40",
      "Sent Sun 8 Nov, 10am, before the session.",
      "Change my answer",
      "Once you send it, or once your session has started, Rahul, Sofia, Claudia and admins can read your written answer.",
    ]);
    assert.match(page.text, /1 of 2 done/, "the task that covers the written answer is done once it is sent");
    // A sent answer is shown as sent, read only until "Change my answer"; nothing else is.
    assert.equal((page.html.match(/readOnly=""|readonly=""/g) ?? []).length, 1, "only the sent answer's box waits for Change my answer");
    assert.doesNotMatch(page.text, /is locked|Locked|reopened|Submit|Send my answer/);
    // The line at the top is a fact, in the box's own neutral colours: never the warning colour.
    assert.doesNotMatch(page.html, /class="[^"]*warning[^"]*"[^>]*>Group B met/);

    w.at("2026-11-17T10:05:00Z");
    await feedback("rahul", "chloe", 2, "Clear.");
    page = await w.weekPage("chloe", 2);
    // The answer's line and This week's row lead to the week's own Feedback, on the same page.
    assert.match(page.html, /href="#feedback"[^>]*>Feedback from Rahul<\/a>/);
    assert.match(page.html, /<section id="feedback"/);
    assert.doesNotMatch(page.text, /\bLate\b/);

    // The old Reopen writes nothing: the page reads as it did, open, and the feedback stays.
    w.at(NOW);
    assert.equal((await w.reopenWeek("sofia", "chloe", 2)).status, 200);
    page = await w.weekPage("chloe", 2);
    assert.doesNotMatch(page.text, /reopened this week/);
    assert.match(page.text, /1 of 2 done Saved as you go/);
    assert.match(page.html, />Feedback from Rahul<\/a>/);
  });

  test("changed since sent: before the session its readers still see what was sent; after it they see the latest, and the page says so with how late", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("chloe", 2, { text: words(25) }, { send: true });
    w.at("2026-11-09T09:00:00Z");
    await w.write("chloe", 2, { text: words(26) });
    let page = await w.weekPage("chloe", 2);
    inOrder(page.text, [
      "26 words · 20 to 40",
      "Saved Mon 9 Nov, 9am.",
      "You’ve changed it since you sent it. The people who read your work still see the version you sent until you send it again.",
      "Send my answer",
    ]);
    assert.doesNotMatch(page.text, /Change my answer|Week 2 is done once it’s sent/, "sent once already: the week does not wait on this send");
    // After the session: the latest words are what its readers read, and the change says how late.
    w.at("2026-11-12T19:00:00Z");
    await w.write("chloe", 2, { text: words(27) });
    page = await w.weekPage("chloe", 2);
    inOrder(page.text, [
      "27 words · 20 to 40",
      "Saved Thu 12 Nov, 7pm: 2 days after your session",
      "You’ve changed it since you sent it. Your session has started, so the people who read your work see your latest words.",
      "Send my answer",
    ]);
    // Somebody with no session to be due at is never told late: an admin reading the week sees no box at all.
    const zach = await w.weekPage("zach", 2);
    assert.doesNotMatch(zach.text, /after your session|Send my answer|Change my answer/);
  });

  test("a week whose session has passed with the answer never sent: still open, the draft saved and still a draft, and who may now read it", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(3, "beacon") });
    w.at(NOW);
    const page = await w.weekPage("kofi", 2);
    inOrder(page.text, [
      "This week stays open until the programme closes, at the end of Wed 23 Dec.",
      "0 of 2 done",
      "Saved as you go",
      "Group B met for week 2 on Tue 10 Nov. You can still finish it. Anything you add or change now shows as late to the people who read your work, with how late.",
      "Draft · 3 words",
      "Draft",
      "beacon beacon beacon",
      "3 words · 20 to 40",
      "Saved Sun 8 Nov, 10am, before the session.",
      "Send my answer",
      "Once you send it, or once your session has started, Rahul, Sofia, Claudia and admins can read your written answer.",
    ]);
    assert.doesNotMatch(page.text, /Locked|Not submitted|didn’t submit|Submit/);
    assert.doesNotMatch(page.html, /readOnly=""|readonly=""/);
    // And once the programme has closed, the old page draws it read only, saying when it closed.
    w.at("2026-12-24T00:00:00Z");
    const closed = await w.weekPage("kofi", 2);
    assert.match(closed.text, /The programme closed at the end of Wed 23 Dec, so this week can’t change now\./);
    assert.match(closed.html, /readOnly=""|readonly=""/);
    assert.doesNotMatch(closed.text, /Send my answer|Change my answer|Saved as you go/, "a closed programme offers nothing to send or change");
  });

  test("an answer opened before weeks were submitted is no longer read only: the page says the week stays open", async () => {
    w.world.db.seed(w.rowPath("chloe", 3), {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      exerciseId: "wa-three",
      responseType: "text",
      boxes: { "wb-what": "Lamps." },
      words: 1,
      firstSentAt: new Date("2026-11-15T10:00:00Z"),
      submittedAt: new Date("2026-11-15T10:00:00Z"),
      openedAt: new Date("2026-11-16T09:58:00Z"),
      openedByUid: "rahul",
      reviewStatus: "unreviewed",
      updatedAt: new Date("2026-11-15T10:00:00Z"),
    });
    const page = await w.weekPage("chloe", 3);
    assert.match(page.text, /Your session: Tue 17 Nov, 6pm, Hallward B12\. Your work stays open after it: anything you add or change after it shows as late to the people who read your work, with how late\. This week stays open until the programme closes, at the end of Wed 23 Dec\./);
    // Sent, and opened by a reviewer: the page says only that it was sent, and offers Change my answer.
    assert.match(page.text, /Sent Sun 15 Nov, 10am\. Change my answer/);
    assert.doesNotMatch(page.text, /opened it|can’t change now/);
    // The route takes a change (tests/course-week-work.test.mjs): the page's own word about the opening is the second builder's.
    assert.equal((await w.write("chloe", 3, { boxes: { "wb-what": "Lamps and keepers." } })).status, 200);
  });

  test("a facilitator writing their own answer is told who reads it (the lead and admins, not their group) and that what they add after their group's session shows them as late; an admin reads the question with no box and no Send", async () => {
    w.at(BEFORE_DUE_2);
    const rahul = await w.weekPage("rahul", 2);
    inOrder(rahul.text, [
      "Your session: Tue 10 Nov, 6pm, Hallward B12. Your work stays open after it: anything you add or change after it shows as late to the people who read your work, with how late. This week stays open until the programme closes, at the end of Wed 23 Dec.",
      "You run Group B, so your own work is read by Claudia and admins, not by your group. Anything you add after Group B’s session on Tue 10 Nov shows them as late.",
      "Due by noon, Mon 9 Nov. Claudia and admins read it and may give feedback on it.",
      "Once you send it, or once your session has started, Claudia and admins can read your written answer.",
      "Nobody else on the programme can read it, your co-facilitators included.",
    ]);
    assert.doesNotMatch(rahul.text, /Send to|opens it|Submit/);
    w.at(NOW);
    assert.match(
      (await w.weekPage("rahul", 2)).text,
      /You run Group B, so your own work is read by Claudia and admins, not by your group\. Group B met on Tue 10 Nov: anything you add now shows them as late\./,
    );
    const zach = await w.weekPage("zach", 2);
    assert.match(zach.text, /Who should keep the lamps lit, and why\?/);
    assert.doesNotMatch(zach.html, /class="box answerBox"/);
    assert.doesNotMatch(zach.text, /Submit week|This week stays open|Send to|Send my answer|You run/);
  });

  test("an answer in labelled boxes is drawn box by box, each with its label and hint, and sent together by its own Send", async () => {
    const page = await w.weekPage("chloe", 3);
    inOrder(page.text, [
      "Written answer",
      "Your plan for the lighthouse, in three parts.",
      "Your answer",
      "What I want to work on",
      "two or three sentences.",
      "Who I will ask",
      "My next step",
      "one line.",
      "0 words",
    ]);
    assert.equal((page.html.match(/class="box answerBox"/g) ?? []).length, 3);
    assert.doesNotMatch(page.text, /Submit|Send my answer/, "nothing written: nothing to send");
    await w.write("chloe", 3, { boxes: { "wb-what": words(5) } });
    assert.match((await w.weekPage("chloe", 3)).text, /5 words .*Send my answer/);
    assert.match(page.html, /<fieldset class="boxes"><legend class="label">Your answer<\/legend>/);
  });

  test("the programme page's task row reads Draft, then Sent, then Feedback from whoever gave it; a draft past its session stays a draft", async () => {
    await w.write("chloe", 3, { boxes: { "wb-what": words(5) } });
    let home = await w.programmeHome("chloe");
    assert.match(home.text, /Your written answer Draft · 5 words/);
    assert.match(home.text, /0 of 2 done/);
    await w.write("chloe", 3, { boxes: { "wb-what": words(5) } }, { send: true });
    home = await w.programmeHome("chloe");
    assert.match(home.text, /Your written answer Sent Tue 17 Nov/);
    assert.match(home.text, /1 of 2 done/, "the programme page counts a sent answer done, from the overview's own rows");
    await feedback("sofia", "chloe", 3, "On your plan.");
    home = await w.programmeHome("chloe");
    assert.match(home.html, /Sent Tue 17 Nov <a href="\/learn\/[^"]+\/weeks\/3#feedback" class="cardLink">Feedback from Sofia<span aria-hidden="true">→<\/span><\/a>/);

    // Group A met for week 3 on Thursday with Amara's draft unsent: the week stays open, so it is still a draft.
    w.at("2026-11-11T10:00:00Z");
    await w.write("amara", 3, { boxes: { "wb-what": words(4) } });
    w.at(NOW);
    home = await w.programmeHome("amara");
    assert.match(home.text, /Your written answer Draft · 4 words/);
    assert.doesNotMatch(home.text, /Not submitted|Submitted|Locked/);
    // Its readers may give feedback on it now the session has started, and the row leads to it.
    assert.equal((await feedback("sofia", "amara", 3, "On what you had.")).status, 200);
    home = await w.programmeHome("amara");
    assert.match(home.html, /<a href="\/learn\/[^"]+\/weeks\/3#feedback" class="cardLink">Feedback from Sofia<span aria-hidden="true">→<\/span><\/a>/);
  });

  test("a group's written answers for a week: a facilitator sees their group's fellows, never a facilitator's own; nothing unsent is read before the session", async () => {
    await sendFour();
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(4, "beacon") });
    // Tue 10 Nov at 1pm: Farah has submitted late, and Group B has not met yet.
    w.at("2026-11-10T13:00:00Z");
    // The review page's loader, kept behind This week's work's Written answer column: who waits, in the order it lists them.
    const model = await w.reviewModel("rahul", 2);
    assert.deepEqual(model.toGive.map((person) => person.uid), ["chloe", "farah"]);
    assert.deepEqual(model.notSent.map((person) => [person.uid, person.state, person.readable, person.words]), [["kofi", "draft", false, 0]]);
    // The group's written answers for the week: the page of one question across the group, at the written answer.
    const forwarded = await w.writtenPage("rahul", { week: "2" });
    assert.equal(forwarded.to, `/learn/${RUN.agi}/group/${B}/question?week=2&first=answer`);
    const page = await w.questionPage("rahul", { week: "2", first: "answer" });
    inOrder(page.text, [
      "Group B · week 2",
      "The question · 20 to 40 words · Written answer",
      "Who should keep the lamps lit, and why?",
      "Chloe Nguyen",
      "Sent Sun 8 Nov, 10am",
      "No feedback yet",
      "Farah Hussain",
      "Sent Tue 10 Nov, 12pm",
      "After its deadline",
      "No feedback yet",
      "Kofi Asante",
      "Not sent yet",
    ]);
    // One person's answer: the reading view of their week, with the review page's words.
    const chloe = await w.readingPage("rahul", "chloe", { week: "2" });
    inOrder(chloe.text, [
      "Written answer",
      "25 words",
      "Sent Sun 8 Nov, 10am",
      "The question · 20 to 40 words",
      "Who should keep the lamps lit, and why?",
      "Chloe can change it until the programme closes. Before the session you read it as last sent; from the session, as it stands.",
      "Your feedback",
      "Optional: write it when there’s time, when it’s needed, or when they’ve asked a question. It’s signed with your name.",
      "Comment",
      "Shows on Chloe’s week 2 page as soon as you save.",
      "0 words",
      "Save feedback",
    ]);
    // Sent after its deadline (noon the day before), before the session: after its deadline, to staff; never late.
    assert.deepEqual(model.toGive.map((person) => [person.uid, person.afterDeadline, person.late]), [["chloe", false, false], ["farah", true, false]]);
    // Nothing is reopened now: no Reopen on either page.
    for (const drawn of [page, chloe]) {
      assert.doesNotMatch(drawn.text, /Reopen week/);
      // No rubric, no level, and no email from these pages: saving emails nobody, and an admin sends the emails in a batch.
      assert.doesNotMatch(drawn.text, /The rubric|A short comment|Send feedback to|The email Chloe gets|There are no marks/);
    }
    assert.doesNotMatch(chloe.html, /aria-pressed/);
    // Never a word of a draft not sent before the session, nor how long it is (privacy v17).
    const kofiWeek = await w.readingPage("rahul", "kofi", { week: "2" });
    for (const drawn of [page, kofiWeek]) {
      assert.ok(!drawn.html.includes("beacon"), "Kofi's unsent draft is shown");
      assert.doesNotMatch(drawn.text, /Kofi Asante 4 words|4 words/);
    }
    // His own answer, and another group's, are on no page of his.
    assert.doesNotMatch(page.text, /Rahul Mehta|Amara/, "a facilitator's own answer and another group's are on the page");
    assert.equal((await w.readingPage("rahul", "rahul", { week: "2" })).to, `/learn/${RUN.agi}`);
    // Sofia, the co-facilitator, does not get Rahul's either.
    assert.ok(!w.questionViewOf(await w.questionPage("sofia", { week: "2", first: "answer" })).rows.some((row) => row.uid === "rahul"));
    assert.ok(![...model.toGive, ...model.feedbackSent, ...model.notSent].some((person) => person.uid === "rahul"));

    // Once the session has started, Kofi's draft is its readers' to read, and waits from the session, oldest first.
    w.at(NOW);
    const locked = await w.reviewModel("rahul", 2);
    assert.deepEqual(locked.toGive.map((person) => person.uid), ["chloe", "farah", "kofi"]);
    assert.deepEqual(locked.notSent, []);
    const kofiThen = locked.toGive.find((person) => person.uid === "kofi");
    assert.deepEqual([kofiThen.firstSentAt, kofiThen.due.at, kofiThen.readable, kofiThen.words], [null, "2026-11-10T18:00:00.000Z", true, 4]);
    // The reading view of his week reads it as it stands, never sent, against the session he was due at.
    const kofiView = w.readingViewOf(await w.readingPage("rahul", "kofi", { week: "2" }));
    assert.deepEqual(
      [kofiView.week.answer.text, kofiView.week.answer.sentAt, kofiView.week.answer.changedSinceSent, kofiView.due.at?.toISOString()],
      ["beacon beacon beacon beacon", null, false, "2026-11-10T18:00:00.000Z"],
    );
    inOrder((await w.questionPage("rahul", { week: "2", first: "answer" })).text, ["Kofi Asante", "Not sent yet", "No feedback yet", "Saved Sun 8 Nov, 10am", "beacon beacon beacon beacon"]);
    const kofiNow = await w.readingPage("rahul", "kofi", { week: "2" });
    inOrder(kofiNow.text, [
      "Written answer",
      "4 words",
      "The question · 20 to 40 words",
      "Saved Sun 8 Nov, 10am",
      "beacon beacon beacon beacon",
      "Kofi can change it until the programme closes. Before the session you read it as last sent; from the session, as it stands.",
    ]);
    // Saved before the session: never late, and never "After its deadline", which is for a send.
    assert.doesNotMatch(kofiNow.text, /Saved Sun 8 Nov, 10am Late|After its deadline/);

    // Kofi changes it after the session: the pages say when and how late, and show it as it stood at the session.
    w.at("2026-11-12T19:00:00Z");
    assert.equal((await w.write("kofi", 2, { text: words(5, "harbour") })).status, 200);
    w.at(NOW);
    for (const drawn of [await w.readingPage("rahul", "kofi", { week: "2" }), await w.questionPage("rahul", { week: "2", first: "answer" })]) {
      inOrder(drawn.text, ["Saved Thu 12 Nov, 7pm", "Late: 2 days after the session", "harbour harbour harbour harbour harbour", "As it stood at the session", "beacon beacon beacon beacon"]);
      assert.doesNotMatch(drawn.text, /Reopen week/);
    }
    // With nobody asked for, the reader is led to the oldest waiting first: the group page's Feedback to write and
    // Home's next answer, held by "the group page's Feedback to write lists what waits, oldest first" below.
    assert.equal((await w.reviewModel("rahul", 2)).toGive[0].uid, "chloe");
  });

  test("a stored reopen from when weeks locked changes nothing: a sent answer stays readable, its words shown", async () => {
    await sendFour();
    // As a reopen pressed before weeks stayed open left it: the week's submit cleared, the reopen stored.
    w.world.db.poke(`courseWeekWork/${RUN.agi}__farah__w02`, { submittedAt: null, reopenedAt: new Date("2026-11-11T10:00:00Z"), reopenedByUid: "rahul", reopenCount: 1 });
    const model = await w.reviewModel("rahul", 2);
    assert.deepEqual(model.toGive.map((person) => person.uid), ["chloe", "farah"]);
    // Kofi wrote nothing: not started, with nothing to read.
    assert.deepEqual(model.notSent.map((person) => [person.uid, person.state, person.words]), [["kofi", "not-started", 0]]);
    // Her answer is read whatever a stored reopen says: readable, with its words, and waiting for feedback.
    const farah = model.toGive.find((person) => person.uid === "farah");
    assert.deepEqual([farah.readable, farah.words, farah.state], [true, 30, "sent"]);
    const page = await w.readingPage("rahul", "farah", { week: "2" });
    assert.deepEqual([w.readingViewOf(page).week.answer.text, w.readingViewOf(page).answerFeedback.open], [words(30), true]);
    assert.ok(page.html.includes(words(30)), "Farah's words, as sent, are her readers' to read");
    assert.doesNotMatch(page.text, /Reopened, not submitted again/);
    assert.ok((await w.questionPage("rahul", { week: "2", first: "answer" })).html.includes(words(30)));
  });

  test("the programme's side gives the facilitator's own answer to the lead, on the reading view of his week; the page writes nothing", async () => {
    await sendFour();
    // The lead's review page's address for his answer forwards to the reading view of his week, at the answer.
    assert.equal((await w.leadPage("claudia", { group: B, week: "2", person: "rahul" })).to, `/admin/admissions/forms/${ROUND}/programmes/${AGI}/coursework/rahul?week=2#reading-answer`);
    const page = await w.leadReadingPage("claudia", "rahul", { week: "2" });
    const view = w.readingViewOf(page);
    assert.equal(view.person.uid, "rahul");
    assert.equal(view.answerFeedback.open, true, "the lead may not give feedback on a facilitator's own answer");
    // He is named as the names rule names him to the lead, who is on the committee; the sentences by the name he goes by.
    assert.match(page.text, /Rahul Mehta/);
    assert.match(page.text, /Sent Sun 8 Nov, 10am .*Rahul can change it until the programme closes\. Before the session you read it as last sent; from the session, as it stands\./);
    assert.doesNotMatch(page.text, /Reopen week/);
    assert.equal(page.wrote, false, "a GET never writes, and opening an answer stamps nothing");
    // On the page of one question for the group, his answer is listed, marked as a facilitator's.
    const question = w.questionViewOf(await w.leadQuestionPage("claudia", { group: B, week: "2", first: "answer" }));
    assert.deepEqual(question.rows.filter((row) => row.answer).map((row) => [row.uid, row.facilitating]).sort(), [["chloe", false], ["farah", false], ["rahul", true]]);
    // Another programme's lead: nothing of it.
    for (const drawn of [await w.leadReadingPage("tess", "rahul", { week: "2" }), await w.leadQuestionPage("tess", { group: B, week: "2" })]) {
      assert.ok(!drawn.html.includes(words(25)), "another programme's lead reads the answer");
      assert.equal(w.readingViewOf(drawn) ?? w.questionViewOf(drawn), null);
    }
    // Signed out: the admissions tree's own gate sends them away before the page.
    const signedOut = await w.leadReadingPage(null, "rahul", { week: "2" });
    assert.ok(signedOut.to && !signedOut.html.includes(words(25)), JSON.stringify(signedOut.to));
  });

  test("the lead opens any group's written answers from the programme's side: the first group by default, and a group named shows only that group", async () => {
    await sendFour();
    // The lead's review page's address for a group forwards to one question across that group, at the written answer.
    assert.equal((await w.leadPage("claudia", { group: A })).to, `/admin/admissions/forms/${ROUND}/programmes/${AGI}/question?group=${A}&first=answer`);
    for (const who of ["claudia", "zach"]) {
      // Opened with no group, the first in the order the Attendance tab lists them (by meeting): Group D.
      const first = w.questionViewOf(await w.leadQuestionPage(who, { first: "answer" }));
      assert.equal(first.groupName, "Group D", who);
      // A group named: that group's people, and only theirs.
      const a = w.questionViewOf(await w.leadQuestionPage(who, { group: A, week: "2", first: "answer" }));
      assert.equal(a.groupName, "Group A", who);
      assert.ok(!a.rows.some((row) => ["chloe", "farah", "kofi"].includes(row.uid)), `${who} is shown Group B's people on Group A's page`);
    }
  });

  test("the lead chooses the group on the page of one question from the programme's side, with the Coursework tab's Group filter; a facilitator's page has none", async () => {
    await sendFour();
    const QUESTION = `/admin/admissions/forms/${ROUND}/programmes/${AGI}/question`;
    /** The page's choice of group, as drawn: each link's words, its address, and whether it is marked as the one shown, by eye and for a screen reader. */
    const chooserOf = (html) => {
      const nav = /<nav aria-label="Group" class="groupsNav"><p class="groupLabel" aria-hidden="true">Group<\/p><ul class="filters" role="list">([\s\S]*?)<\/ul><\/nav>/.exec(html);
      assert.ok(nav, "no choice of group on the page");
      const links = [...nav[1].matchAll(/<li><a href="([^"]+)" class="([^"]+)"( aria-current="page")?>([^<]+)<\/a><\/li>/g)];
      assert.equal(links.map((m) => m[0]).join(""), nav[1], "the choice of group holds something other than its links");
      return links.map((m) => {
        const byEye = m[2] === "filter filterOn";
        assert.equal(byEye, m[3] !== undefined, `${m[4]} is marked for the eye and not for a screen reader, or the other way round`);
        return [m[4], m[1].replace(/&amp;/g, "&"), m[3] !== undefined];
      });
    };
    /** Every live group of the run, in the order the tabs list them (by meeting), each this page's address for it. */
    const groups = [["Group D", "agi-autumn-2026-mondays__grp00004"], ["Group B", B], ["Group C", C], ["Group A", A]];
    const expected = (shown, query) => groups.map(([name, id]) => [name, `${QUESTION}?group=${id}${query}`, id === shown]);
    for (const who of ["claudia", "zach"]) {
      // The week, the kind of question and the filters the address named are kept; the group shown is marked.
      const page = await w.leadQuestionPage(who, { group: B, week: "2", first: "answer", unread: "1", late: "1" });
      assert.deepEqual(chooserOf(page.html), expected(B, "&week=2&first=answer&unread=1&late=1"), who);
      assert.deepEqual(
        w.questionViewOf(page).groups.map((each) => [each.name, each.current]),
        groups.map(([name, id]) => [name, id === B]),
        who,
      );
      // A question named by its id is kept as that question.
      assert.deepEqual(chooserOf((await w.leadQuestionPage(who, { group: B, week: "2", question: ONE_BOX.id })).html), expected(B, `&week=2&question=${ONE_BOX.id}`), who);
      // Nothing the address did not name: no week, no question, no filter; and a week the run does not teach is not kept.
      assert.deepEqual(chooserOf((await w.leadQuestionPage(who, { group: A })).html), expected(A, ""), who);
      assert.deepEqual(chooserOf((await w.leadQuestionPage(who, { group: A, week: "99" })).html), expected(A, ""), who);
    }
    // Opened with no group, the first, and the links say which.
    assert.deepEqual(chooserOf((await w.leadQuestionPage("claudia", { first: "answer" })).html), expected("agi-autumn-2026-mondays__grp00004", "&first=answer"));
    // A link opens that group's page: Group A's people, and only Group A's.
    const [, toA] = chooserOf((await w.leadQuestionPage("claudia", { group: B, week: "2", first: "answer" })).html).find(([name]) => name === "Group A");
    const a = await w.leadQuestionPage("claudia", Object.fromEntries(new URL(toA, "https://naisi.uk").searchParams));
    assert.equal(w.questionViewOf(a).groupName, "Group A");
    assert.ok(!w.questionViewOf(a).rows.some((row) => ["chloe", "farah", "kofi"].includes(row.uid)), "Group B's people on Group A's page");
    // Behind the group's door there is none, for the group's facilitator and for an admin alike: a facilitator's page is the one group's own.
    for (const who of ["rahul", "zach"]) {
      const page = await w.questionPage(who, { week: "2", first: "answer" });
      assert.equal(page.to, null, who);
      assert.equal(w.questionViewOf(page).groups, null, who);
      assert.doesNotMatch(page.html, /groupsNav|aria-label="Group"/, who);
    }
  });

  test("who reaches the group's written answers at all: the address forwards, and the page of one question answers with its own gate", async () => {
    await sendFour();
    for (const who of ["chloe", "farah", "amara", "tess", "una", "sam", "rahul", "sofia", "zach", null]) {
      assert.equal((await w.writtenPage(who, { week: "2" })).to, `/learn/${RUN.agi}/group/${B}/question?week=2&first=answer`, `${who}`);
    }
    for (const who of ["chloe", "farah", "amara", "tess", "una", "sam"]) {
      const page = await w.questionPage(who, { week: "2", first: "answer" });
      assert.ok(page.to?.startsWith("/learn"), `${who} reached it: ${page.text.slice(0, 80)}`);
    }
    assert.equal((await w.questionPage(null, { week: "2" })).to, "/login");
    for (const who of ["rahul", "sofia", "zach"]) assert.equal((await w.questionPage(who, { week: "2", first: "answer" })).to, null, who);
  });

  test("the week's Feedback: the writer's own feedback on their own page, signed, never a level and never after its deadline; the old feedback page sends its reader there", async () => {
    // Kofi's draft, unsent when Group B's session starts.
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(3) });
    await sendFour();
    w.at("2026-11-17T10:05:00Z");
    await feedback("rahul", "farah", 2, "Good steps.");
    w.at(NOW);
    const page = await w.weekPage("farah", 2);
    inOrder(page.text, ["Who keeps the lamps", "Feedback", "Feedback from Rahul", "Your facilitator · Tue 17 Nov", "Good steps.", "Your answer", "30 words · 20 to 40"]);
    // Feedback locks nothing: no line says anybody opened it; and nothing here is a level, a mark or after its deadline.
    assert.doesNotMatch(page.text, /opened it|can’t change now/);
    assert.doesNotMatch(page.text, /[Aa]fter its deadline|\bmark\b(?!s)|There are no marks|Strong|Solid/);
    // Before any feedback the week has no Feedback, and the answer's card still says who reads it.
    const chloe = await w.weekPage("chloe", 2);
    assert.doesNotMatch(chloe.html, /<section id="feedback"/);
    assert.match(chloe.text, /Once you send it, or once your session has started, Rahul, Sofia, Claudia and admins can read your written answer\./);
    // Nobody reads anybody else's here: Chloe's page is Chloe's, and nobody else's carries Farah's.
    assert.doesNotMatch(chloe.text, /Good steps/);
    for (const who of ["claudia", "tess", "sam", "una", "kofi"]) {
      const theirs = await w.weekPage(who, 2);
      assert.doesNotMatch(theirs.text, /Good steps/, who);
      const week = theirs.overview?.weeks?.find((entry) => entry.weekNumber === 2) ?? null;
      assert.ok(!week || !week.feedback || week.feedback.length === 0, `${who} is handed feedback`);
    }
    // The old feedback page, where emails already sent link, reads nothing and sends its reader to the week's Feedback.
    for (const who of ["farah", "chloe", "claudia", "tess"]) {
      const old = await w.feedbackPage(who, 2);
      assert.equal(old.to, `/learn/${RUN.agi}/weeks/2#feedback`, who);
      assert.equal(old.wrote, false);
    }

    // Feedback on Kofi's draft, unsent at the session: it is on his week page, beside what he saved.
    assert.equal((await feedback("rahul", "kofi", 2, "Finish the last line.")).status, 200);
    const kofi = await w.weekPage("kofi", 2);
    inOrder(kofi.text, ["Feedback from Rahul", "Your facilitator · Tue 17 Nov", "Finish the last line.", "Your answer", "lamp lamp lamp"]);
    assert.doesNotMatch(kofi.text, /submitted Tue/);
  });

  test("the group page's Feedback to write lists what waits, oldest first; Home counts it; the lead's tab lists each group", async () => {
    await sendFour();
    const group = await w.groupPage("rahul");
    inOrder(group.text, [
      "Feedback to write",
      "2 week 2 answers",
      "People see your feedback on their page as soon as you save it; the email telling them goes in a batch.",
      "Chloe Nguyen",
      "Sent Sun 8 Nov, 10am",
      "Write feedback",
      "Farah Hussain",
      "Sent Tue 10 Nov, 12pm",
      "Write feedback",
    ]);
    // Sent before the session: the card says nothing of late.
    assert.doesNotMatch(group.text.slice(group.text.indexOf("Feedback to write"), group.text.indexOf("Feedback to write") + 400), /Late/);
    assert.match(group.html, /href="\/learn\/[^"]+\/group\/[^"]+\/coursework\/chloe\?week=2#reading-answer"/);
    // The card lists the group's fellows and never Rahul's own answer, which is the lead's and admins' to read.
    const toWrite = group.text.slice(group.text.indexOf("Feedback to write"), group.text.indexOf("Feedback to write") + 400);
    assert.match(toWrite, /Chloe Nguyen/, "the slice is the card");
    assert.doesNotMatch(toWrite, /\bRahul\b/);
    // The summer's card stays for the summer's answers still waiting, and holds no written answer.
    const summer = group.text.slice(group.text.indexOf("To review"));
    assert.match(summer, /^To review 1 CN Chloe Nguyen · Week 1 exercise/);
    // The card ends at its own link: on a week written as blocks This week's
    // work, which names the whole group, follows it.
    const summerCard = summer.slice(0, summer.indexOf("Review exercises"));
    assert.ok(summerCard.length > 0, "the summer's card has lost its link to the review page");
    assert.doesNotMatch(summerCard, /Week 2|Farah/);
    const summary = await w.summary("rahul");
    assert.equal(summary.body.writtenToGive, 2);
    assert.equal(summary.body.toReview, 1, "the summer's count holds the summer's answers alone");
    assert.deepEqual(summary.body.writtenNext, { weekNumber: 2, uid: "chloe" }, "the oldest sent waits first");
    assert.deepEqual(summary.body.writtenWeeks, [2, 2]);
    const home = await w.home("rahul");
    assert.match(home.text, /2 week 2 answers Write feedback/);
    assert.match(home.html, /href="\/learn\/[^"]+\/group\/[^"]+\/coursework\/chloe\?week=2#reading-answer"/);
    // The lead's Attendance tab: a line per group, the facilitator's own answer counted for the lead.
    const tab = await w.attendanceTab("claudia");
    assert.match(tab.text, /Feedback to write .*Group B 3 week 2 answers Write feedback/);
    // Feedback from anyone takes it off.
    await feedback("rahul", "chloe", 2);
    assert.equal((await w.summary("rahul")).body.writtenToGive, 1);
  });

  test("Feedback to write waits only for answers their readers may read: a draft before the session for nobody, a draft unsent from the session", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(4) });
    assert.equal((await w.summary("rahul")).body.writtenToGive, 0, "a draft before the session waits for nobody");
    w.at(NOW);
    const group = await w.groupPage("rahul");
    inOrder(group.text, ["Feedback to write", "1 week 2 answer", "Kofi Asante", "Not sent, read since the session, Tue 10 Nov, 6pm", "Write feedback"]);
    assert.deepEqual((await w.summary("rahul")).body.writtenNext, { weekNumber: 2, uid: "kofi" });
    // The old Reopen changes nothing: it still waits.
    assert.equal((await w.reopenWeek("rahul", "kofi", 2)).status, 200);
    assert.equal((await w.summary("rahul")).body.writtenToGive, 1);
    // Sent, it waits from when it was sent.
    assert.equal((await w.sendAnswer("kofi", 2)).status, 200);
    assert.equal((await w.summary("rahul")).body.writtenToGive, 1);
    inOrder((await w.groupPage("rahul")).text, ["Kofi Asante", "Sent Tue 17 Nov, 12pm", "Late: 6 days after the session", "Write feedback"]);
  });
});

// ---------------------------------------------------------------------------
// 5. The summer's answers still read, and are never given a verdict here
// ---------------------------------------------------------------------------

describe("5. the summer's answers", () => {
  test("an exercise answer on a week written before blocks reads as it always did, and keeps its own verdicts", async () => {
    const own = await w.ownRowsOf("chloe", 1);
    const row = own.body.responses.find((entry) => entry.exerciseId === "x1");
    assert.equal(row.text, "chloe wrote this.");
    assert.equal(row.reviewStatus, "unreviewed");
    assert.equal(row.written, undefined);
    const verdict = await w.call("rahul", w.routes.verdict.POST, { responseId: `${RUN.agi}__chloe__w01__x1` }, { course: true, body: { reviewStatus: "seen" } });
    assert.equal(verdict.status, 200);
    assert.equal(w.world.db.read(`courseExerciseResponses/${RUN.agi}__chloe__w01__x1`).reviewStatus, "seen");
  });

  test("a written answer is never given a summer verdict, and is not in the summer queue", async () => {
    await sendFour();
    const id = `${RUN.agi}__chloe__w02__${ONE_BOX.id}`;
    assert.equal((await w.call("rahul", w.routes.verdict.POST, { responseId: id }, { course: true, body: { reviewStatus: "approved" } })).status, 403);
    assert.equal((await w.call("zach", w.routes.verdict.POST, { responseId: id }, { course: true, body: { reviewStatus: "approved" } })).status, 404);
    assert.equal(stored("chloe", 2).reviewStatus, "unreviewed");
    w.world.user = w.sessionOf("rahul");
    w.world.course = true;
    const queue = await w.routes.queue.GET(new Request("https://naisi.invalid/api?week=2"), { params: Promise.resolve({ groupId: B }) });
    w.world.course = false;
    assert.equal(queue.status, 200);
    assert.deepEqual(queue.body.rows.flatMap((row) => row.responses.map((response) => response.exerciseId)), []);
    // The summer's review page sends a week written as blocks to one question across the group, at the written answer.
    assert.match((await w.oldReviewPage("rahul", { week: "2" })).to, /\/question\?week=2&first=answer$/);
    assert.equal((await w.oldReviewPage("rahul", { week: "1" })).to, null);
  });
});

// ---------------------------------------------------------------------------
// 6. Finishing, the rubric's setting, the words and the email
// ---------------------------------------------------------------------------

describe("6. finishing's column, the rubric's setting, the email", () => {
  test("finishing counts written answers sent, out of the run's, through the one reader; a draft its week locked unsent was never sent", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 3, { boxes: { "wb-what": words(4) } });
    await sendFour();
    const { readRunRecords } = await w.loadTs("lib/courses/programmeAttendance.ts");
    const records = await readRunRecords(w.world.courseDb, RUN.agi);
    const tallies = await w.lib.whoFinished.readExerciseTallies(w.world.courseDb, records);
    // Group B is set week 1's exercise and weeks 2 and 3's written answers.
    assert.deepEqual(tallies.get("chloe"), { done: 2, of: 3 }, "week 1's summer answer and week 2's written answer");
    assert.deepEqual(tallies.get("farah"), { done: 1, of: 3 });
    assert.deepEqual(tallies.get("kofi"), { done: 1, of: 3 }, "Kofi's approved summer answer, and not his week 3 draft");
  });

  test("an admin pastes the guide's table, reads it back and saves it; nobody else may", async () => {
    const table = [
      "|  | Not yet | Solid | Strong |",
      "| --- | --- | --- | --- |",
      "| **Clear** | Vague | States a view | A view someone could dispute, with a number |",
      "| **Reasons** | None | Some, from the week's material | Weighed, not just cited |",
    ].join("\n");
    const read = await w.call("zach", w.routes.rubric.POST, { courseId: COURSE.agi }, { course: true, body: { markdown: table } });
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, {
      rubric: {
        levels: ["Not yet", "Solid", "Strong"],
        rows: [
          { name: "Clear", descriptors: ["Vague", "States a view", "A view someone could dispute, with a number"] },
          { name: "Reasons", descriptors: ["None", "Some, from the week's material", "Weighed, not just cited"] },
        ],
      },
      problems: [],
    });
    const saved = await w.call("zach", w.routes.rubric.PUT, { courseId: COURSE.agi }, { course: true, body: { markdown: table } });
    assert.equal(saved.status, 200);
    assert.deepEqual(w.world.db.read(`courses/${COURSE.agi}`).rubric, read.body.rubric);
    // What a stored rubric reads back as, and its table round trip.
    const back = w.lib.rubricMarkdown.readRubricMarkdown(w.lib.rubricMarkdown.rubricToMarkdown(read.body.rubric));
    assert.deepEqual(back.rubric, read.body.rubric);
    // A table that cannot be saved says why; nothing is stored.
    const bad = await w.call("zach", w.routes.rubric.PUT, { courseId: COURSE.agi }, { course: true, body: { markdown: "| | One |\n| --- | --- |\n| **A** | |" } });
    assert.equal(bad.status, 400);
    assert.deepEqual(w.world.db.read(`courses/${COURSE.agi}`).rubric, read.body.rubric);
    // Taken off: the comment alone.
    assert.equal((await w.call("zach", w.routes.rubric.PUT, { courseId: COURSE.agi }, { course: true, body: { remove: true } })).status, 200);
    assert.equal(w.world.db.read(`courses/${COURSE.agi}`).rubric, null);
    // Everybody else.
    for (const who of ["claudia", "rahul", "chloe", "tess"]) {
      assert.equal((await w.call(who, w.routes.rubric.PUT, { courseId: COURSE.agi }, { course: true, body: { markdown: table } })).status, 403, who);
      assert.equal((await w.call(who, w.routes.rubric.POST, { courseId: COURSE.agi }, { course: true, body: { markdown: table } })).status, 403, who);
    }
    assert.equal((await w.call(null, w.routes.rubric.PUT, { courseId: COURSE.agi }, { course: true, body: { markdown: table } })).status, 401);
    assert.equal((await w.call("zach", w.routes.rubric.PUT, { courseId: COURSE.agi }, { course: true, viewAs: true, body: { markdown: table } })).status, 403);
  });

  test("a rubric's levels are words; the stored rubric is read by one function; problems say what to change", () => {
    const { normalizeRubric, rubricProblems, rubricOf, givenLevelsOf, normalizeGivenLevels } = w.lib.rubric;
    assert.deepEqual(rubricOf({ rubric: RUBRIC }), RUBRIC);
    assert.equal(rubricOf({ rubric: { levels: ["One"], rows: [{ name: "A", descriptors: ["x"] }] } }), null, "one level is nothing to choose between");
    assert.equal(normalizeRubric("not a rubric"), null);
    assert.deepEqual(rubricProblems({ levels: ["A", "A"], rows: [{ name: "R", descriptors: ["x", ""] }] }), [
      "Two levels are called “A”. Give each its own name.",
      "“R” has no description for A. Write one in that cell.",
    ]);
    // Feedback is a signed comment now: nothing gives a level any more, and the levels feedback carried before still read.
    assert.equal(givenLevelsOf, undefined, "the rubric still offers a way to give levels as feedback");
    assert.deepEqual(
      normalizeGivenLevels([{ row: "A clear view", level: "Solid", descriptor: "States a view" }, { row: "", level: "x" }, "junk"]),
      [{ row: "A clear view", level: "Solid", descriptor: "States a view" }],
    );
    // A pasted cell's entities are read once: "&amp;lt;" is the "&lt;" the
    // Markdown says, never a "<"; and "x < y" and "Q & A" read as typed.
    const pasted = w.lib.rubricMarkdown.readRubricMarkdown(
      "| | Weak | Strong |\n| --- | --- | --- |\n| Tags &amp;lt;b&amp;gt; | x < y | Q & A |\n",
    );
    assert.equal(pasted.ok, true);
    assert.deepEqual(pasted.rubric.rows, [{ name: "Tags &lt;b&gt;", descriptors: ["x < y", "Q & A"] }]);
  });

  test("words are counted as Worksheets count them", () => {
    for (const text of ["", "  ", "one", "one two", " spaced   out\n\nlines\tand tabs ", "it’s hyphen-ated, 12 3"]) {
      assert.equal(w.lib.model.countWords(text), w.lib.worksheets.countWords(text), JSON.stringify(text));
    }
  });

  test("the email's words come from records, and it carries no feedback: who left it, on what, and the week's page", () => {
    const said = w.lib.feedbackWords;
    const about = w.lib.feedbackModel.emailAboutOf([{ weekNumber: 3, on: "writtenAnswer", byName: "Rahul", at: new Date("2026-11-17T10:00:00Z") }]);
    assert.deepEqual(
      [said.emailSubjectWords("AGI Strategy"), said.emailLeadWords(about), said.READ_YOUR_FEEDBACK],
      ["New feedback on your AGI Strategy work", "Rahul has left feedback on your week 3 written answer.", "Read your feedback"],
    );
    assert.equal(w.lib.feedbackSend.feedbackWeekUrl("https://naisi.invalid", RUN.agi, 3), `https://naisi.invalid/learn/${encodeURIComponent(RUN.agi)}/weeks/3#feedback`);
    assert.equal(w.lib.model.answerNameOf("Your threat model, the week’s written answer"), "your threat model");
    assert.equal(w.lib.model.answerNameOf("Part four"), "your written answer");
  });

  test("never the word exercise for the written answer, and no dash, in its words; an answer is sent, never submitted, wherever it is read", () => {
    const all = Object.values(w.lib.words)
      .map((value) => (typeof value === "string" ? value : ""))
      .join(" ");
    assert.doesNotMatch(all, /exercise/i);
    assert.doesNotMatch(all, /[–—]/);
    const said = w.lib.words;
    for (const sample of [
      said.dueLineWords("dayBefore", { dateKey: "2026-11-16" }, { todayKey: "2026-11-16", dayBeforeTime: null, first: false }),
      said.dueLineWords("dayBefore", { dateKey: "2026-11-02" }, { todayKey: "2026-11-01", dayBeforeTime: "12:00", first: false }),
      said.dueLineWords("dayBefore", null, { todayKey: "2026-11-01", dayBeforeTime: "12:00", first: false }),
    ]) assert.doesNotMatch(sample, /exercise|[–—]/i);
    assert.equal(said.dueLineWords("dayBefore", { dateKey: "2026-11-16" }, { todayKey: "2026-11-16", dayBeforeTime: null, first: false }), "Due by the end of today, Mon 16 Nov.");
    assert.equal(said.dueLineWords("dayBefore", { dateKey: "2026-11-02" }, { todayKey: "2026-11-01", dayBeforeTime: "12:00", first: false }), "Due by noon, Mon 2 Nov.");
    const at = new Date("2026-11-16T22:42:00Z");
    assert.deepEqual(
      [said.SENT, said.sentLineWords(at), said.sentOnWords(at), said.listSentWords(at), said.NOT_SENT_YET],
      ["Sent", "Sent Mon 16 Nov, 10:42pm.", "Sent Mon 16 Nov", "Sent Mon 16 Nov, 10:42pm", "Not sent yet"],
    );
    // An answer never sent, read because the session it was due at started before it was sent.
    assert.equal(said.listReadSinceWords(at), "Not sent, read since the session, Mon 16 Nov, 10:42pm");
    assert.doesNotMatch(said.listReadSinceWords(at), /Locked|exercise|[\u2013\u2014]/i);
    // Nothing the written answer says is submitted, locked or reopened any more.
    for (const value of Object.values(said)) {
      if (typeof value === "string") assert.doesNotMatch(value, /submit|\block|reopen/i, value);
    }
    // The feedback page's "266 words · submitted ..." went with the page: the feedback the writer reads,
    // on their week page, is signed and dated and never says it was sent, nor carries a dash.
    const feedbackWords = w.lib.feedbackWords;
    assert.doesNotMatch(
      Object.values(feedbackWords).map((value) => (typeof value === "string" ? value : "")).join(" "),
      /[–—]/,
    );
    for (const card of [
      { byRole: "facilitator", byName: "Rahul", at: at.toISOString() },
      { byRole: "lead", byName: "Claudia", at: at.toISOString() },
      { byRole: "admin", byName: "Zach", at: at.toISOString() },
    ]) {
      const read = `${feedbackWords.cardHeadingWords(card)} ${feedbackWords.cardByWords(card, "AGI Strategy")}`;
      assert.doesNotMatch(read, /\bsent\b|emailed|[–—]/i, read);
    }
  });
});
