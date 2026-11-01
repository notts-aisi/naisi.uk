/**
 * The week's written answer, its review and its feedback (boards wk-week,
 * wk-week-phone, wk-review, wk-review-phone, wk-feedback-phone, wk-fac-group,
 * wk-programme, en-finish; Q30 C, Q33, Q34 B; Zach on Mon 26 Oct: a
 * facilitator's own answer is the lead's and admins' to read and give
 * feedback on), since a week's work is submitted (the week you submit,
 * `src/lib/courses/weekWork/`): the answer is sent by submitting its week,
 * the week locks when it is submitted or its group's session starts, opening
 * an answer locks nothing, and its readers read it, and give feedback on it,
 * only once its week is submitted or locked (privacy v15).
 *
 * Driven through the real routes and the real pages, as every kind of
 * caller: Chloe, a fellow of Group B; Farah, another fellow of Group B;
 * Kofi, a third; Amara, a fellow of Group A; Rahul, Group B's facilitator,
 * who writes an answer of their own too; Sofia, the other facilitator (and
 * Group A's); Claudia, the programme's lead; Tess, who leads another
 * programme; Zach, an admin; Una, placed and not told; Sam, who left; Omar,
 * taken off; a view-as session; and somebody signed out.
 *
 * THE WEEKS' CLOCK: week 2 locks when each group meets for it. Group A met
 * on Thu 5 Nov at 6pm, Group B on Tue 10 Nov at 6pm, Group C on Wed 11 Nov
 * at 1pm, so the world's own clock (Tue 17 Nov, noon) finds every week 2
 * locked, and a suite writes week 2 at an earlier moment. Group B's week 2
 * was due by noon on Mon 9 Nov. Week 3 for Group B is open until tonight.
 *
 *  1. Writing, and sending by submitting the week: who may write, their own
 *     answer only; the first-sent time stored once; a change after a reopen
 *     stamped; the range's top a limit; the labelled boxes sent together.
 *  2. The gate: who may give feedback and reopen; opening locks nothing;
 *     the week's lock; feedback only on an answer its readers may read.
 *  3. Feedback: the rubric, once, the one email; a course with no rubric.
 *     Late, from the group's own calendar.
 *  4. The pages: the week page (open, submitted, locked, reopened), the
 *     review page (the group's and the lead's), the feedback page, the
 *     group page's review queue, Home, the programme page's task row.
 *  5. The summer's answers still read, and are never given a verdict here.
 *  6. Finishing's column, the rubric's setting, the email's words and class.
 *
 * Reopening is the week's own route now, and `tests/course-week-work.test.mjs`
 * holds its own suite: who may, what it clears, who it says did it, and that
 * feedback already given stays.
 *
 * Every word in the weeks and the rubric is made up; every address is on
 * example.com.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { A, AGI, B, C, COURSE, NOW, ONE_BOX, ROUND, RUBRIC, RUN, makeWrittenAnswersWorld } from "./lib/writtenAnswersWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWrittenAnswersWorld();
const { WEEK_SHUT } = await w.loadTs("lib/courses/weekWork/words.ts");

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

/** Feedback at a level for every row of the rubric. */
const feedback = (comment = "x", level = "Solid") => ({ action: "feedback", levels: w.levels(level), comment });

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

describe("1. writing one's own answer, and sending it by submitting the week", () => {
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

    // Submitted, the week takes no change, refused inside the write's own transaction.
    w.at("2026-11-08T11:00:00Z");
    const shut = await w.write("chloe", 2, { text: words(27) });
    assert.deepEqual([shut.status, shut.body.error], [409, WEEK_SHUT]);
    assert.equal(stored("chloe", 2).words, 26);
    // Reopened, a change stores its own time; the first-sent time stays.
    assert.equal((await w.reopenWeek("rahul", "chloe", 2)).status, 200);
    assert.equal((await w.write("chloe", 2, { text: words(27) })).status, 200);
    assert.equal(iso(stored("chloe", 2).firstSentAt), iso(BEFORE_DUE_2));
    assert.equal(iso(stored("chloe", 2).editedAt), "2026-11-08T11:00:00.000Z");
    assert.equal(stored("chloe", 2).words, 27);
    // Submitting again sends nothing new and moves nothing about when it was first sent.
    w.at("2026-11-08T12:00:00Z");
    const again = await w.submitWeek("chloe", 2);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual(again.body.sent, []);
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
    // Once sent, every change after a reopen is held to the top.
    assert.equal((await w.reopenWeek("sofia", "chloe", 2)).status, 200);
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
    // Once Group A has met, Amara's own week takes no change, and nor does Sofia's, which locks with the first of her groups.
    w.at(BEFORE_DUE_2);
    for (const who of ["amara", "sofia"]) {
      const locked = await w.write(who, 2, { text: words(5) });
      assert.deepEqual([locked.status, locked.body.error], [409, WEEK_SHUT], who);
      assert.equal(stored(who, 2).words, 3, who);
    }
    assert.equal((await w.write("chloe", 2, { text: words(5) })).status, 200, "Group B has not met yet");
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
 * Amara in Group A, Chloe on time, Rahul as a facilitator, Farah late. The
 * clock is then the world's own, when every one of those weeks is shut.
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

describe("2. the gate: who gives feedback, who reopens, and the week's lock", () => {
  test("opening an answer locks nothing any more, and the review route takes feedback alone: the week locks, when it is submitted or its session starts", async () => {
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("chloe", 2, { text: words(25) }, { send: true })).status, 200);
    assert.equal((await w.write("kofi", 2, { text: words(3) })).status, 200);
    // The review page's opening stamp, and its Reopen for edits, are gone: refused before anything is read.
    const before = w.everything();
    for (const action of ["open", "reopen"]) {
      assert.deepEqual(await w.review("rahul", "chloe", 2, { action }), { status: 400, body: { error: "Say what to do: feedback." } }, action);
    }
    assert.equal(w.everything(), before, "nothing is stamped");
    // Submitted, Chloe's week takes no change, refused inside the write's own transaction.
    const submitted = await w.write("chloe", 2, { text: words(26) });
    assert.deepEqual([submitted.status, submitted.body.error], [409, WEEK_SHUT]);
    assert.equal(stored("chloe", 2).words, 25);
    // Kofi's draft still saves while his week is open; the group's session locks it, submitted or not.
    assert.equal((await w.write("kofi", 2, { text: words(4) })).status, 200);
    w.at(B_MEETS_2);
    const locked = await w.write("kofi", 2, { text: words(5) });
    assert.deepEqual([locked.status, locked.body.error], [409, WEEK_SHUT]);
    assert.equal(stored("kofi", 2).words, 4);
  });

  test("an answer opened before weeks were submitted keeps that one lock, in its own words, until its week is reopened", async () => {
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
    const locked = await w.write("farah", 2, { text: words(23) });
    assert.deepEqual(
      [locked.status, locked.body.error],
      [409, "This answer has been opened, so it can’t change now. Ask whoever opened it to reopen it if you need to."],
    );
    assert.equal(stored("farah", 2).words, 22);
    // Sent before weeks were submitted, it is its readers' to read while the week is open, and takes feedback.
    assert.equal((await w.review("sofia", "farah", 2, feedback("Read."))).status, 200);
  });

  test("feedback locks nothing either: the lead and admins give it on a submitted answer, and the week's own state decides what its writer may change", async () => {
    await sendFour();
    const sent = await w.review("claudia", "farah", 2, feedback("Good."));
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual([sent.body.state.openedAt, sent.body.state.openedByUid], [null, null]);
    assert.equal(stored("farah", 2).openedAt, undefined);
    assert.equal(stored("farah", 2).openedByUid, undefined);
    // The row's last save stays its writer's.
    assert.equal(iso(stored("farah", 2).updatedAt), iso(LATE_2));
    // Farah's week is submitted: that, and not the feedback, is why it can't change.
    assert.deepEqual((await w.write("farah", 2, { text: words(31) })).body.error, WEEK_SHUT);
    // An admin may give feedback too, on another answer.
    assert.equal((await w.review("zach", "chloe", 2, feedback(""))).status, 200);
    assert.equal(stored("chloe", 2).feedback.byUid, "zach");
  });

  test("a facilitator's own answer is the lead's and admins' to give feedback on and reopen: never a co-facilitator's, never their own", async () => {
    await sendFour();
    const before = w.everything();
    for (const who of ["rahul", "sofia"]) {
      assert.deepEqual(await w.review(who, "rahul", 2, feedback()), { status: 403, body: { error: "Forbidden" } }, who);
      assert.deepEqual(await w.reopenWeek(who, "rahul", 2), { status: 403, body: { error: "Forbidden" } }, who);
    }
    assert.equal(w.everything(), before);
    // An admin gives the feedback; the lead reopens the week, which hands it back to Rahul.
    assert.equal((await w.review("zach", "rahul", 2, feedback("", "Strong"))).status, 200);
    assert.equal((await w.write("rahul", 2, { text: words(23) })).status, 409, "submitted");
    assert.equal((await w.reopenWeek("claudia", "rahul", 2)).status, 200);
    assert.equal((await w.write("rahul", 2, { text: words(23) })).status, 200);
    assert.equal(stored("rahul", 2).feedback.byUid, "zach", "the feedback stays");
  });

  test("nobody gives feedback on, or reopens, their own: not the lead who also facilitates a group, not an admin", async () => {
    // Claudia leads the programme and facilitates Group C too, so Claudia writes an answer too.
    const groupC = w.world.db.read(`courseGroups/${C}`);
    w.world.db.poke(`courseGroups/${C}`, { facilitatorUids: [...groupC.facilitatorUids, "claudia"] });
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("claudia", 2, { text: words(22) }, { send: true })).status, 200);
    w.at(NOW);
    const before = w.everything();
    assert.deepEqual(await w.review("claudia", "claudia", 2, feedback("Mine.")), { status: 403, body: { error: "Forbidden" } });
    assert.deepEqual(await w.reopenWeek("claudia", "claudia", 2), { status: 403, body: { error: "Forbidden" } });
    assert.equal(w.everything(), before);
    // Tom, Group C's other facilitator, may not either; an admin may.
    assert.equal((await w.review("tom", "claudia", 2, feedback())).status, 403);
    assert.equal((await w.reopenWeek("tom", "claudia", 2)).status, 403);
    assert.equal(w.everything(), before);
    assert.equal((await w.review("zach", "claudia", 2, feedback())).status, 200);
    assert.equal(stored("claudia", 2).feedback.byUid, "zach");
    assert.equal((await w.reopenWeek("zach", "claudia", 2)).status, 200);
    assert.equal(w.weekWorkOf("claudia", 2).reopenedByUid, "zach");
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
      assert.deepEqual(await w.review(who, uid, 2, feedback()), { status: 403, body: { error: "Forbidden" } }, `${who} on ${uid}`);
      assert.deepEqual(await w.reopenWeek(who, uid, 2), { status: 403, body: { error: "Forbidden" } }, `${who} reopening ${uid}'s week`);
    }
    assert.equal(w.everything(), before);
    assert.equal((await w.review(null, "chloe", 2, feedback())).status, 401);
    assert.equal((await w.reopenWeek(null, "chloe", 2)).status, 401);
    assert.deepEqual(await w.review("rahul", "chloe", 2, feedback(), { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.deepEqual(await w.reopenWeek("rahul", "chloe", 2, { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(w.everything(), before, "a view-as session stamps nothing");
    // Sofia facilitates Group A too, so Amara's is Sofia's to give feedback on.
    assert.equal((await w.review("sofia", "amara", 2, feedback())).status, 200);
    assert.equal(stored("amara", 2).feedback.byUid, "sofia");
  });

  test("an answer its readers may not read yet takes no feedback: a draft in an open week, a week reopened; the session's lock opens it to them", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(3) });
    await w.write("chloe", 2, { text: words(25) }, { send: true });
    const draft = await w.review("rahul", "kofi", 2, feedback());
    assert.deepEqual([draft.status, draft.body.error], [409, "That answer hasn’t been submitted yet."]);
    assert.equal(stored("kofi", 2).feedback, undefined);
    // A body is checked before anything is read.
    assert.equal((await w.review("rahul", "chloe", 2, { action: "wave" })).status, 400);
    assert.equal((await w.review("rahul", "", 2, feedback())).status, 400);
    const noWeek = await w.call("rahul", w.routes.review.POST, { runId: RUN.agi, answerId: ONE_BOX.id }, { course: true, body: { uid: "chloe", ...feedback() } });
    assert.equal(noWeek.status, 400);
    // Group B's session locked Kofi's week with his draft unsent: his readers may now read it, and give feedback on it.
    w.at(NOW);
    assert.equal((await w.review("rahul", "kofi", 2, feedback("On the draft."))).status, 200);
    assert.equal(stored("kofi", 2).feedback.comment, "On the draft.");
    // A week reopened is unsent again: no feedback until it is submitted, or locks again at the next session.
    assert.equal((await w.reopenWeek("rahul", "chloe", 2)).status, 200);
    const reopened = await w.review("rahul", "chloe", 2, feedback());
    assert.deepEqual([reopened.status, reopened.body.error], [409, "That answer hasn’t been submitted yet."]);
    w.at("2026-11-17T18:00:00Z");
    assert.equal((await w.review("rahul", "chloe", 2, feedback())).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. Feedback, by the rubric, once, and one email
// ---------------------------------------------------------------------------

describe("3. feedback: a level for each row and a comment, never a mark, and one email", () => {
  test("feedback stores each level with its descriptor and who sent it, and emails the writer once that it is waiting", async () => {
    await sendFour();
    w.at("2026-11-17T10:05:00Z");
    const chosen = [
      { row: "A clear view", level: "Strong" },
      { row: "Reasons", level: "Solid" },
      { row: "The best objection", level: "Solid" },
      { row: "So what", level: "Not yet" },
    ];
    const sent = await w.review("rahul", "chloe", 2, { action: "feedback", levels: chosen, comment: "Clear steps. Say why." });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.emailed, true);
    const given = stored("chloe", 2).feedback;
    assert.deepEqual(given.levels, [
      { row: "A clear view", level: "Strong", descriptor: "States a view someone could dispute" },
      { row: "Reasons", level: "Solid", descriptor: "Gives reasons from the week" },
      { row: "The best objection", level: "Solid", descriptor: "Names one" },
      { row: "So what", level: "Not yet", descriptor: "No link to action" },
    ]);
    assert.equal(given.comment, "Clear steps. Say why.");
    assert.equal(given.byUid, "rahul");
    assert.equal(iso(given.sentAt), "2026-11-17T10:05:00.000Z");
    // Never a mark, a score or a total, anywhere on the row; and no lock stamped with it.
    assert.doesNotMatch(JSON.stringify(stored("chloe", 2)), /"(?:score|mark|marks|total|points)"/);
    assert.equal(stored("chloe", 2).openedAt, undefined);
    // One email, to Chloe's own address, saying only that feedback is waiting.
    assert.equal(w.world.mail.length, 1);
    const mail = w.world.mail[0];
    assert.equal(mail.to, "chloe@example.com");
    assert.equal(mail.subject, "Feedback on your week 2 written answer");
    assert.equal(mail.kind, "course-feedback");
    const html = JSON.stringify(mail.react);
    assert.match(html, /Rahul has left feedback on your lamp plan\./);
    assert.match(html, /https:\/\/naisi\.invalid\/learn\/[^"]+\/weeks\/2\/feedback/);
    assert.doesNotMatch(html, /Clear steps|Strong|Solid|Not yet/, "the feedback itself stays on the site");
    // Sent once: a second is refused and emails nobody.
    const again = await w.review("sofia", "chloe", 2, feedback("More."));
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "Feedback on this answer has already been sent.");
    assert.equal(w.world.mail.length, 1);
  });

  test("a level for every row, each one of the rubric's; a level the rubric does not have says the rubric changed", async () => {
    await sendFour();
    const short = await w.review("rahul", "chloe", 2, { action: "feedback", levels: w.levels().slice(0, 3), comment: "x" });
    assert.equal(short.status, 409);
    assert.equal(short.body.error, "Choose a level for “So what”.");
    const odd = await w.review("rahul", "chloe", 2, { action: "feedback", levels: [...w.levels().slice(0, 3), { row: "So what", level: "Excellent" }], comment: "x" });
    assert.equal(odd.status, 409);
    assert.match(odd.body.error, /The rubric changed while you were giving feedback/);
    assert.equal(stored("chloe", 2).feedback, undefined);
    assert.equal(w.world.mail.length, 0);
    const long = await w.review("rahul", "chloe", 2, { action: "feedback", levels: w.levels(), comment: words(301) });
    assert.equal(long.status, 400);
  });

  test("a course with no rubric takes the comment alone, and says why when there is none", async () => {
    await sendFour();
    w.world.db.poke(`courses/${COURSE.agi}`, { rubric: null });
    const levelsSent = await w.review("rahul", "chloe", 2, { action: "feedback", levels: w.levels(), comment: "x" });
    assert.equal(levelsSent.status, 409);
    const empty = await w.review("rahul", "chloe", 2, { action: "feedback", levels: [], comment: "" });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, "Write a short comment: this course has no rubric, so the comment is the feedback.");
    const sent = await w.review("rahul", "chloe", 2, { action: "feedback", levels: [], comment: "A comment alone." });
    assert.equal(sent.status, 200);
    assert.deepEqual(stored("chloe", 2).feedback.levels, []);
    // The pages say so: the review page offers the comment alone and says why; the week page names no rows.
    const page = await w.writtenPage("rahul", { week: "2", person: "farah" });
    assert.match(page.text, /The rubric This course has no rubric yet, so feedback here is a comment alone\. An admin can add one in the course’s details\./);
    assert.match(page.text, /Farah sees your comment\. There are no marks\./);
    assert.doesNotMatch(page.html, /aria-pressed/);
    // Kofi's week, while it is still open.
    w.at(BEFORE_DUE_2);
    const week = await w.weekPage("kofi", 2);
    assert.match(week.text, /Rahul and Sofia read it before your session and give feedback\. No marks\./);
    w.at(NOW);
    // The feedback page reads the comment alone.
    const page2 = await w.feedbackPage("chloe", 2);
    assert.match(page2.text, /There are no marks\. Rahul’s comment A comment alone\./);
  });

  test("a message that does not go undoes nothing, and the page is told", async () => {
    await sendFour();
    w.world.mailFate = () => "fail";
    const sent = await w.review("rahul", "chloe", 2, feedback("Kept."));
    assert.equal(sent.status, 200);
    assert.equal(sent.body.emailed, false);
    assert.equal(stored("chloe", 2).feedback.comment, "Kept.");
  });
});

// ---------------------------------------------------------------------------
// Late: shown to the answer's readers, from the group's own due moment
// ---------------------------------------------------------------------------

describe("Late, from the group's own calendar, and only for its readers", () => {
  test("first sent after the due moment is late; a cancelled session moves the due moment, and the lock, to the next one", async () => {
    await sendFour();
    const page = await w.writtenPage("rahul", { week: "2" });
    const model = page.element.props.model;
    const late = Object.fromEntries([...model.toGive, ...model.feedbackSent].map((person) => [person.uid, person.late]));
    assert.deepEqual(late, { chloe: false, farah: true });
    assert.match(page.text, /Farah Hussain Submitted Tue 10 Nov, 12pm Late/);

    // Group B's week 2 session cancelled: the work is due by the day before the next one, and locks when that one starts.
    w.reset();
    const group = w.world.db.read(`courseGroups/${B}`);
    w.world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { ...(group.sessionChanges ?? {}), w02: { kind: "cancelled", reason: "Room closed.", dateKey: "2026-11-10", byUid: "rahul", at: new Date("2026-11-05T09:00:00Z") } },
    });
    // The cancelled evening locked nothing: Kofi submits the next morning.
    w.at("2026-11-11T09:00:00Z");
    assert.equal((await w.write("kofi", 2, { text: words(25) }, { send: true })).status, 200);
    w.at("2026-11-16T12:30:00Z");
    assert.equal((await w.write("farah", 2, { text: words(25) }, { send: true })).status, 200);
    w.at(NOW);
    const moved = (await w.writtenPage("rahul", { week: "2" })).element.props.model;
    assert.deepEqual(
      Object.fromEntries(moved.toGive.map((person) => [person.uid, person.late])),
      { kofi: false, farah: true },
      "due by noon on Mon 16 Nov, the day before the next session",
    );
    // And the next session locks it: Chloe, who wrote nothing, can no longer start.
    w.at("2026-11-17T18:00:00Z");
    assert.deepEqual((await w.write("chloe", 2, { text: words(25) })).body.error, WEEK_SHUT);
  });
});

// ---------------------------------------------------------------------------
// 4. The pages
// ---------------------------------------------------------------------------

describe("4. the pages, as the boards draw them", () => {
  test("the week page draws the written answer for a fellow: the question, the box, the count, the due line, who reads it and from when, and the week's Submit", async () => {
    w.at(BEFORE_DUE_2);
    const page = await w.weekPage("chloe", 2);
    inOrder(page.text, [
      "Who keeps the lamps",
      "Your session: Tue 10 Nov, 6pm, Hallward B12. This week locks when it starts.",
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
      "Due by noon, Mon 9 Nov. Rahul and Sofia read it before your session and give feedback on four things: a clear view, reasons, the best objection, and so what. No marks.",
      "Once you submit, or your week locks, Rahul, Sofia, Claudia and admins can read your written answer.",
      "Other fellows can’t.",
      "Submit week 2",
      "Submitting locks your work for this week.",
    ]);
    assert.match(page.html, /<label for="[^"]+" class="label">Your answer<\/label><textarea id="[^"]+" class="box answerBox" rows="8">/);
    assert.doesNotMatch(page.text, /\bLate\b|exercise/i);
    // Sent by submitting the week, never on its own; and nothing on the page locks when somebody opens it.
    assert.doesNotMatch(page.text, /Send to|opens it|opened it/);
    assert.doesNotMatch(page.html, /readOnly=""|readonly=""/);
    // Nothing sent, nothing ticked: neither task is done.
    assert.match(page.text, /0 of 2 done/);
    // A draft is not sent: the task stays open.
    await w.write("chloe", 2, { text: words(25) });
    assert.match((await w.weekPage("chloe", 2)).text, /0 of 2 done/);
  });

  test("once submitted the week page says so and is read only; Feedback from leads to the feedback; a reopen hands it back, the feedback kept", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("chloe", 2, { text: words(25) }, { send: true });
    w.at(NOW);
    let page = await w.weekPage("chloe", 2);
    inOrder(page.text, [
      "Submitted Sun 8 Nov, 10am. Your work for this week is locked.",
      "Submitted",
      "1 of 2 done",
      "Ask Rahul or Sofia if you need it reopened.",
      "Done",
      "Submitted Sun 8 Nov",
      "25 words · 20 to 40",
      "Submitted Sun 8 Nov, 10am.",
      "Once you submit, or your week locks, Rahul, Sofia, Claudia and admins can read your written answer.",
    ]);
    assert.match(page.text, /1 of 2 done/, "the task that covers the written answer is done once the week is submitted");
    assert.match(page.html, /readOnly=""|readonly=""/);
    assert.doesNotMatch(page.text, /Submit week 2|Saved as you go/);

    w.at("2026-11-17T10:05:00Z");
    await w.review("rahul", "chloe", 2, feedback("Clear."));
    page = await w.weekPage("chloe", 2);
    assert.match(page.html, /href="\/learn\/[^"]+\/weeks\/2\/feedback"[^>]*>Feedback from Rahul<\/a>/);
    assert.doesNotMatch(page.text, /\bLate\b/);

    // Reopened: it takes writing again until it is submitted or the group's next session starts, and the feedback stays.
    w.at(NOW);
    assert.equal((await w.reopenWeek("sofia", "chloe", 2)).status, 200);
    page = await w.weekPage("chloe", 2);
    assert.match(page.text, /Sofia reopened this week for you\. It locks again when you submit it, or at your next session, Tue 17 Nov, 6pm\./);
    assert.match(page.text, /1 of 2 done Saved as you go/);
    assert.doesNotMatch(page.html, /readOnly=""|readonly=""/);
    assert.match(page.text, /Submit week 2/);
    assert.match(page.html, />Feedback from Rahul<\/a>/);
  });

  test("a week its session locked before it was submitted: read only, what was saved and when, and who may now read it", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(3, "beacon") });
    w.at(NOW);
    const page = await w.weekPage("kofi", 2);
    inOrder(page.text, [
      "Locked when your session started on Tue 10 Nov, 6pm.",
      "Locked",
      "0 of 2 done",
      "You didn’t submit this week, but everything you wrote was saved and Rahul and Sofia can read it.",
      "Ask Rahul or Sofia if you need it reopened.",
      // This week's row and the part's chip alike: never sent, and no draft any more.
      "Not submitted",
      "Not submitted",
      "beacon beacon beacon",
      "3 words · 20 to 40",
      "3 words, saved Sun 8 Nov.",
    ]);
    assert.doesNotMatch(page.text, /Draft|Submit week 2|Saved as you go/);
    assert.match(page.html, /readOnly=""|readonly=""/);
  });

  test("an answer opened before weeks were submitted says who opened it and stays read only, in an open week", async () => {
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
    assert.match(page.text, /Your session: Tue 17 Nov, 6pm, Hallward B12\. This week locks when it starts\./);
    assert.match(page.text, /Rahul opened it on Mon 16 Nov at 9:58am, so it can’t change now\./);
    assert.match(page.html, /readOnly=""|readonly=""/);
  });

  test("a facilitator writing their own answer is told the lead and admins read it once they submit; an admin reads the question with no box and no Submit", async () => {
    w.at(BEFORE_DUE_2);
    const rahul = await w.weekPage("rahul", 2);
    inOrder(rahul.text, [
      "Your session: Tue 10 Nov, 6pm, Hallward B12. This week locks when it starts.",
      "Due by noon, Mon 9 Nov. Claudia and admins read it and give feedback on four things",
      "Once you submit, or your week locks, Claudia and admins can read your written answer.",
      "Nobody else on the programme can read it, your co-facilitators included.",
      "Submit week 2",
    ]);
    assert.doesNotMatch(rahul.text, /Send to|opens it/);
    const zach = await w.weekPage("zach", 2);
    assert.match(zach.text, /Who should keep the lamps lit, and why\?/);
    assert.doesNotMatch(zach.html, /class="box answerBox"/);
    assert.doesNotMatch(zach.text, /Submit week|This week locks|Send to/);
  });

  test("an answer in labelled boxes is drawn box by box, each with its label and hint, sent together by the week's Submit", async () => {
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
      "Submit week 3",
    ]);
    assert.equal((page.html.match(/class="box answerBox"/g) ?? []).length, 3);
    assert.match(page.html, /<fieldset class="boxes"><legend class="label">Your answer<\/legend>/);
  });

  test("the programme page's task row reads Draft, then Submitted, then Feedback from whoever gave it; Not submitted once the week locked first", async () => {
    await w.write("chloe", 3, { boxes: { "wb-what": words(5) } });
    let home = await w.programmeHome("chloe");
    assert.match(home.text, /Your written answer Draft · 5 words/);
    assert.match(home.text, /0 of 2 done/);
    await w.write("chloe", 3, { boxes: { "wb-what": words(5) } }, { send: true });
    home = await w.programmeHome("chloe");
    assert.match(home.text, /Your written answer Submitted Tue 17 Nov/);
    assert.match(home.text, /1 of 2 done/, "the programme page counts a submitted answer done, from the overview's own rows");
    await w.review("sofia", "chloe", 3, feedback(""));
    home = await w.programmeHome("chloe");
    assert.match(home.html, /Submitted Tue 17 Nov <a href="\/learn\/[^"]+\/weeks\/3\/feedback" class="cardLink">Feedback from Sofia<span aria-hidden="true">→<\/span><\/a>/);

    // Amara's week 3 locked when Group A met on Thursday, with her draft unsent.
    w.at("2026-11-11T10:00:00Z");
    await w.write("amara", 3, { boxes: { "wb-what": words(4) } });
    w.at(NOW);
    home = await w.programmeHome("amara");
    assert.match(home.text, /Your written answer Not submitted/);
    assert.doesNotMatch(home.text, /Draft · 4 words/);
    // Its readers may give feedback on it now, and the row leads to it.
    assert.equal((await w.review("sofia", "amara", 3, feedback("On what you had."))).status, 200);
    home = await w.programmeHome("amara");
    assert.match(home.html, /Not submitted <a href="\/learn\/[^"]+\/weeks\/3\/feedback" class="cardLink">Feedback from Sofia<span aria-hidden="true">→<\/span><\/a>/);
  });

  test("the review page: a facilitator sees their group's fellows, never a facilitator's own; grouped as the board groups them; nothing unsubmitted is read", async () => {
    await sendFour();
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(4, "beacon") });
    // Tue 10 Nov at 1pm: Farah has submitted late, and Group B has not met yet.
    w.at("2026-11-10T13:00:00Z");
    const page = await w.writtenPage("rahul", { week: "2" });
    const model = page.element.props.model;
    assert.deepEqual(model.toGive.map((person) => person.uid), ["chloe", "farah"]);
    assert.deepEqual(model.notSent.map((person) => [person.uid, person.state, person.readable, person.words]), [["kofi", "draft", false, 0]]);
    assert.equal(model.selected.person.uid, "chloe");
    inOrder(page.text, [
      "Group B · Week 2 · Written answers",
      "Chloe Nguyen’s lamp plan",
      "Previous",
      "Next: Farah",
      "Written answers",
      "Week 2",
      "To give feedback on",
      "2",
      "Chloe Nguyen",
      "Submitted Sun 8 Nov, 10am",
      "Farah Hussain",
      "Submitted Tue 10 Nov, 12pm",
      "Late",
      "Feedback sent",
      "0",
      "Not submitted yet",
      "1",
      "Kofi Asante",
      "Started",
      "The question · 20 to 40 words",
      "Who should keep the lamps lit, and why?",
      "Show all of it",
      "Chloe’s answer",
      "25 words · 20 to 40",
      "Submitted Sun 8 Nov, 10am",
      "Submitted Sun 8 Nov, 10am, so Chloe can’t change it now.",
      "Reopen week 2 for Chloe",
      "The rubric",
      "A clear view",
      "Not yet",
      "Solid",
      "Strong",
      "A short comment",
      "What worked, what to try next. Short and specific beats long.",
      "0 words",
      "Send feedback to Chloe",
      "Emails Chloe that feedback is waiting. The feedback stays on the site.",
      "Chloe sees the four levels and your comment. There are no marks.",
      "The email Chloe gets",
      "Feedback on your week 2 written answer",
      "Reply to",
      "ai-safety@uonsu.com",
      "Rahul has left feedback on your lamp plan.",
      "Read your feedback",
    ]);
    // Never a word of an unsubmitted draft, nor how long it is (privacy v15).
    assert.ok(!page.html.includes("beacon"), "the review page shows Kofi's unsubmitted draft");
    assert.doesNotMatch(page.text, /Kofi Asante 4 words|Kofi’s answer/);
    // His own answer would be drawn as "Rahul’s answer" under "Rahul’s lamp
    // plan" (the name he goes by, which the email preview above uses too).
    assert.doesNotMatch(page.text, /Rahul’s answer|Rahul’s lamp plan|Amara/, "a facilitator's own answer and another group's are not on the page");
    assert.match(page.html, /aria-pressed="false"/);
    // Sofia, the co-facilitator, does not get Rahul's either.
    const sofia = (await w.writtenPage("sofia", { week: "2" })).element.props.model;
    assert.ok(![...sofia.toGive, ...sofia.feedbackSent, ...sofia.notSent].some((person) => person.uid === "rahul"));

    // Once the session locked Kofi's week, his draft is its readers' to read, and waits from the lock, oldest first.
    w.at(NOW);
    const locked = await w.writtenPage("rahul", { week: "2", person: "kofi" });
    assert.deepEqual(locked.element.props.model.toGive.map((person) => person.uid), ["chloe", "farah", "kofi"]);
    assert.deepEqual(locked.element.props.model.notSent, []);
    inOrder(locked.text, [
      "Kofi Asante",
      "Locked Tue 10 Nov, 6pm, not submitted",
      "Kofi’s answer",
      "4 words · 20 to 40",
      "beacon beacon beacon beacon",
      "Locked when the session started, Tue 10 Nov, 6pm. Kofi didn’t submit it.",
      "Reopen week 2 for Kofi",
    ]);
    // Opened with nobody asked for, the page opens on the oldest waiting.
    assert.equal((await w.writtenPage("rahul", { week: "2" })).element.props.model.selected.person.uid, "chloe");
  });

  test("a week reopened reads Reopened, not submitted again, on the review page, and none of its words", async () => {
    await sendFour();
    assert.equal((await w.reopenWeek("rahul", "farah", 2)).status, 200);
    const page = await w.writtenPage("rahul", { week: "2", person: "farah" });
    const model = page.element.props.model;
    assert.deepEqual(model.toGive.map((person) => person.uid), ["chloe"]);
    // Kofi wrote nothing, so his week locked with nothing to read: not started.
    assert.deepEqual(model.notSent.map((person) => [person.uid, person.week.state, person.words]), [["farah", "reopened", 0], ["kofi", "locked", 0]]);
    assert.equal(model.selected.person.uid, "chloe", "the page does not open a reopened answer");
    inOrder(page.text, ["Not submitted yet", "2", "Farah Hussain", "Reopened, not submitted again", "Kofi Asante", "Not started"]);
    assert.ok(!page.html.includes(words(30)), "the review page shows Farah's reopened answer");
  });

  test("the lead's review page gives the facilitator's own answer to the lead, with its Reopen; the page writes nothing", async () => {
    await sendFour();
    const page = await w.leadPage("claudia", { group: B, week: "2", person: "rahul" });
    const model = page.element.props.model;
    assert.deepEqual(model.toGive.map((person) => person.uid).sort(), ["chloe", "farah", "rahul"]);
    assert.equal(model.selected.person.uid, "rahul");
    assert.equal(model.selected.role.mayReview, true);
    assert.match(page.text, /Rahul’s lamp plan/);
    assert.match(page.text, /Submitted Sun 8 Nov, 10am, so Rahul can’t change it now\. Reopen week 2 for Rahul/);
    assert.equal(page.wrote, false, "a GET never writes, and opening an answer stamps nothing");
    // The lead's page for another programme's lead, and for a fellow: nothing of it.
    const tess = await w.leadPage("tess", { group: B, week: "2" });
    assert.doesNotMatch(tess.text, /lamp plan/);
    // Signed out: the admissions tree's own gate sends them away before the page (the app's layout reaches /login first).
    const signedOut = await w.leadPage(null);
    assert.ok(signedOut.to && !/lamp plan/.test(signedOut.text), JSON.stringify(signedOut.to));
  });

  test("A10: the lead chooses the group on the page, with the Attendance tab's own control; a facilitator's page has none", async () => {
    await sendFour();
    const LEAD_WRITTEN = `/admin/admissions/forms/${ROUND}/programmes/${AGI}/written`;
    /** The page's choice of group: each pill's name, its tag, its address, and whether it is the one shown. */
    const pillsOf = (html) => {
      const nav = /<nav class="groupLinks" aria-labelledby="([^"]+)"><span id="\1" class="groupLinksLabel">Group<\/span>([\s\S]*?)<\/nav>/.exec(html);
      assert.ok(nav, "no choice of group on the page");
      return [...nav[2].matchAll(/<a href="([^"]+)" class="([^"]+)" aria-label="([^"]+)"( aria-current="page")?>([^<]+)<\/a>/g)].map((m) => [
        m[3],
        m[5],
        m[1],
        m[2].includes("groupLinkCurrent") && m[4] !== undefined,
      ]);
    };
    // Every group of the run that still meets, in the order the Attendance tab lists them (by meeting), each that
    // group's own page here, which opens on its own week; the group shown marked. The lead and an admin alike.
    const expected = (shown) =>
      [["Group D", "D", "agi-autumn-2026-mondays__grp00004"], ["Group B", "B", B], ["Group C", "C", C], ["Group A", "A", A]].map(([name, tag, id]) => [
        name,
        tag,
        `${LEAD_WRITTEN}?group=${id}`,
        id === shown,
      ]);
    for (const who of ["claudia", "zach"]) {
      assert.deepEqual(pillsOf((await w.leadPage(who, { group: B, week: "2" })).html), expected(B), who);
    }
    // Opened with no group, it shows the first, and the pills say which.
    const first = await w.leadPage("claudia");
    assert.deepEqual(pillsOf(first.html), expected("agi-autumn-2026-mondays__grp00004"));
    assert.match(first.text, /Group D · Week 3 · Written answers/);
    // A pill opens that group's page: Group A's answers, and only Group A's.
    const a = await w.leadPage("claudia", { group: A });
    assert.deepEqual(pillsOf(a.html), expected(A));
    assert.equal(a.element.props.model.group.id, A);
    // A facilitator's review page is the one group's own: nothing to choose.
    assert.doesNotMatch((await w.writtenPage("rahul", { week: "2" })).html, /groupLinks/);
  });

  test("who reaches the group's review page at all", async () => {
    await sendFour();
    for (const who of ["chloe", "farah", "amara", "tess", "una", "sam"]) {
      const page = await w.writtenPage(who, { week: "2" });
      assert.ok(page.to?.startsWith("/learn"), `${who} reached it: ${page.text.slice(0, 80)}`);
    }
    assert.equal((await w.writtenPage(null)).to, "/login");
    for (const who of ["rahul", "sofia", "zach"]) assert.equal((await w.writtenPage(who, { week: "2" })).to, null, who);
  });

  test("the feedback page: the writer's own answer, each level with its descriptor, the comment and who gave it; never Late", async () => {
    // Kofi's draft, which Group B's session locks unsent.
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(3) });
    await sendFour();
    w.at("2026-11-17T10:05:00Z");
    await w.review("rahul", "farah", 2, feedback("Good steps.", "Strong"));
    w.at(NOW);
    const page = await w.feedbackPage("farah", 2);
    inOrder(page.text, [
      "Week 2",
      "Feedback",
      "Week 2 · Your written answer",
      "Feedback on your lamp plan",
      "From Rahul · Tue 17 Nov, 10:05am",
      "A clear view",
      "Strong",
      "States a view someone could dispute",
      "So what",
      "Strong",
      "Says who should do what",
      "There are no marks. The four levels are the rubric on Start here.",
      "Rahul’s comment",
      "Good steps.",
      "Your answer",
      "30 words · submitted Tue 10 Nov, 12pm",
    ]);
    // Feedback locks nothing: no line says anybody opened it.
    assert.doesNotMatch(page.text, /opened it|can’t change now/);
    assert.doesNotMatch(page.text, /\bLate\b|\bmark\b(?!s)/);
    // Before any feedback: who gives it. Before submitting: the way back to the week.
    assert.match((await w.feedbackPage("chloe", 2)).text, /No feedback yet\. Rahul and Sofia give feedback once they’ve read it\./);
    assert.match((await w.feedbackPage("kofi", 2)).text, /You haven’t submitted this answer yet\. It’s on the week’s page\./);
    assert.match((await w.feedbackPage("rahul", 2)).text, /No feedback yet\. Claudia and admins give feedback once they’ve read it\./);
    // Nobody reads anybody else's here: Chloe's page is Chloe's.
    assert.doesNotMatch((await w.feedbackPage("chloe", 2)).text, /Good steps/);
    for (const who of ["claudia", "tess", "sam", "una"]) assert.ok((await w.feedbackPage(who, 2)).to, who);

    // Feedback on Kofi's draft, which his week locked unsent: the email leads here, and here it is.
    assert.equal((await w.review("rahul", "kofi", 2, feedback("Finish the last line."))).status, 200);
    const kofi = await w.feedbackPage("kofi", 2);
    inOrder(kofi.text, ["From Rahul · Tue 17 Nov, 12pm", "Rahul’s comment", "Finish the last line.", "Your answer", "3 words", "lamp lamp lamp"]);
    assert.doesNotMatch(kofi.text, /You haven’t submitted this answer yet|submitted Tue/);
  });

  test("the group page's review queue lists what waits, oldest first; Home counts it; the lead's tab lists each group", async () => {
    await sendFour();
    const group = await w.groupPage("rahul");
    inOrder(group.text, ["Review queue", "Written answers", "2 to give feedback on", "Chloe Nguyen", "Submitted Sun 8 Nov, 10am", "Give feedback", "Farah Hussain", "Submitted Tue 10 Nov, 12pm", "Give feedback"]);
    assert.match(group.html, /href="\/learn\/[^"]+\/group\/[^"]+\/written\?week=2&amp;person=chloe"/);
    assert.doesNotMatch(group.text.slice(group.text.indexOf("Review queue"), group.text.indexOf("Review queue") + 400), /\bRahul\b/);
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
    const home = await w.home("rahul");
    assert.match(home.text, /2 to give feedback on Give feedback/);
    assert.match(home.html, /href="\/learn\/[^"]+\/group\/[^"]+\/written\?week=2&amp;person=chloe"/);
    // The lead's Attendance tab: a line per group, the facilitator's own answer counted for the lead.
    const tab = await w.attendanceTab("claudia");
    assert.match(tab.text, /Written answers .*Group B 3 to give feedback on Give feedback/);
    // Feedback sent takes it off the queue.
    await w.review("rahul", "chloe", 2, feedback());
    assert.equal((await w.summary("rahul")).body.writtenToGive, 1);
  });

  test("the queue waits only for answers their readers may read: a draft in an open week for nobody, a week locked unsent from its lock", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("kofi", 2, { text: words(4) });
    assert.equal((await w.summary("rahul")).body.writtenToGive, 0, "a draft in a week still open waits for nobody");
    w.at(NOW);
    const group = await w.groupPage("rahul");
    inOrder(group.text, ["Review queue", "Written answers", "1 to give feedback on", "Kofi Asante", "Locked Tue 10 Nov, 6pm, not submitted", "Give feedback"]);
    assert.deepEqual((await w.summary("rahul")).body.writtenNext, { weekNumber: 2, uid: "kofi" });
    // A week reopened is unsent again, and waits for nobody until it is submitted again.
    assert.equal((await w.reopenWeek("rahul", "kofi", 2)).status, 200);
    assert.equal((await w.summary("rahul")).body.writtenToGive, 0);
    assert.equal((await w.submitWeek("kofi", 2)).status, 200);
    assert.equal((await w.summary("rahul")).body.writtenToGive, 1);
    inOrder((await w.groupPage("rahul")).text, ["Kofi Asante", "Submitted Tue 17 Nov, 12pm", "Give feedback"]);
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
    // The summer's review page sends a week written as blocks to the written answers page.
    assert.match((await w.oldReviewPage("rahul", { week: "2" })).to, /\/written\?week=2$/);
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
    const { normalizeRubric, rubricProblems, rubricOf, givenLevelsOf } = w.lib.rubric;
    assert.deepEqual(rubricOf({ rubric: RUBRIC }), RUBRIC);
    assert.equal(rubricOf({ rubric: { levels: ["One"], rows: [{ name: "A", descriptors: ["x"] }] } }), null, "one level is nothing to choose between");
    assert.equal(normalizeRubric("not a rubric"), null);
    assert.deepEqual(rubricProblems({ levels: ["A", "A"], rows: [{ name: "R", descriptors: ["x", ""] }] }), [
      "Two levels are called “A”. Give each its own name.",
      "“R” has no description for A. Write one in that cell.",
    ]);
    assert.deepEqual(givenLevelsOf(RUBRIC, w.levels("Solid")).levels.map((level) => level.level), ["Solid", "Solid", "Solid", "Solid"]);
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

  test("the email's words come from records, and it is the transactional kind with no feedback in it", () => {
    const said = w.lib.email.writtenFeedbackWords({ weekNumber: 3, byFirstName: "Rahul", answerName: "your threat model" });
    assert.deepEqual(said, {
      subject: "Feedback on your week 3 written answer",
      lead: "Rahul has left feedback on your threat model.",
      buttonLabel: "Read your feedback",
    });
    assert.equal(w.lib.email.feedbackPageUrl("https://naisi.invalid", RUN.agi, 3), `https://naisi.invalid/learn/${encodeURIComponent(RUN.agi)}/weeks/3/feedback`);
    assert.equal(w.lib.model.answerNameOf("Your threat model, the week’s written answer"), "your threat model");
    assert.equal(w.lib.model.answerNameOf("Part four"), "your written answer");
  });

  test("never the word exercise for the written answer, and no dash, in its words; an answer is submitted, never sent, where its writer reads it", () => {
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
      [said.SENT, said.sentLineWords(at), said.sentOnWords(at), said.sentMetaWords(266, at), said.listSentWords(at), said.NOT_SENT_YET],
      ["Submitted", "Submitted Mon 16 Nov, 10:42pm.", "Submitted Mon 16 Nov", "266 words · submitted Mon 16 Nov, 10:42pm", "Submitted Mon 16 Nov, 10:42pm", "Not submitted yet"],
    );
    assert.equal(said.sentMetaWords(3, null), "3 words");
    assert.equal(said.listLockedWords(at), "Locked Mon 16 Nov, 10:42pm, not submitted");
  });
});
