/**
 * The week's written answer, its review and its feedback (boards wk-week,
 * wk-week-phone, wk-review, wk-review-phone, wk-feedback-phone, wk-fac-group,
 * wk-programme, en-finish; Q30 C, Q33, Q34 B; Zach on Mon 26 Oct: a
 * facilitator's own answer is the lead's and admins' to read and give
 * feedback on).
 *
 * Driven through the real routes and the real pages, as every kind of
 * caller: Chloe, a fellow of Group B; Farah, another fellow of Group B;
 * Amara, a fellow of Group A; Rahul, Group B's facilitator, who writes his
 * own answer too; Sofia, his co-facilitator (and Group A's facilitator);
 * Claudia, the programme's lead; Tess, who leads another programme; Zach, an
 * admin; Una, placed and not told; Sam, who left; Omar, taken off; a view-as
 * session; and somebody signed out.
 *
 *  1. Writing and sending: who may write, their own answer only; the
 *     first-sent time stored once; a change after it stamped; the range's
 *     top a limit; the labelled boxes sent together.
 *  2. The gate: who may open, reopen and give feedback; the lock; Late.
 *  3. Feedback: the rubric, once, the one email; a course with no rubric.
 *  4. The pages: the week page, the review page (the group's and the
 *     lead's), the feedback page, the group page's review queue, Home, the
 *     programme page's task row.
 *  5. The summer's answers still read, and are never given a verdict here.
 *  6. Finishing's column, the rubric's setting, the email's words and class.
 *
 * Every word in the weeks and the rubric is made up; every address is on
 * example.com.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { B, BOXES, COURSE, NOW, ONE_BOX, RUBRIC, RUN, makeWrittenAnswersWorld } from "./lib/writtenAnswersWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWrittenAnswersWorld();

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

/** Before week 2's due moment (noon, Mon 9 Nov): Sun 8 Nov at 10am. */
const BEFORE_DUE_2 = "2026-11-08T10:00:00Z";

// ---------------------------------------------------------------------------
// 1. Writing and sending
// ---------------------------------------------------------------------------

describe("1. writing and sending one's own answer", () => {
  test("a fellow saves a draft as they type, then sends it once: the first-sent time is stored and never moves", async () => {
    w.at(BEFORE_DUE_2);
    const draft = await w.write("chloe", 2, { text: words(25) });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal(stored("chloe", 2).words, 25);
    assert.equal(stored("chloe", 2).firstSentAt, undefined);
    assert.equal(stored("chloe", 2).submittedAt, null);
    assert.equal(draft.body.response.written.firstSentAt, null);

    const sent = await w.write("chloe", 2, { text: words(26) }, { send: true });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const first = stored("chloe", 2).firstSentAt;
    assert.equal(new Date(first).toISOString(), new Date(BEFORE_DUE_2).toISOString());
    assert.equal(new Date(stored("chloe", 2).submittedAt).toISOString(), new Date(BEFORE_DUE_2).toISOString());

    // A change after sending stores its own time; the first-sent time stays.
    w.at("2026-11-08T11:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: words(27) })).status, 200);
    assert.equal(new Date(stored("chloe", 2).firstSentAt).toISOString(), new Date(BEFORE_DUE_2).toISOString());
    assert.equal(new Date(stored("chloe", 2).editedAt).toISOString(), "2026-11-08T11:00:00.000Z");
    assert.equal(stored("chloe", 2).words, 27);
    // Sending again changes nothing about when it was first sent.
    w.at("2026-11-08T12:00:00Z");
    assert.equal((await w.write("chloe", 2, { text: words(27) }, { send: true })).status, 200);
    assert.equal(new Date(stored("chloe", 2).firstSentAt).toISOString(), new Date(BEFORE_DUE_2).toISOString());
    // Words are stored, never a count of characters, and summer's fields keep their meaning.
    assert.equal(stored("chloe", 2).reviewStatus, "unreviewed");
    assert.equal(stored("chloe", 2).kind, undefined);
  });

  test("the top of the range is a limit for what is sent and for every change after; the bottom is not", async () => {
    // A draft may run over while it is written.
    assert.equal((await w.write("chloe", 2, { text: words(45) })).status, 200);
    const over = await w.write("chloe", 2, { text: words(45) }, { send: true });
    assert.equal(over.status, 400);
    assert.equal(over.body.error, "That’s 45 words. The limit is 40: cut it to 40 or fewer to send it.");
    assert.equal(stored("chloe", 2).firstSentAt, undefined);
    // Under the bottom is sent: "a sharp 200 words beats a padded 400".
    assert.equal((await w.write("chloe", 2, { text: words(5) }, { send: true })).status, 200);
    const after = await w.write("chloe", 2, { text: words(41) });
    assert.equal(after.status, 400);
    assert.equal(after.body.error, "That’s 41 words, over the limit of 40, so this change isn’t saved. Cut it to 40 or fewer.");
    assert.equal(stored("chloe", 2).words, 5);
    // Nothing written is nothing sent, and a sent answer cannot be emptied.
    assert.equal((await w.write("farah", 2, { text: "  " }, { send: true })).body.error, "Write your answer before sending it.");
    assert.equal((await w.write("chloe", 2, { text: "" })).body.error, "A sent answer can’t be empty. Write it again, or leave it as it was.");
  });

  test("an answer in labelled boxes is written box by box and sent together; the wrong shape is refused", async () => {
    const boxes = { "wb-what": words(6), "wb-who": "Ada", "wb-next": words(3) };
    const sent = await w.write("chloe", 3, { boxes }, { send: true });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(stored("chloe", 3).boxes, boxes);
    assert.equal(stored("chloe", 3).words, 10);
    assert.equal(stored("chloe", 3).text, undefined);
    assert.equal((await w.write("farah", 3, { text: "One box." })).body.error, "This answer is written in its boxes: send each box.");
    assert.equal((await w.write("farah", 3, { boxes: { "wb-gone": "x" } })).body.error, "One of those boxes isn’t on this answer any more. Reload the page.");
    assert.equal((await w.write("farah", 2, { boxes: { "wb-what": "x" } })).body.error, "This answer is one box: send it as text.");
  });

  test("who may write: their own answer, while taking part; a facilitator writes their own; everybody else is refused", async () => {
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
// 2. Who opens, reopens and reads: the one gate
// ---------------------------------------------------------------------------

/** Chloe sends on time, Farah late, Rahul his own, Amara hers in Group A. */
async function sendFour() {
  w.at(BEFORE_DUE_2);
  assert.equal((await w.write("chloe", 2, { text: words(25) }, { send: true })).status, 200);
  assert.equal((await w.write("rahul", 2, { text: words(22) }, { send: true })).status, 200);
  assert.equal((await w.write("amara", 2, { text: words(21) }, { send: true })).status, 200);
  w.at(NOW);
  assert.equal((await w.write("farah", 2, { text: words(30) }, { send: true })).status, 200);
}

describe("2. the gate: who opens an answer, who reopens it, and the lock", () => {
  test("a group's facilitator opening a fellow's answer locks it, once, and its writer can no longer change it", async () => {
    await sendFour();
    w.at("2026-11-17T09:58:00Z");
    const opened = await w.review("rahul", "chloe", 2, { action: "open" });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.equal(opened.body.state.openedByUid, "rahul");
    assert.equal(new Date(stored("chloe", 2).openedAt).toISOString(), "2026-11-17T09:58:00.000Z");
    // The first to open stays: a co-facilitator opening later changes nothing.
    w.at("2026-11-17T10:30:00Z");
    assert.equal((await w.review("sofia", "chloe", 2, { action: "open" })).status, 200);
    assert.equal(stored("chloe", 2).openedByUid, "rahul");
    // Locked against its writer, inside the write's own transaction.
    const locked = await w.write("chloe", 2, { text: words(26) });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.error, "This answer has been opened, so it can’t change now. Ask whoever opened it to reopen it if you need to.");
    assert.equal(stored("chloe", 2).words, 25);
  });

  test("the lead and admins read a fellow's answer without locking it; sending feedback locks it whoever sends it", async () => {
    await sendFour();
    assert.equal((await w.review("claudia", "farah", 2, { action: "open" })).status, 200);
    assert.equal((await w.review("zach", "farah", 2, { action: "open" })).status, 200);
    assert.equal(stored("farah", 2).openedAt, undefined);
    assert.equal((await w.write("farah", 2, { text: words(31) })).status, 200, "still Farah's to change");
    const sent = await w.review("claudia", "farah", 2, { action: "feedback", levels: w.levels(), comment: "Good." });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(stored("farah", 2).openedByUid, "claudia");
    assert.equal((await w.write("farah", 2, { text: words(32) })).status, 409);
  });

  test("a facilitator's own answer is the lead's and admins' to open and review: never a co-facilitator's, never their own", async () => {
    await sendFour();
    const before = w.everything();
    for (const who of ["rahul", "sofia"]) {
      assert.deepEqual(await w.review(who, "rahul", 2, { action: "open" }), { status: 403, body: { error: "Forbidden" } }, who);
      assert.deepEqual(await w.review(who, "rahul", 2, { action: "feedback", levels: w.levels(), comment: "x" }), { status: 403, body: { error: "Forbidden" } }, who);
    }
    assert.equal(w.everything(), before);
    // The lead's opening locks it, as a facilitator's locks a fellow's.
    assert.equal((await w.review("claudia", "rahul", 2, { action: "open" })).status, 200);
    assert.equal(stored("rahul", 2).openedByUid, "claudia");
    assert.equal((await w.write("rahul", 2, { text: words(23) })).status, 409);
    // An admin may send the feedback.
    assert.equal((await w.review("zach", "rahul", 2, { action: "feedback", levels: w.levels("Strong"), comment: "" })).status, 200);
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
      const answer = await w.review(who, uid, 2, { action: "open" });
      assert.deepEqual(answer, { status: 403, body: { error: "Forbidden" } }, `${who} on ${uid}`);
    }
    assert.equal(w.everything(), before);
    assert.equal((await w.review(null, "chloe", 2, { action: "open" })).status, 401);
    assert.deepEqual(await w.review("rahul", "chloe", 2, { action: "open" }, { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(w.everything(), before, "a view-as session stamps nothing");
    // Sofia facilitates Group A too, so Amara's is hers to open.
    assert.equal((await w.review("sofia", "amara", 2, { action: "open" })).status, 200);
    assert.equal(stored("amara", 2).openedByUid, "sofia");
  });

  test("an answer not sent yet cannot be opened; a body is checked before anything is read", async () => {
    await w.write("kofi", 2, { text: words(3) });
    assert.equal((await w.review("rahul", "kofi", 2, { action: "open" })).body.error, "That answer hasn’t been sent yet.");
    assert.equal((await w.review("rahul", "chloe", 2, { action: "wave" })).status, 400);
    assert.equal((await w.review("rahul", "", 2, { action: "open" })).status, 400);
    const noWeek = await w.call("rahul", w.routes.review.POST, { runId: RUN.agi, answerId: ONE_BOX.id }, { course: true, body: { uid: "chloe", action: "open" } });
    assert.equal(noWeek.status, 400);
  });

  test("Reopen for edits hands the answer back and says who did it; not once feedback is sent", async () => {
    await sendFour();
    w.at("2026-11-17T09:58:00Z");
    await w.review("rahul", "chloe", 2, { action: "open" });
    w.at("2026-11-17T10:15:00Z");
    const reopened = await w.review("sofia", "chloe", 2, { action: "reopen" });
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.state.openedAt, null);
    assert.equal(stored("chloe", 2).openedAt, undefined);
    assert.equal(stored("chloe", 2).reopenedByUid, "sofia");
    // Chloe changes it; the change has its own time; the first-sent time stays.
    w.at("2026-11-17T10:20:00Z");
    assert.equal((await w.write("chloe", 2, { text: words(28) })).status, 200);
    assert.equal(new Date(stored("chloe", 2).editedAt).toISOString(), "2026-11-17T10:20:00.000Z");
    assert.equal(new Date(stored("chloe", 2).firstSentAt).toISOString(), new Date(BEFORE_DUE_2).toISOString());
    // Her own read says who reopened it, and never whether it was late.
    const own = await w.ownRowsOf("chloe", 2);
    const row = own.body.responses.find((entry) => entry.exerciseId === ONE_BOX.id);
    assert.equal(row.written.reopened.byName, "Sofia");
    assert.doesNotMatch(JSON.stringify(own.body), /late/i);
    // Feedback, then no reopening.
    await w.review("rahul", "chloe", 2, { action: "feedback", levels: w.levels(), comment: "Clear." });
    const refused = await w.review("rahul", "chloe", 2, { action: "reopen" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "Feedback has been sent on this answer, so it stays as it was sent.");
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
    const feedback = stored("chloe", 2).feedback;
    assert.deepEqual(feedback.levels, [
      { row: "A clear view", level: "Strong", descriptor: "States a view someone could dispute" },
      { row: "Reasons", level: "Solid", descriptor: "Gives reasons from the week" },
      { row: "The best objection", level: "Solid", descriptor: "Names one" },
      { row: "So what", level: "Not yet", descriptor: "No link to action" },
    ]);
    assert.equal(feedback.comment, "Clear steps. Say why.");
    assert.equal(feedback.byUid, "rahul");
    assert.equal(new Date(feedback.sentAt).toISOString(), "2026-11-17T10:05:00.000Z");
    // Never a mark, a score or a total, anywhere on the row.
    assert.doesNotMatch(JSON.stringify(stored("chloe", 2)), /"(?:score|mark|marks|total|points)"/);
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
    const again = await w.review("sofia", "chloe", 2, { action: "feedback", levels: w.levels(), comment: "More." });
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
  });

  test("a message that does not go undoes nothing, and the page is told", async () => {
    await sendFour();
    w.world.mailFate = () => "fail";
    const sent = await w.review("rahul", "chloe", 2, { action: "feedback", levels: w.levels(), comment: "Kept." });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.emailed, false);
    assert.equal(stored("chloe", 2).feedback.comment, "Kept.");
  });
});

// ---------------------------------------------------------------------------
// Late: shown to the answer's readers, from the group's own due moment
// ---------------------------------------------------------------------------

describe("Late, from the group's own calendar, and only for its readers", () => {
  test("first sent after the due moment is late; a cancelled session moves the due moment to the next one", async () => {
    await sendFour();
    const page = await w.writtenPage("rahul", { week: "2" });
    const model = page.element.props.model;
    const late = Object.fromEntries([...model.toGive, ...model.feedbackSent].map((person) => [person.uid, person.late]));
    assert.deepEqual(late, { chloe: false, farah: true });
    assert.match(page.text, /Farah Hussain Sent Tue 17 Nov, 12pm Late/);

    // Group B's week 2 session cancelled: the work is due by the day before the next one.
    w.reset();
    const group = w.world.db.read(`courseGroups/${B}`);
    w.world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { ...(group.sessionChanges ?? {}), w02: { kind: "cancelled", reason: "Room closed.", dateKey: "2026-11-10", byUid: "rahul", at: new Date("2026-11-05T09:00:00Z") } },
    });
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
  });
});

// ---------------------------------------------------------------------------
// 4. The pages
// ---------------------------------------------------------------------------

describe("4. the pages, as the boards draw them", () => {
  test("the week page draws the written answer for a fellow: the question, the box, the count, the due line, Send and who reads it", async () => {
    const page = await w.weekPage("chloe", 2);
    inOrder(page.text, [
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
      "Send to Rahul and Sofia",
      "Rahul and Sofia see it on their group page. No email.",
      "Claudia and admins can read it too. Other fellows can’t.",
      "You can change it until Rahul or Sofia opens it.",
    ]);
    assert.match(page.html, /<label for="[^"]+" class="label">Your answer<\/label><textarea id="[^"]+" class="box answerBox" rows="8">/);
    assert.doesNotMatch(page.text, /\bLate\b|exercise/i);
  });

  test("once sent it says so and stays changeable; once opened it is read only and says who opened it; then Feedback from", async () => {
    w.at(BEFORE_DUE_2);
    await w.write("chloe", 2, { text: words(25) }, { send: true });
    w.at(NOW);
    let page = await w.weekPage("chloe", 2);
    inOrder(page.text, ["Done", "Sent Sun 8 Nov", "25 words · 20 to 40", "Sent Sun 8 Nov, 10am.", "Rahul and Sofia see it on their group page."]);
    assert.doesNotMatch(page.text, /Send to Rahul and Sofia/);
    assert.match(page.text, /1 of 2 done/, "the task that covers the written answer is done once it is sent");
    assert.doesNotMatch(page.html, /readOnly|readonly=""/);

    w.at("2026-11-17T09:58:00Z");
    await w.review("rahul", "chloe", 2, { action: "open" });
    page = await w.weekPage("chloe", 2);
    assert.match(page.text, /Rahul opened it on Tue 17 Nov at 9:58am, so it can’t change now\./);
    assert.match(page.html, /readOnly=""|readonly=""/);
    assert.doesNotMatch(page.text, /You can change it until/);

    w.at("2026-11-17T10:05:00Z");
    await w.review("rahul", "chloe", 2, { action: "feedback", levels: w.levels(), comment: "Clear." });
    page = await w.weekPage("chloe", 2);
    assert.match(page.html, /href="\/learn\/[^"]+\/weeks\/2\/feedback"[^>]*>Feedback from Rahul<\/a>/);
    assert.doesNotMatch(page.text, /\bLate\b/);
  });

  test("a facilitator writing their own answer is told it is the lead's and admins' to read; an admin reads the question with no box", async () => {
    const rahul = await w.weekPage("rahul", 2);
    inOrder(rahul.text, [
      "Due by noon, Mon 9 Nov. Claudia and admins read it and give feedback on four things",
      "Send to Claudia and admins",
      "Claudia and admins see it. No email.",
      "Nobody else on the programme can read it, your co-facilitators included.",
      "You can change it until Claudia or an admin opens it.",
    ]);
    const zach = await w.weekPage("zach", 2);
    assert.match(zach.text, /Who should keep the lamps lit, and why\?/);
    assert.doesNotMatch(zach.html, /class="box answerBox"/);
    assert.doesNotMatch(zach.text, /Send to/);
  });

  test("an answer in labelled boxes is drawn box by box, each with its label and hint, sent together", async () => {
    const page = await w.weekPage("chloe", 3);
    inOrder(page.text, ["Written answer", "Your plan for the lighthouse, in three parts.", "Your answer", "What I want to work on", "two or three sentences.", "Who I will ask", "My next step", "one line.", "0 words", "Send to Rahul and Sofia"]);
    assert.equal((page.html.match(/class="box answerBox"/g) ?? []).length, 3);
    assert.match(page.html, /<fieldset class="boxes"><legend class="label">Your answer<\/legend>/);
  });

  test("the programme page's task row reads Draft, then Sent, then Feedback from whoever gave it", async () => {
    await w.write("chloe", 3, { boxes: { "wb-what": words(5) } });
    let home = await w.programmeHome("chloe");
    assert.match(home.text, /Your written answer Draft · 5 words/);
    await w.write("chloe", 3, { boxes: { "wb-what": words(5) } }, { send: true });
    home = await w.programmeHome("chloe");
    assert.match(home.text, /Your written answer Sent Tue 17 Nov/);
    await w.review("sofia", "chloe", 3, { action: "feedback", levels: w.levels(), comment: "" });
    home = await w.programmeHome("chloe");
    assert.match(home.html, /Sent Tue 17 Nov <a href="\/learn\/[^"]+\/weeks\/3\/feedback" class="cardLink">Feedback from Sofia<\/a>/);
  });

  test("the review page: a facilitator sees their group's fellows, never a facilitator's own; grouped as the board groups them", async () => {
    await sendFour();
    await w.write("kofi", 2, { text: words(4) });
    const page = await w.writtenPage("rahul", { week: "2" });
    const model = page.element.props.model;
    assert.deepEqual(model.toGive.map((person) => person.uid), ["chloe", "farah"]);
    assert.deepEqual(model.notSent.map((person) => [person.uid, person.state]), [["kofi", "draft"]]);
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
      "Sent Sun 8 Nov, 10am",
      "Farah Hussain",
      "Sent Tue 17 Nov, 12pm",
      "Late",
      "Feedback sent",
      "0",
      "Not sent yet",
      "1",
      "Kofi Asante",
      "Draft",
      "The question · 20 to 40 words",
      "Who should keep the lamps lit, and why?",
      "Show all of it",
      "Chloe’s answer",
      "25 words · 20 to 40",
      "Sent Sun 8 Nov, 10am",
      // Before the page's own POST opens it (a GET never writes), it is still Chloe's.
      "Chloe can still change it until Rahul or Sofia opens it.",
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
    assert.doesNotMatch(page.text, /Rahul Mehta|Amara/, "his own answer and another group's are not on his page");
    assert.match(page.html, /aria-pressed="false"/);
    // Sofia, his co-facilitator, does not get his either.
    const sofia = (await w.writtenPage("sofia", { week: "2" })).element.props.model;
    assert.ok(![...sofia.toGive, ...sofia.feedbackSent, ...sofia.notSent].some((person) => person.uid === "rahul"));
  });

  test("the lead's review page gives the facilitator's own answer to the lead; the page writes nothing", async () => {
    await sendFour();
    const page = await w.leadPage("claudia", { group: B, week: "2", person: "rahul" });
    const model = page.element.props.model;
    assert.deepEqual(model.toGive.map((person) => person.uid).sort(), ["chloe", "farah", "rahul"]);
    assert.equal(model.selected.person.uid, "rahul");
    assert.equal(model.selected.role.locksOnOpen, true);
    assert.match(page.text, /Rahul Mehta’s lamp plan/);
    assert.equal(page.wrote, false, "a GET never writes: the opened stamp is the client's POST");
    // The lead's page for another programme's lead, and for a fellow: nothing of it.
    const tess = await w.leadPage("tess", { group: B, week: "2" });
    assert.doesNotMatch(tess.text, /lamp plan/);
    // Signed out: the admissions tree's own gate sends them away before the page (the app's layout reaches /login first).
    const signedOut = await w.leadPage(null);
    assert.ok(signedOut.to && !/lamp plan/.test(signedOut.text), JSON.stringify(signedOut.to));
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
    await sendFour();
    w.at("2026-11-17T10:05:00Z");
    await w.review("rahul", "farah", 2, { action: "feedback", levels: w.levels("Strong"), comment: "Good steps." });
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
      "30 words · sent Tue 17 Nov, 12pm",
      "Rahul opened it on Tue 17 Nov at 10:05am, so it can’t change now.",
    ]);
    assert.doesNotMatch(page.text, /\bLate\b|\bmark\b(?!s)/);
    // Before any feedback: who gives it. Before sending: the way back to the week.
    assert.match((await w.feedbackPage("chloe", 2)).text, /No feedback yet\. Rahul and Sofia give feedback once they’ve read it\./);
    assert.match((await w.feedbackPage("kofi", 2)).text, /You haven’t sent this answer yet\. It’s on the week’s page\./);
    assert.match((await w.feedbackPage("rahul", 2)).text, /No feedback yet\. Claudia and admins give feedback once they’ve read it\./);
    // Nobody reads anybody else's here: Chloe's page is Chloe's.
    assert.doesNotMatch((await w.feedbackPage("chloe", 2)).text, /Good steps/);
    for (const who of ["claudia", "tess", "sam", "una"]) assert.ok((await w.feedbackPage(who, 2)).to, who);
  });

  test("the group page's review queue lists what waits, opened or not; Home counts it; the lead's tab lists each group", async () => {
    await sendFour();
    await w.review("rahul", "farah", 2, { action: "open" });
    const group = await w.groupPage("rahul");
    inOrder(group.text, ["Review queue", "Written answers", "2 to give feedback on", "Chloe Nguyen", "Sent Sun 8 Nov, 10am", "Give feedback", "Farah Hussain", "Sent Tue 17 Nov, 12pm", "Give feedback"]);
    assert.match(group.html, /href="\/learn\/[^"]+\/group\/[^"]+\/written\?week=2&amp;person=chloe"/);
    assert.doesNotMatch(group.text.slice(group.text.indexOf("Review queue"), group.text.indexOf("Review queue") + 400), /Rahul Mehta/);
    const summary = await w.summary("rahul");
    assert.equal(summary.body.writtenToGive, 2);
    const home = await w.home("rahul");
    assert.match(home.text, /2 to give feedback on Give feedback/);
    // The lead's Attendance tab: a line per group, the facilitator's own answer counted for the lead.
    const tab = await w.attendanceTab("claudia");
    assert.match(tab.text, /Written answers .*Group B 3 to give feedback on Give feedback/);
    // Feedback sent takes it off the queue.
    await w.review("rahul", "chloe", 2, { action: "feedback", levels: w.levels(), comment: "x" });
    assert.equal((await w.summary("rahul")).body.writtenToGive, 1);
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
  test("finishing counts written answers sent, out of the run's, through the one reader", async () => {
    await sendFour();
    const { readRunRecords } = await w.loadTs("lib/courses/programmeAttendance.ts");
    const records = await readRunRecords(w.world.courseDb, RUN.agi);
    const tallies = await w.lib.whoFinished.readExerciseTallies(w.world.courseDb, records);
    // Group B is set week 1's exercise and weeks 2 and 3's written answers.
    assert.deepEqual(tallies.get("chloe"), { done: 2, of: 3 }, "week 1's summer answer and week 2's written answer");
    assert.deepEqual(tallies.get("farah"), { done: 1, of: 3 });
    assert.deepEqual(tallies.get("kofi"), { done: 1, of: 3 }, "Kofi's approved summer answer");
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
  });

  test("words are counted as Worksheets count them", () => {
    for (const text of ["", "  ", "one", "one two", " spaced   out\n\nlines\tand tabs ", "it’s hyphen-ated, 12 3"]) {
      assert.equal(w.lib.model.countWords(text), w.lib.worksheets.countWords(text), JSON.stringify(text));
    }
  });

  test("the email's words come from records, and it is the transactional kind with no feedback in it", () => {
    const words = w.lib.email.writtenFeedbackWords({ weekNumber: 3, byFirstName: "Rahul", answerName: "your threat model" });
    assert.deepEqual(words, {
      subject: "Feedback on your week 3 written answer",
      lead: "Rahul has left feedback on your threat model.",
      buttonLabel: "Read your feedback",
    });
    assert.equal(w.lib.email.feedbackPageUrl("https://naisi.invalid", RUN.agi, 3), `https://naisi.invalid/learn/${encodeURIComponent(RUN.agi)}/weeks/3/feedback`);
    assert.equal(w.lib.model.answerNameOf("Your threat model, the week’s written answer"), "your threat model");
    assert.equal(w.lib.model.answerNameOf("Part four"), "your written answer");
  });

  test("never the word exercise for the written answer, and no dash, in its words", () => {
    const words = w.lib.words;
    const all = Object.values(words)
      .map((value) => (typeof value === "string" ? value : ""))
      .join(" ");
    assert.doesNotMatch(all, /exercise/i);
    assert.doesNotMatch(all, /[–—]/);
    for (const sample of [
      words.dueLineWords("dayBefore", { dateKey: "2026-11-16" }, { todayKey: "2026-11-16", dayBeforeTime: null, first: false }),
      words.dueLineWords("dayBefore", { dateKey: "2026-11-02" }, { todayKey: "2026-11-01", dayBeforeTime: "12:00", first: false }),
      words.dueLineWords("dayBefore", null, { todayKey: "2026-11-01", dayBeforeTime: "12:00", first: false }),
    ]) assert.doesNotMatch(sample, /exercise|[–—]/i);
    assert.equal(words.dueLineWords("dayBefore", { dateKey: "2026-11-16" }, { todayKey: "2026-11-16", dayBeforeTime: null, first: false }), "Due by the end of today, Mon 16 Nov.");
    assert.equal(words.dueLineWords("dayBefore", { dateKey: "2026-11-02" }, { todayKey: "2026-11-01", dayBeforeTime: "12:00", first: false }), "Due by noon, Mon 2 Nov.");
  });
});
